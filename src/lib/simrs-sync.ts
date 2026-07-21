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
import { getKunjunganByTanggal, getPasienByNoRm, getSimrsConfig, type SimrsClientConfig } from '@/lib/simrs-client'
import { pastikanPersonDariRm } from '@/lib/person-identity'
import type { PrismaClient } from '@/generated/prisma/client'
import { randomUUID } from 'crypto'

export interface SyncResult {
  tanggal:      string
  jumlah_baru:  number     // kunjungan (visit) BARU dibuat
  jumlah_update: number    // kunjungan diperbarui
  person_disegarkan?: number  // berapa Person yang demografinya di-fetch ulang
  error?:       string
}

// Ambang "basi" untuk demografi Person. Person yang last_simrs_sync_at-nya lebih
// lama dari ini akan di-fetch ulang saat muncul lagi di feed kunjungan — menutup
// kasus pasien ganti nomor/alamat, tanpa fetch person tiap kunjungan.
const AMBANG_BASI_MS = 30 * 86_400_000

// ──────────────────────────────────────────────
// Sinkronisasi satu tanggal
// ──────────────────────────────────────────────

export async function syncTanggal(tenantSlug: string, tanggal: string, mode: 'cron' | 'manual' | 'backfill' = 'cron'): Promise<SyncResult> {
  const logId    = randomUUID()
  const startedAt = new Date()

  const db     = await getTenantDb(tenantSlug)
  const simrsCfg = await getSimrsConfig(masterDb, tenantSlug)

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

  let jumlah_baru   = 0   // kunjungan (visit) BARU
  let jumlah_update = 0   // kunjungan diperbarui

  try {
    const kunjungans = await getKunjunganByTanggal(simrsCfg, tanggal)

    // Person penyintas yang muncul hari ini → kandidat pengecekan demografi.
    // Dikunci per personId (bukan per baris kunjungan): pasien dengan banyak kunjungan
    // hari itu cukup dicek sekali. no_rm penyintas disimpan untuk fetch demografinya.
    const munculHariIni = new Map<string, string>()

    for (const k of kunjungans) {
      if (!k.kunjungan_id) continue

      // Pastikan ada Person untuk no_rm ini. pastikanPersonDariRm mengikuti rantai
      // penggabungan (kalau RM pernah dilebur → mendarat di penyintas) dan membuat
      // baris RINTISAN kalau pasiennya belum ada — kunjungan tidak pernah hilang
      // gara-gara data pasien belum tiba. Demografi TIDAK diisi di sini; itu tugas
      // fetch selektif ke endpoint Pasien di bawah (feed kunjungan sudah ramping).
      const person = await pastikanPersonDariRm(db as any, tenantSlug, k.no_rm)
      if (person.no_rm) munculHariIni.set(person.id, person.no_rm)

      // Upsert SimrsVisit. Unique key gabungan [person_id, simrs_visit_id]. SimrsVisit
      // TIDAK punya kolom tenant_slug (ikut lewat relasi Person) — jangan dikirim.
      const existing = await db.simrsVisit.findUnique({
        where: { person_id_simrs_visit_id: { person_id: person.id, simrs_visit_id: k.kunjungan_id } },
        select: { id: true },
      })
      const visitData = {
        person_id:        person.id,
        no_rm_sumber:     k.no_rm,   // RM mentah, jejak untuk penautan ulang jika digabung
        tanggal:          new Date(k.tanggal),
        poli:             k.poli ?? null,
        unit:             k.unit || 'Rawat Jalan',  // unit non-null di skema
        dokter:           k.dokter ?? null,
        diagnosa_icd:     k.diagnosa_icd ?? null,
        diagnosa_nama:    k.diagnosa_nama ?? null,
        diagnosa_sekunder: k.diagnosa_sekunder ?? [],
        tindakan_kode:    k.tindakan_kode ?? null,
        jadwal_kontrol:   k.jadwal_kontrol ? new Date(k.jadwal_kontrol) : null,
        status_kunjungan: k.status_kunjungan ?? null,
        jenis_pembayaran: k.jenis_pembayaran ?? null,   // penjamin: atribut KUNJUNGAN
        nama_instansi:    k.nama_instansi ?? null,
        kode_instansi:    k.kode_instansi ?? null,
        aktif:            true,
      }

      if (existing) {
        await db.simrsVisit.update({ where: { id: existing.id }, data: visitData })
        jumlah_update++
      } else {
        await db.simrsVisit.create({ data: { id: randomUUID(), simrs_visit_id: k.kunjungan_id, ...visitData } })
        jumlah_baru++
      }
    }

    // Fetch demografi SELEKTIF — inti hemat-transfer Opsi A. Hanya person yang masih
    // rintisan atau datanya basi (belum pernah / >30 hari) yang di-fetch ke endpoint
    // Pasien. Pasien rutin yang datanya sudah segar TIDAK di-fetch ulang tiap kunjungan.
    const person_disegarkan = await segarkanPersonYangPerlu(db, simrsCfg, munculHariIni)

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

    return { tanggal, jumlah_baru, jumlah_update, person_disegarkan }

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
// Fetch demografi Person dari endpoint Pasien
// ──────────────────────────────────────────────

/**
 * Ambil demografi SATU pasien dari SIMRS (endpoint Pasien by no_rm) dan tulis ke
 * baris Person. Sumber tunggal untuk memperbarui demografi — dipakai cron (selektif)
 * DAN tombol "Segarkan dari SIMRS" manual. Mengembalikan true jika berhasil menulis.
 *
 * no_rm SENGAJA tidak ikut ditulis (baris penyintas mempertahankan RM-nya), dan
 * kontak (no_hp) hanya ditimpa kalau SIMRS mengirim nilai — jangan clobber nomor
 * hasil save-contact dari chat dengan null.
 */
export async function segarkanPersonDariSimrs(
  db: PrismaClient, cfg: SimrsClientConfig, personId: string, noRm: string,
): Promise<boolean> {
  const p = await getPasienByNoRm(cfg, noRm)
  if (!p) return false

  const noHpAlt = (p.no_hp_alternatif && p.no_hp_alternatif !== p.no_hp) ? p.no_hp_alternatif : null
  await db.person.update({
    where: { id: personId },
    data: {
      is_rintisan:        false,   // baris rintisan kini terisi demografi asli
      is_pasien_simrs:    true,
      sumber:             'SIMRS',
      name:               p.nama,
      tanggal_lahir:      p.tanggal_lahir ? new Date(p.tanggal_lahir) : undefined,
      jenis_kelamin:      p.jenis_kelamin ?? undefined,
      agama:              p.agama ?? undefined,
      nik:                p.nik || undefined,   // dipakai deteksi duplikat, lihat person-merge.ts
      alamat:             p.alamat || undefined,
      kota:               p.kota || undefined,
      kecamatan:          p.kecamatan || undefined,
      no_bpjs:            p.no_bpjs || undefined,
      no_hp:              p.no_hp || undefined,
      no_hp_2:            noHpAlt || undefined,
      last_simrs_sync_at: new Date(),
    },
  })
  return true
}

/**
 * Dari kumpulan person yang muncul di feed hari ini, fetch demografi HANYA untuk
 * yang perlu: masih rintisan, ATAU last_simrs_sync_at belum ada / lebih lama dari
 * AMBANG_BASI_MS. Mengembalikan berapa person yang benar-benar disegarkan.
 */
async function segarkanPersonYangPerlu(
  db: PrismaClient, cfg: SimrsClientConfig, munculHariIni: Map<string, string>,
): Promise<number> {
  const ids = Array.from(munculHariIni.keys())
  if (ids.length === 0) return 0

  const rows = await db.person.findMany({
    where:  { id: { in: ids } },
    select: { id: true, is_rintisan: true, last_simrs_sync_at: true },
  })
  const sekarang = Date.now()

  let n = 0
  for (const r of rows) {
    const basi = r.is_rintisan
      || !r.last_simrs_sync_at
      || (sekarang - r.last_simrs_sync_at.getTime()) > AMBANG_BASI_MS
    if (!basi) continue

    const noRm = munculHariIni.get(r.id)
    if (!noRm) continue
    if (await segarkanPersonDariSimrs(db, cfg, r.id, noRm)) n++
  }
  return n
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
