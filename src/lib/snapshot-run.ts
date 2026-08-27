/**
 * Riwayat penarikan terjadwal — satu baris per sumber per hari.
 *
 * Dipisah dari `SocialSnapshotConfig` karena config hanya punya SATU `last_status`,
 * dan sejak Google ikut ditarik dua sumber akan saling menimpa. Yang lebih penting:
 * dengan kunci tanggal, HARI YANG BOLONG bisa dideteksi — pertanyaan wajib untuk
 * fitur yang tujuannya laporan triwulan.
 */

import { getTenantDb } from './tenant'

export type SumberSnapshot = 'META' | 'GOOGLE'
export type StatusSnapshot = 'ok' | 'sebagian' | 'gagal'

/**
 * Tanggal WIB hari ini, sebagai Date tengah malam UTC.
 *
 * Sengaja WIB, bukan UTC: penarikan dijadwalkan pada jam WIB (bawaan 08:00), dan
 * memakai tanggal UTC akan menggeser sebagian hari ke tanggal sebelumnya sehingga
 * deteksi hari bolong melaporkan lubang yang tidak ada.
 */
export function tanggalWib(saat: Date = new Date()): Date {
  const wib = new Date(saat.getTime() + 7 * 3600_000)
  return new Date(`${wib.toISOString().slice(0, 10)}T00:00:00.000Z`)
}

/**
 * Catat hasil satu penarikan. Menimpa bila sumber yang sama sudah berjalan hari
 * ini — penarikan ulang manual seharusnya memperbarui penilaian hari itu, bukan
 * menumpuk baris yang membuat deteksi hari bolong jadi menipu.
 *
 * Tidak pernah melempar: kegagalan mencatat riwayat tidak boleh menggagalkan
 * penarikan yang sebenarnya sudah berhasil.
 */
export async function catatSnapshotRun(
  slug: string,
  sumber: SumberSnapshot,
  status: StatusSnapshot,
  pesan: string,
  durasiMs = 0,
): Promise<void> {
  try {
    const db = await getTenantDb(slug)
    const tanggal = tanggalWib()
    const isi = { status, pesan: pesan.slice(0, 1000), durasi_ms: durasiMs, dijalankan: new Date() }
    await db.snapshotRun.upsert({
      where:  { tenant_slug_sumber_tanggal: { tenant_slug: slug, sumber, tanggal } },
      update: isi,
      create: { tenant_slug: slug, sumber, tanggal, ...isi },
    })
  } catch (e) {
    console.error(`[snapshot-run] gagal mencatat ${sumber} untuk ${slug}:`,
      e instanceof Error ? e.message : e)
  }
}

export interface BarisRiwayat {
  tanggal: string
  status:  StatusSnapshot
  pesan:   string | null
}

export interface RingkasSumber {
  sumber:     SumberSnapshot
  terakhir:   BarisRiwayat | null
  riwayat:    BarisRiwayat[]
  hariBolong: string[]
}

/**
 * Riwayat `hari` terakhir per sumber, beserta daftar tanggal yang tidak punya
 * catatan sama sekali.
 *
 * Hari ini TIDAK dihitung sebagai bolong: penarikan dijadwalkan pagi, dan halaman
 * yang dibuka sebelum jadwal akan salah melaporkan lubang.
 */
export async function ringkasRiwayat(slug: string, hari = 30): Promise<RingkasSumber[]> {
  const db = await getTenantDb(slug)
  const sejak = new Date(tanggalWib().getTime() - (hari - 1) * 86_400_000)

  const baris = await db.snapshotRun.findMany({
    where:   { tenant_slug: slug, tanggal: { gte: sejak } },
    orderBy: { tanggal: 'desc' },
  })

  const hariIni = tanggalWib().toISOString().slice(0, 10)

  return (['META', 'GOOGLE'] as const).map(sumber => {
    const milikSumber = baris
      .filter(b => b.sumber === sumber)
      .map(b => ({
        tanggal: b.tanggal.toISOString().slice(0, 10),
        status:  b.status as StatusSnapshot,
        pesan:   b.pesan,
      }))

    const ada = new Set(milikSumber.map(b => b.tanggal))
    const hariBolong: string[] = []

    // Hanya dihitung sejak catatan PERTAMA sumber itu — sebelum penarikan pernah
    // dinyalakan, tidak ada yang "bolong", hanya belum dimulai.
    const paling = milikSumber[milikSumber.length - 1]?.tanggal
    if (paling) {
      for (let t = new Date(`${paling}T00:00:00.000Z`); ; t = new Date(t.getTime() + 86_400_000)) {
        const tgl = t.toISOString().slice(0, 10)
        if (tgl >= hariIni) break
        if (!ada.has(tgl)) hariBolong.push(tgl)
      }
    }

    return { sumber, terakhir: milikSumber[0] ?? null, riwayat: milikSumber, hariBolong }
  })
}
