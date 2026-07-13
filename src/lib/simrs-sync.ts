/**
 * SIMRS Sync Engine
 *
 * Menjalankan sinkronisasi data kunjungan SIMRS ke DB lokal CRM.
 * Dipanggil oleh:
 *  - Cron job harian (via BullMQ scheduler)
 *  - Manual trigger dari API POST /api/[slug]/simrs/sync
 *
 * Strategi:
 *  - Upsert SimrsVisit by simrs_visit_id (idempotent, aman di-retry)
 *  - Upsert Person by no_rm (buat baru jika belum ada)
 *  - Tulis SimrsSyncLog untuk tracking + catchup
 *  - Jika ada gap tanggal (cron gagal), backfill otomatis
 */

import { masterDb, getTenantDb } from '@/lib/tenant'
import { getKunjunganByTanggal, type SimrsClientConfig } from '@/lib/simrs-client'
import { randomUUID } from 'crypto'

export interface SyncResult {
  tanggal:      string
  jumlah_baru:  number
  jumlah_update: number
  error?:       string
}

// ──────────────────────────────────────────────
// Ambil config SIMRS dari master DB
// ──────────────────────────────────────────────

async function getSimrsConfig(tenantSlug: string): Promise<SimrsClientConfig | null> {
  const tenant = await masterDb.tenant.findUnique({
    where:  { slug: tenantSlug },
    select: { config: { select: { simrs_base_url: true, simrs_api_key: true } } },
  })

  const cfg = tenant?.config
  const MOCK = process.env.SIMRS_MOCK === 'true'

  // Mock mode: tidak perlu base_url/api_key
  if (MOCK) return { base_url: 'mock', api_key: 'mock' }

  if (!cfg?.simrs_base_url || !cfg?.simrs_api_key) return null
  return { base_url: cfg.simrs_base_url, api_key: cfg.simrs_api_key }
}

// ──────────────────────────────────────────────
// Sinkronisasi satu tanggal
// ──────────────────────────────────────────────

export async function syncTanggal(tenantSlug: string, tanggal: string, mode: 'cron' | 'manual' = 'cron'): Promise<SyncResult> {
  const logId    = randomUUID()
  const startedAt = new Date()

  const db     = await getTenantDb(tenantSlug)
  const simrsCfg = await getSimrsConfig(tenantSlug)

  if (!simrsCfg) {
    const err = 'Konfigurasi SIMRS belum diisi (base_url / api_key)'
    await db.simrsSyncLog.create({
      data: {
        id: logId, tenant_slug: tenantSlug,
        tanggal_data: new Date(tanggal),
        status: 'FAILED', jumlah_baru: 0, jumlah_update: 0,
        mode, error_msg: err, started_at: startedAt, finished_at: new Date(),
      },
    })
    return { tanggal, jumlah_baru: 0, jumlah_update: 0, error: err }
  }

  // Tandai RUNNING
  await db.simrsSyncLog.create({
    data: {
      id: logId, tenant_slug: tenantSlug,
      tanggal_data: new Date(tanggal),
      status: 'RUNNING', jumlah_baru: 0, jumlah_update: 0,
      mode, started_at: startedAt,
    },
  })

  let jumlah_baru   = 0
  let jumlah_update = 0

  try {
    const kunjungans = await getKunjunganByTanggal(simrsCfg, tanggal)

    for (const k of kunjungans) {
      // 1. Upsert Person by no_rm
      const existingPerson = await db.person.findFirst({
        where: { tenant_slug: tenantSlug, no_rm: k.no_rm },
        select: { id: true },
      })

      let personId: string

      if (existingPerson) {
        // Update data demografi jika ada yang baru
        await db.person.update({
          where: { id: existingPerson.id },
          data: {
            name:          k.nama_pasien,
            tanggal_lahir: k.tanggal_lahir ? new Date(k.tanggal_lahir) : undefined,
            jenis_kelamin: k.jenis_kelamin ?? undefined,
            agama:         k.agama ?? undefined,
            is_pasien_simrs: true,
            sumber:        'SIMRS',
          },
        })
        personId = existingPerson.id
      } else {
        // Buat person baru dari data SIMRS
        const newPerson = await db.person.create({
          data: {
            id:              randomUUID(),
            tenant_slug:     tenantSlug,
            no_rm:           k.no_rm,
            name:            k.nama_pasien,
            tanggal_lahir:   k.tanggal_lahir ? new Date(k.tanggal_lahir) : null,
            jenis_kelamin:   k.jenis_kelamin ?? null,
            agama:           k.agama ?? null,
            sumber:          'SIMRS',
            is_pasien_simrs: true,
            aktif:           true,
          },
        })
        personId = newPerson.id

        // Simpan nomor HP jika ada
        if (k.no_hp) {
          await db.personContact.create({
            data: {
              id:         randomUUID(),
              person_id:  personId,
              jenis:      'WA',
              nilai:      k.no_hp,
              is_primary: true,
            },
          }).catch(() => {})  // ignore duplicate
        }

        jumlah_baru++
      }

      // 2. Upsert SimrsVisit by simrs_visit_id
      if (k.kunjungan_id) {
        const existing = await db.simrsVisit.findUnique({
          where: { simrs_visit_id: k.kunjungan_id },
          select: { id: true },
        })

        const visitData = {
          person_id:        personId,
          tenant_slug:      tenantSlug,
          tanggal:          new Date(k.tanggal),
          poli:             k.poli ?? null,
          unit:             k.unit ?? null,
          dokter:           k.dokter ?? null,
          diagnosa_icd:     k.diagnosa_icd ?? null,
          diagnosa_nama:    k.diagnosa_nama ?? null,
          diagnosa_sekunder: k.diagnosa_sekunder ?? [],
          tindakan_kode:    k.tindakan_kode ?? null,
          jadwal_kontrol:   k.jadwal_kontrol ? new Date(k.jadwal_kontrol) : null,
          status_kunjungan: k.status_kunjungan ?? null,
          aktif:            true,
        }

        if (existing) {
          await db.simrsVisit.update({ where: { id: existing.id }, data: visitData })
          jumlah_update++
        } else {
          await db.simrsVisit.create({
            data: { id: randomUUID(), simrs_visit_id: k.kunjungan_id, ...visitData },
          })
        }
      }
    }

    // Tandai DONE
    await db.simrsSyncLog.update({
      where: { id: logId },
      data: {
        status:       'DONE',
        jumlah_baru,
        jumlah_update,
        finished_at:  new Date(),
      },
    })

    return { tanggal, jumlah_baru, jumlah_update }

  } catch (e: any) {
    await db.simrsSyncLog.update({
      where: { id: logId },
      data: {
        status:      'FAILED',
        jumlah_baru,
        jumlah_update,
        error_msg:   e.message,
        finished_at: new Date(),
      },
    })
    return { tanggal, jumlah_baru, jumlah_update, error: e.message }
  }
}

// ──────────────────────────────────────────────
// Catchup — backfill tanggal yang terlewat
// ──────────────────────────────────────────────

export async function syncWithCatchup(tenantSlug: string, mode: 'cron' | 'manual' = 'cron'): Promise<SyncResult[]> {
  const db = await getTenantDb(tenantSlug)

  // Cari tanggal sync terakhir yang DONE
  const lastDone = await db.simrsSyncLog.findFirst({
    where:   { tenant_slug: tenantSlug, status: 'DONE' },
    orderBy: { tanggal_data: 'desc' },
    select:  { tanggal_data: true },
  })

  const today  = new Date()
  const kemarin = new Date(today)
  kemarin.setDate(today.getDate() - 1)

  // Tanggal default: kemarin (cron jalan malam hari, sync data hari sebelumnya)
  const targetTanggal = kemarin

  // Jika ada gap lebih dari 1 hari, backfill (maks 7 hari ke belakang)
  const dates: string[] = []

  if (lastDone) {
    const last     = new Date(lastDone.tanggal_data)
    const diffDays = Math.floor((targetTanggal.getTime() - last.getTime()) / 86_400_000)

    // Backfill hingga 7 hari
    const backfillDays = Math.min(diffDays, 7)
    for (let i = backfillDays; i >= 1; i--) {
      const d = new Date(targetTanggal)
      d.setDate(targetTanggal.getDate() - (i - 1))
      if (d > last) {
        dates.push(d.toISOString().slice(0, 10))
      }
    }
  } else {
    // Pertama kali sync — ambil kemarin saja
    dates.push(targetTanggal.toISOString().slice(0, 10))
  }

  const results: SyncResult[] = []
  for (const tanggal of dates) {
    // Skip jika sudah DONE untuk tanggal ini
    const alreadyDone = await db.simrsSyncLog.findFirst({
      where: { tenant_slug: tenantSlug, tanggal_data: new Date(tanggal), status: 'DONE' },
    })
    if (alreadyDone) continue

    const result = await syncTanggal(tenantSlug, tanggal, mode)
    results.push(result)
  }

  return results
}

// ──────────────────────────────────────────────
// Status terakhir (untuk UI)
// ──────────────────────────────────────────────

export async function getLastSyncStatus(tenantSlug: string) {
  const db = await getTenantDb(tenantSlug)

  const last = await db.simrsSyncLog.findFirst({
    where:   { tenant_slug: tenantSlug },
    orderBy: { started_at: 'desc' },
  })

  return last
}
