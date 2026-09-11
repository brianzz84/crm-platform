/**
 * Menjembatani ulasan Google ke modul Sebutan Publik.
 *
 * TIDAK MEMANGGIL GOOGLE SAMA SEKALI. `GbpReview` sudah diisi tiap malam oleh
 * pekerjaan `google-snapshot` yang berjalan sejak 27 Agustus. Jembatan ini murni
 * basis-data-ke-basis-data: nol kuota, nol kredensial, nol risiko rate limit.
 *
 * ══ MENGAPA DISALIN, BUKAN DIBACA LANGSUNG DARI GbpReview ══
 *
 * Ulasan Google sudah punya alur kerjanya sendiri di tab Google Bisnis — daftar,
 * balas, hapus balasan. Itu alur OPERASIONAL dan sudah lengkap. Yang tidak
 * dimilikinya satu pun: label.
 *
 * Akibatnya 1.636 ulasan pasien — suara publik terbanyak yang dimiliki RKZ —
 * tidak pernah masuk Ringkasan Sebutan Publik, tidak punya sentimen, topik, poli,
 * maupun risiko. Rumah sakit ini mengukur sentimen dari 608 tandaan Instagram
 * sambil mengabaikan 1.636 ulasan pasien yang sudah ada di basis datanya sendiri.
 *
 * Menyalinnya ke `Sebutan` membuat seluruh mesin yang sudah dibangun — usulan AI
 * empat dimensi, penetapan manusia, ringkasan berbasis cakupan, penyorotan risiko
 * TINGGI — langsung berlaku tanpa satu baris pun ditulis dua kali.
 *
 * ══ TIDAK PERNAH MENGISI `hilang_pada` ══
 *
 * Penarik ulasan bekerja bertahap (`updateTime desc`, berhenti setelah 100
 * berturut-turut tak berubah). Ia TIDAK mendaftar ulang seluruh ulasan tiap
 * malam, jadi ketiadaan sebuah baris di `GbpReview` bukan bukti ulasannya
 * dihapus. Alasan yang sama dengan penarik YouTube.
 */

import { getTenantDb } from './tenant'
import { catatSnapshotRun } from './snapshot-run'

export interface HasilTarikUlasan {
  dibaca:     number
  baru:       number
  diperbarui: number
  galat?:     string
}

/**
 * Berapa ulasan disalin sekali jalan.
 *
 * 1.636 baris sekaligus akan menahan permintaan HTTP terlalu lama saat penyalinan
 * pertama. Dibatasi, lalu dipanggil berulang oleh klien — pola yang sama dengan
 * usulan AI, dan alasan yang sama.
 */
const MAKS_SEKALI = 400

/**
 * Bintang DITEMPELKAN ke depan teks, bukan hanya disimpan di `mentah`.
 *
 * Dua alasan, keduanya praktis:
 *
 * 1. Peninjau harus melihat ratingnya. Kartu Sebutan Publik menampilkan teks apa
 *    adanya, dan menilai "keluhan atau bukan" tanpa tahu ini bintang 1 atau
 *    bintang 5 adalah pekerjaan yang sengaja dipersulit.
 *
 * 2. AI ikut membacanya. Bintang adalah sentimen yang dinyatakan SENDIRI oleh
 *    penulisnya — jauh lebih tepercaya daripada sentimen yang disimpulkan dari
 *    teks. Menyisipkannya di sini membuat seluruh jalur pelabelan tetap satu,
 *    tanpa perlu cabang khusus per sumber.
 *
 * Teks aslinya tetap utuh di `mentah`.
 */
const denganBintang = (bintang: number, teks: string | null) => {
  const kepala = `★${bintang}/5`
  const isi = (teks ?? '').replace(/\s+/g, ' ').trim()
  // Sekitar 16% ulasan hanya berisi bintang tanpa teks. Itu BUKAN sebutan tanpa
  // isi — bintangnya sendiri sudah keterangan, dan cukup untuk menilai sentimen.
  return (isi ? `${kepala} — ${isi}` : kepala).slice(0, 2000)
}

export async function tarikSebutanUlasan(slug: string): Promise<HasilTarikUlasan> {
  const kosong: HasilTarikUlasan = { dibaca: 0, baru: 0, diperbarui: 0 }

  const mulai = Date.now()
  const db = await getTenantDb(slug)

  // Yang belum pernah disalin didahulukan, lalu yang terbaru. Dengan tunggakan
  // 1.636 baris, ulasan bulan ini lebih berkonsekuensi daripada ulasan 2019.
  const tersimpan = new Map<string, { id: string; teks: string | null }>(
    (await db.sebutan.findMany({
      where:  { tenant_slug: slug, sumber: 'GOOGLE_ULASAN' },
      select: { id: true, sumber_id: true, teks: true },
    })).map((r: { id: string; sumber_id: string; teks: string | null }) =>
      [r.sumber_id, { id: r.id, teks: r.teks }]),
  )

  const ulasan = await db.gbpReview.findMany({
    where:   { tenant_slug: slug },
    orderBy: { dibuat_pada: 'desc' },
    take:    MAKS_SEKALI + tersimpan.size,
    select: {
      review_id: true, bintang: true, pengulas: true,
      teks: true, terjemahan: true, lokasi_judul: true,
      dibuat_pada: true, diubah_pada: true,
    },
  })

  const hasil = { ...kosong }

  for (const u of ulasan as {
    review_id: string; bintang: number; pengulas: string
    teks: string | null; terjemahan: string | null; lokasi_judul: string
    dibuat_pada: Date; diubah_pada: Date
  }[]) {
    if (hasil.baru + hasil.diperbarui >= MAKS_SEKALI) break
    hasil.dibaca++

    // Terjemahan dipakai bila aslinya kosong — sebagian ulasan hanya menyisakan
    // bagian terjemahan setelah pemisahan "(Translated by Google)".
    const teks = denganBintang(u.bintang, u.teks || u.terjemahan)

    const isi = {
      penulis:  u.pengulas,
      username: u.pengulas,
      teks,
      // Google tidak memberi tautan per ulasan lewat API v4, dan menyusun sendiri
      // dari place id tidak dapat diandalkan. Dibiarkan kosong ketimbang mengisi
      // tautan yang gagal saat diklik.
      tautan:   null,
      mentah:   { ...u, sumber_asli: 'GBP_V4' } as unknown as object,
    }

    const ada = tersimpan.get(u.review_id)

    if (!ada) {
      await db.sebutan.create({
        data: {
          tenant_slug: slug, sumber: 'GOOGLE_ULASAN', sumber_id: u.review_id,
          terbit_pada: u.dibuat_pada,
          ...isi,
        },
      })
      hasil.baru++
    } else if (ada.teks !== teks) {
      // Hanya bila teksnya BERUBAH. Menulis ulang 1.636 baris tiap malam tanpa
      // ada yang berbeda hanya membebani basis data dan mengaburkan `updated_at`
      // sebagai penanda perubahan yang sebenarnya.
      await db.sebutan.update({ where: { id: ada.id }, data: isi })
      hasil.diperbarui++
    }
  }

  await catatSnapshotRun(
    slug, 'SEBUTAN_ULASAN', 'ok',
    `${hasil.dibaca} diperiksa, ${hasil.baru} disalin, ${hasil.diperbarui} diperbarui`,
    Date.now() - mulai,
  )

  return hasil
}
