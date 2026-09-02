/**
 * Menambal deret harian yang tidak lagi disediakan Meta dengan catatan cron kita.
 *
 * Instagram menyimpan riwayat `reach` dan `follower_count` jauh lebih pendek
 * daripada metric total_value, jadi periode pembanding yang agak lampau pulang
 * KOSONG sementara tayangan dan interaksinya tetap terisi. Sebelum ini dasbor
 * menyerah pada keadaan itu dan hanya menyarankan "pilih periode yang lebih
 * dekat" — tanpa memberi tahu seberapa dekat.
 *
 * Tabel `crm_social_account_daily` justru dibangun untuk kasus ini; alasan nomor
 * satu di catatan desainnya berbunyi "API akan lupa". Yang kurang selama ini
 * hanyalah dasbor tidak pernah membacanya.
 *
 * SUMBERNYA TERBUKTI IDENTIK. Diuji 1 Sep 2026 pada sembilan tanggal yang ada di
 * keduanya: cocok sembilan dari sembilan, setelah `end_time` Meta dimundurkan
 * satu hari sebagaimana sudah dilakukan `tanggalDariEndTime` di meta-kanal.ts.
 * Karena itu menjahit kedua sumber tidak meninggalkan sambungan yang terlihat.
 *
 * YANG TIDAK BOLEH DILUPAKAN: hari yang bolong hanya bisa MENGURANGI. Jangkauan
 * dan follower baru adalah cacahan tak-negatif, jadi angka hasil tambalan adalah
 * BATAS BAWAH — kenyataannya sama atau lebih besar. Konsekuensi lanjutannya
 * dipakai di UI: karena periode pembanding cenderung terlalu kecil, persentase
 * pertumbuhannya justru menjadi BATAS ATAS.
 */

import { getTenantDb } from './tenant'

export interface Rentang { mulai: string; selesai: string }

export interface HasilTambal {
  /** Tanggal paling awal yang pernah dicatat cron untuk kanal ini. */
  cronMulai:    string | null
  hariDiminta:  number
  hariTerisi:   number
  /** Hari yang tidak tercatat, sudah diringkas jadi rentang: "18–21 Agu". */
  bolong:       string[]
  jangkauan:    number
  followerBaru: number
  /** Hanya terisi untuk Facebook; Instagram tidak memakainya. */
  interaksi:        number
  kunjunganProfil:  number
  tayanganVideo:    number
  tayanganMedia:    number
  penontonUnik:     number
  harian:       { tanggal: string; jangkauan: number }[]
}

const HARI = 86_400_000
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

const iso = (d: Date) => d.toISOString().slice(0, 10)
const labelTanggal = (t: string) => `${Number(t.slice(8, 10))} ${BULAN[Number(t.slice(5, 7)) - 1]}`

/** Semua tanggal dalam rentang, inklusif di kedua ujung. */
function deretTanggal(r: Rentang): string[] {
  const keluar: string[] = []
  for (let d = Date.parse(`${r.mulai}T00:00:00Z`); d <= Date.parse(`${r.selesai}T00:00:00Z`); d += HARI) {
    keluar.push(iso(new Date(d)))
  }
  return keluar
}

/**
 * Meringkas tanggal berurutan menjadi rentang.
 *
 * Enam tanggal berderet ("7 Agu, 18 Agu, 19 Agu, 20 Agu, 21 Agu, 31 Agu") jauh
 * lebih sulit dibaca daripada "7 Agu, 18–21 Agu, 31 Agu", dan yang dibaca orang
 * dari daftar bolong justru bentuk gangguannya — apakah tersebar atau menggumpal.
 */
export function ringkasRentangTanggal(tanggal: string[]): string[] {
  if (!tanggal.length) return []
  const urut = [...tanggal].sort()
  const keluar: string[] = []
  let awal = urut[0], akhir = urut[0]

  const dorong = () => {
    if (awal === akhir) { keluar.push(labelTanggal(awal)); return }
    // Bulan tidak diulang bila kedua ujungnya sebulan: "18–21 Agu", bukan
    // "18 Agu–21 Agu". Lintas bulan tetap menyebut keduanya: "31 Jul–1 Agu".
    const seBulan = awal.slice(0, 7) === akhir.slice(0, 7)
    keluar.push(seBulan
      ? `${Number(awal.slice(8, 10))}–${labelTanggal(akhir)}`
      : `${labelTanggal(awal)}–${labelTanggal(akhir)}`)
  }

  for (const t of urut.slice(1)) {
    if (Date.parse(`${t}T00:00:00Z`) - Date.parse(`${akhir}T00:00:00Z`) === HARI) { akhir = t; continue }
    dorong(); awal = t; akhir = t
  }
  dorong()
  return keluar
}

/**
 * Membaca catatan cron untuk satu kanal pada satu rentang.
 *
 * Mengembalikan `null` bila TIDAK ADA satu hari pun yang tercatat — di situ tidak
 * ada yang bisa ditambal, dan menampilkan nol akan berbohong jauh lebih parah
 * daripada tidak menampilkan apa-apa.
 */
export async function tambalDariSnapshot(
  slug: string, kanal: 'IG' | 'FB', r: Rentang,
): Promise<HasilTambal | null> {
  const db = await getTenantDb(slug)

  const [baris, terlama] = await Promise.all([
    db.socialAccountDaily.findMany({
      where: {
        tenant_slug: slug, kanal,
        tanggal: { gte: new Date(`${r.mulai}T00:00:00Z`), lte: new Date(`${r.selesai}T00:00:00Z`) },
      },
      orderBy: { tanggal: 'asc' },
      select: {
        tanggal: true, jangkauan: true, follower_baru: true,
        interaksi: true, kunjungan_profil: true, tayangan: true,
        tayangan_media: true, penonton_unik: true,
      },
    }),
    db.socialAccountDaily.findFirst({
      where: { tenant_slug: slug, kanal },
      orderBy: { tanggal: 'asc' },
      select: { tanggal: true },
    }),
  ])
  if (!baris.length) return null

  const adaTanggal = new Set(baris.map((b: { tanggal: Date }) => iso(b.tanggal)))
  const semua      = deretTanggal(r)
  const jum = (kolom: string) =>
    baris.reduce((n: number, b: Record<string, unknown>) => n + Number(b[kolom] ?? 0), 0)

  return {
    cronMulai:   terlama ? iso(terlama.tanggal) : null,
    hariDiminta: semua.length,
    hariTerisi:  adaTanggal.size,
    bolong:      ringkasRentangTanggal(semua.filter(t => !adaTanggal.has(t))),
    jangkauan:       jum('jangkauan'),
    followerBaru:    jum('follower_baru'),
    interaksi:       jum('interaksi'),
    kunjunganProfil: jum('kunjungan_profil'),
    tayanganVideo:   jum('tayangan'),
    tayanganMedia:   jum('tayangan_media'),
    penontonUnik:    jum('penonton_unik'),
    harian: baris.map((b: { tanggal: Date; jangkauan: number }) => ({
      tanggal: iso(b.tanggal), jangkauan: b.jangkauan,
    })),
  }
}
