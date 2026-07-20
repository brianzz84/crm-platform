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
import { cariPersonByRm } from '@/lib/person-identity'
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

export async function syncTanggal(tenantSlug: string, tanggal: string, mode: 'cron' | 'manual' | 'backfill' = 'cron'): Promise<SyncResult> {
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
      // 1. Cari Person lewat no_rm. cariPersonByRm() mengikuti rantai penggabungan,
      //    jadi kalau RM ini pernah dilebur ke orang lain, datanya mendarat di baris
      //    yang BERTAHAN — bukan menghidupkan lagi baris nisan. Ini penting karena
      //    SIMRS tidak tahu soal penggabungan kita dan akan terus memakai RM lama.
      const existingPerson = await cariPersonByRm(db as any, tenantSlug, k.no_rm)

      let personId: string

      // Nomor HP alternatif dari SIMRS hanya ditulis ke no_hp_2 kalau beda dari no_hp utama
      const noHpAlt = (k.no_hp_alternatif && k.no_hp_alternatif !== k.no_hp) ? k.no_hp_alternatif : null

      if (existingPerson) {
        // Update data demografi jika ada yang baru.
        // no_rm SENGAJA tidak ikut ditulis: kalau kita sampai di sini lewat rantai
        // penggabungan, RM penyintas berbeda dari k.no_rm dan tidak boleh tertimpa.
        await db.person.update({
          where: { id: existingPerson.id },
          data: {
            // Baris rintisan (dibuat saat kunjungan tiba duluan) kini terisi data asli
            is_rintisan:      false,
            name:             k.nama_pasien,
            tanggal_lahir:    k.tanggal_lahir ? new Date(k.tanggal_lahir) : undefined,
            jenis_kelamin:    k.jenis_kelamin ?? undefined,
            agama:            k.agama ?? undefined,
            is_pasien_simrs:  true,
            sumber:           'SIMRS',
            // Kontak: satu-satunya sumber kebenaran adalah kolom Person.no_hp/no_hp_2.
            // Hanya ditulis kalau SIMRS mengirim nilai — kalau kosong, jangan timpa
            // nomor yang sudah tersimpan (mis. hasil save contact dari chat).
            no_hp:            k.no_hp || undefined,
            no_hp_2:          noHpAlt || undefined,
            // Penjamin TIDAK ditulis ke person — itu atribut kunjungan (lihat di bawah,
            // saat upsert SimrsVisit). Menulisnya ke sini berarti menimpa dengan penjamin
            // kunjungan terakhir yang diproses = arbitrer & menyesatkan.
          },
        })
        personId = existingPerson.id
      } else {
        // Buat person baru dari data SIMRS
        const newPerson = await db.person.create({
          data: {
            id:               randomUUID(),
            tenant_slug:      tenantSlug,
            no_rm:            k.no_rm,
            name:             k.nama_pasien,
            no_hp:            k.no_hp || null,
            no_hp_2:          noHpAlt,
            tanggal_lahir:    k.tanggal_lahir ? new Date(k.tanggal_lahir) : null,
            jenis_kelamin:    k.jenis_kelamin ?? null,
            agama:            k.agama ?? null,
            sumber:           'SIMRS',
            is_pasien_simrs:  true,
            aktif:            true,
            // Penjamin tidak di person — hanya di kunjungan (upsert SimrsVisit di bawah).
          },
        })
        personId = newPerson.id
        jumlah_baru++
      }

      // 2. Upsert SimrsVisit by simrs_visit_id — unique key sebenarnya gabungan
      //    [person_id, simrs_visit_id] (simrs_visit_id sendirian bukan @unique di
      //    schema), findUnique dengan where datar sebelumnya selalu gagal di runtime.
      if (k.kunjungan_id) {
        const existing = await db.simrsVisit.findUnique({
          where: { person_id_simrs_visit_id: { person_id: personId, simrs_visit_id: k.kunjungan_id } },
          select: { id: true },
        })

        // Catatan: SimrsVisit TIDAK punya kolom tenant_slug — tenant-nya ikut lewat
        // relasi ke Person. Mengirimkannya bikin Prisma melempar 'Unknown argument'
        // saat runtime (tidak tertangkap tsc karena objek ini dipakai lewat spread).
        const visitData = {
          person_id:        personId,
          // RM mentah dari SIMRS, disimpan di sebelah person_id hasil resolusi. Kalau
          // orangnya belakangan digabung (atau resolusinya keliru), inilah satu-satunya
          // jejak untuk menautkan ulang kunjungan ini.
          no_rm_sumber:     k.no_rm,
          tanggal:          new Date(k.tanggal),
          poli:             k.poli ?? null,
          unit:             k.unit || 'Rawat Jalan',  // unit wajib diisi (non-null di skema)
          dokter:           k.dokter ?? null,
          diagnosa_icd:     k.diagnosa_icd ?? null,
          diagnosa_nama:    k.diagnosa_nama ?? null,
          diagnosa_sekunder: k.diagnosa_sekunder ?? [],
          tindakan_kode:    k.tindakan_kode ?? null,
          jadwal_kontrol:   k.jadwal_kontrol ? new Date(k.jadwal_kontrol) : null,
          status_kunjungan: k.status_kunjungan ?? null,
          jenis_pembayaran: k.jenis_pembayaran ?? null,
          nama_instansi:    k.nama_instansi ?? null,
          kode_instansi:    k.kode_instansi ?? null,
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

export async function syncWithCatchup(tenantSlug: string, mode: 'cron' | 'manual' | 'backfill' = 'cron'): Promise<SyncResult[]> {
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
