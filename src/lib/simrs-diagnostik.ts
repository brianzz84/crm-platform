/**
 * Tools diagnostik API SIMRS — dipanggil dari Pengaturan > Integrasi SIMRS oleh
 * ADMIN_IT/SUPER_ADMIN untuk menguji koneksi & memvalidasi bentuk data SEBELUM
 * sync otomatis dinyalakan untuk data pasien sungguhan.
 *
 * Dua batasan desain yang sengaja, jangan dilonggarkan tanpa alasan kuat:
 *
 * 1. HANYA endpoint yang sudah dikonfigurasi tenant (simrs_base_url tersimpan) yang
 *    bisa dipanggil — bukan Postman bebas dengan kolom URL. Postman bebas berarti
 *    API key tenant bisa dipakai memanggil server siapa saja (celah SSRF).
 * 2. Respons MENTAH dari SIMRS tidak pernah disimpan ke log — bisa berisi PII
 *    pasien sungguhan (nama, HP, NIK). Yang disimpan hanya ringkasan validasi
 *    (field apa yang hilang/asing), cukup untuk audit "siapa menguji apa kapan"
 *    tanpa menimbun data pasien baru di luar tabel yang sudah diatur aksesnya.
 */
import type { PrismaClient } from '../generated/prisma/client'
import {
  getSimrsConfig, panggilKunjunganMentah, panggilPasienMentah, SIMRS_PER_PAGE,
  type HasilPanggilanMentah,
} from './simrs-client'

export type JenisDiagnostik = 'kunjungan' | 'pasien'

// Field WAJIB: tanpa ini, satu baris tidak bisa diproses sync sama sekali.
// Kunjungan RAMPING — tidak lagi memuat demografi pasien (pindah ke endpoint Pasien).
export const WAJIB_KUNJUNGAN = ['kunjungan_id', 'no_rm', 'tanggal'] as const
export const WAJIB_PASIEN    = ['no_rm', 'nama'] as const

// Field PENTING: bisa diproses tanpanya, tapi fitur tertentu jadi pincang kalau kosong.
export const PENTING_KUNJUNGAN = ['tindakan_kode', 'unit', 'status_kunjungan'] as const
export const PENTING_PASIEN    = ['no_hp', 'nik'] as const

// RENCANA KONTROL — endpoint ketiga (jadwal kunjungan yang belum terjadi).
export const WAJIB_RENCANA   = ['rencana_id', 'no_rm', 'tanggal', 'sumber'] as const
export const PENTING_RENCANA = ['unit'] as const

// Semua field yang KITA KENAL — di luar ini dianggap "asing" (bukan berarti salah,
// cuma berarti kita belum pakai; berguna buat ketahuan kalau IT kirim nama field beda).
// HARUS cocok dengan interface SimrsKunjungan/SimrsPasien di simrs-client.ts — kalau
// menambah/menghapus field di sana, sesuaikan di sini juga (kalau lupa, tools
// diagnostik akan salah menandai field "asing"/"hilang").
export const DIKENAL_KUNJUNGAN = [
  ...WAJIB_KUNJUNGAN, ...PENTING_KUNJUNGAN,
  'poli', 'dokter', 'diagnosa_icd', 'diagnosa_nama', 'diagnosa_sekunder',
  'jenis_pembayaran', 'nama_instansi', 'kode_instansi',   // penjamin: atribut kunjungan
]
export const DIKENAL_PASIEN = [
  ...WAJIB_PASIEN, ...PENTING_PASIEN,
  'tanggal_lahir', 'jenis_kelamin', 'no_hp_alternatif', 'agama', 'alamat', 'kota', 'kecamatan',
  'no_bpjs',   // penjamin TIDAK di sini — itu per-kunjungan
]
export const DIKENAL_RENCANA = [
  ...WAJIB_RENCANA, ...PENTING_RENCANA,
  'poli', 'status',
]

export interface RingkasanValidasiField {
  jumlahBaris:       number
  fieldHilang:       { field: string; jumlahBaris: number }[]  // field WAJIB tidak ada sama sekali di baris
  fieldKosongPenting: { field: string; jumlahBaris: number }[] // field PENTING ada tapi null/kosong
  fieldAsing:        string[]                                   // key di respons yang tidak kita kenali
}

export function validasiBaris(
  baris: Record<string, unknown>[],
  wajib: readonly string[],
  penting: readonly string[],
  dikenal: readonly string[],
): RingkasanValidasiField {
  const hilangCount  = new Map<string, number>()
  const kosongCount  = new Map<string, number>()
  const asingSet     = new Set<string>()

  for (const row of baris) {
    for (const f of wajib) {
      if (!(f in row) || row[f] === undefined) hilangCount.set(f, (hilangCount.get(f) ?? 0) + 1)
    }
    for (const f of penting) {
      const ada = f in row
      const kosong = ada && (row[f] === null || row[f] === '' || row[f] === undefined)
      if (!ada || kosong) kosongCount.set(f, (kosongCount.get(f) ?? 0) + 1)
    }
    for (const key of Object.keys(row)) {
      if (!dikenal.includes(key)) asingSet.add(key)
    }
  }

  return {
    jumlahBaris:        baris.length,
    fieldHilang:        Array.from(hilangCount,  ([field, jumlahBaris]) => ({ field, jumlahBaris })),
    fieldKosongPenting: Array.from(kosongCount,  ([field, jumlahBaris]) => ({ field, jumlahBaris })),
    fieldAsing:         Array.from(asingSet),
  }
}

export interface HasilDiagnostik {
  berhasil:   boolean
  statusHttp: number | null
  durasiMs:   number
  errorPesan: string | null
  raw:        unknown                    // ditampilkan sekali ke layar, TIDAK disimpan
  validasi:   RingkasanValidasiField | null
}

const BATAS_UJI_PER_5_MENIT = 10

/**
 * Jalankan satu uji diagnostik. Melempar error kalau melebihi batas laju —
 * pemanggil (route API) bertanggung jawab menampilkannya sebagai pesan yang jelas.
 */
export async function jalankanDiagnostikSimrs(
  tenantDb:   PrismaClient,
  masterDb:   PrismaClient,
  tenantSlug: string,
  jenis:      JenisDiagnostik,
  parameter:  { tanggal: string } | { no_rm: string },
  olehUserId: string,
): Promise<HasilDiagnostik> {
  const limaMenitLalu = new Date(Date.now() - 5 * 60_000)
  const jumlahBaruBaru = await tenantDb.simrsDiagnostikLog.count({
    where: { tenant_slug: tenantSlug, created_at: { gte: limaMenitLalu } },
  })
  if (jumlahBaruBaru >= BATAS_UJI_PER_5_MENIT) {
    throw new Error(
      `Terlalu sering menguji (maks ${BATAS_UJI_PER_5_MENIT} kali per 5 menit). ` +
      `Ini bukan soal keamanan kita, tapi menghormati kapasitas server SIMRS tim IT — tunggu sebentar.`
    )
  }

  const cfg = await getSimrsConfig(masterDb, tenantSlug)
  if (!cfg) throw new Error('Konfigurasi SIMRS belum diisi (URL / API key) — isi dulu di form di atas.')

  const mulai = Date.now()
  let panggilan: HasilPanggilanMentah
  let validasi: RingkasanValidasiField | null = null
  let jumlahBarisRespons: number | null = null

  if (jenis === 'kunjungan') {
    const p = parameter as { tanggal: string }
    panggilan = await panggilKunjunganMentah(cfg, p.tanggal, SIMRS_PER_PAGE)
    const barisMentah = extractArray(panggilan.raw)
    if (barisMentah) {
      jumlahBarisRespons = barisMentah.length
      validasi = validasiBaris(barisMentah, WAJIB_KUNJUNGAN, PENTING_KUNJUNGAN, DIKENAL_KUNJUNGAN)
    }
  } else {
    const p = parameter as { no_rm: string }
    panggilan = await panggilPasienMentah(cfg, p.no_rm)
    const satuBaris = extractSingle(panggilan.raw)
    if (satuBaris) {
      jumlahBarisRespons = 1
      validasi = validasiBaris([satuBaris], WAJIB_PASIEN, PENTING_PASIEN, DIKENAL_PASIEN)
    }
  }

  const berhasil = panggilan.statusHttp !== null && panggilan.statusHttp >= 200 && panggilan.statusHttp < 300

  // Log HANYA metadata + ringkasan validasi — bukan raw. Lihat catatan di kepala file.
  await tenantDb.simrsDiagnostikLog.create({
    data: {
      tenant_slug:     tenantSlug,
      jenis,
      parameter:       parameter as any,
      berhasil,
      http_status:     panggilan.statusHttp,
      durasi_ms:       panggilan.durasiMs,
      jumlah_baris:    jumlahBarisRespons,
      field_hilang:    validasi?.fieldHilang.map(f => f.field) ?? [],
      field_asing:     validasi?.fieldAsing ?? [],
      pesan_error:     panggilan.errorPesan,
      dilakukan_oleh:  olehUserId,
    },
  })

  return {
    berhasil, statusHttp: panggilan.statusHttp, durasiMs: Date.now() - mulai,
    errorPesan: panggilan.errorPesan, raw: panggilan.raw, validasi,
  }
}

function extractArray(raw: unknown): Record<string, unknown>[] | null {
  if (!raw || typeof raw !== 'object') return null
  const data = (raw as any).data
  return Array.isArray(data) ? data : null
}

function extractSingle(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null
  const data = (raw as any).data ?? raw
  return data && typeof data === 'object' ? data : null
}
