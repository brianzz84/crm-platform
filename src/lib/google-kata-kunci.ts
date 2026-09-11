/**
 * Istilah pencarian Google & Maps yang berakhir di listing RKZ.
 *
 * Ini padanan langsung dari istilah pencarian YouTube — tetapi jauh lebih besar
 * volumenya, karena orang mencari rumah sakit di Google, bukan di YouTube.
 *
 * ══ DUA HAL YANG SERING TERTUKAR, DAN TIDAK BOLEH ══
 *
 * Yang di sini adalah kueri MEREKA untuk menemukan kita — penemuan.
 * Kata kunci di Sebutan Publik adalah kueri KITA untuk menemukan mereka —
 * pemantauan. Keduanya sama-sama disebut "kata kunci" dan menjawab pertanyaan
 * yang sama sekali berbeda.
 *
 * ══ AMBANG, BUKAN NOL ══
 *
 * Google tidak mengembalikan angka pasti untuk istilah bervolume rendah. Ia
 * mengirim `threshold` — "kurang dari N" — alih-alih `value`. Memperlakukannya
 * sebagai angka biasa akan melebih-lebihkan istilah kecil, sementara
 * memperlakukannya sebagai nol akan menghapusnya. Karena itu keduanya disimpan
 * terpisah dan layar menampilkan tandanya apa adanya.
 *
 * Dijalankan LANGSUNG saat halaman dibuka, tanpa tabel penyimpan. Alasannya sama
 * dengan `google-kanal.ts`: Google sudah menyimpan riwayatnya dan bisa ditanya
 * per rentang bulan, jadi tabel sendiri hanya menduplikasi tanpa menambah
 * kemampuan. Kebijakan GBP juga membatasi penyimpanan konten API 30 hari —
 * tidak menyimpannya sama sekali menutup persoalan itu.
 */

import { GBP_PERFORMA, googleGet, pesanErrorGoogle } from './google-client'

/**
 * Jendela data GBP sekitar 18 bulan (diukur 27 Agu 2026: kosong di ~19 bulan,
 * terisi di 17). Bawaan 12 bulan memberi ruang aman sekaligus cukup panjang
 * untuk melihat pola musiman.
 */
export const BULAN_DEFAULT = 12

/** Batas per halaman dari Google. Lebih dari ini diabaikan. */
const PER_HALAMAN  = 100
/** Halaman maksimum. 500 istilah sudah jauh melampaui ekor yang bermakna. */
const MAKS_HALAMAN = 5

export interface IstilahPencarian {
  istilah: string
  /** Jumlah pasti. `null` bila Google hanya memberi ambang. */
  jumlah: number | null
  /** Batas atas bila Google menyembunyikan angka pastinya. */
  ambang: number | null
}

export interface HasilKataKunci {
  istilah: IstilahPencarian[]
  /** Total tayangan dari istilah yang angkanya PASTI. Sengaja tidak mencampur
   *  ambang — menjumlahkan "kurang dari 15" sebagai 15 melahirkan total yang
   *  tidak pernah benar. */
  totalPasti: number
  /** Berapa istilah yang hanya punya ambang. Ditampilkan supaya pembaca tahu
   *  seberapa besar bagian yang tidak bisa dijumlahkan. */
  jumlahAmbang: number
  bulanMulai: string
  bulanSelesai: string
  galat?: string
}

const bulanMundur = (n: number) => {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - n)
  return d
}

/**
 * Tarik istilah pencarian untuk SATU lokasi.
 *
 * `lokasi` berbentuk `locations/{id}` — format v1, sama dengan yang dipakai
 * `google-snapshot.ts`. Bukan format v4 (`accounts/A/locations/B`) yang hanya
 * dituntut API ulasan.
 */
export async function ambilKataKunciGbp(
  token: string, lokasi: string, bulan = BULAN_DEFAULT,
): Promise<HasilKataKunci> {
  // Bulan berjalan SENGAJA dilewati: datanya belum lengkap dan akan terbaca
  // sebagai penurunan tajam yang tidak pernah terjadi.
  const akhir = bulanMundur(1)
  const awal  = bulanMundur(bulan)

  const kosong: HasilKataKunci = {
    istilah: [], totalPasti: 0, jumlahAmbang: 0,
    bulanMulai:   awal.toISOString().slice(0, 7),
    bulanSelesai: akhir.toISOString().slice(0, 7),
  }

  const istilah: IstilahPencarian[] = []
  let pageToken: string | undefined
  let halaman = 0

  while (halaman < MAKS_HALAMAN) {
    const q = new URLSearchParams({
      'monthlyRange.startMonth.year':  String(awal.getUTCFullYear()),
      'monthlyRange.startMonth.month': String(awal.getUTCMonth() + 1),
      'monthlyRange.endMonth.year':    String(akhir.getUTCFullYear()),
      'monthlyRange.endMonth.month':   String(akhir.getUTCMonth() + 1),
      pageSize: String(PER_HALAMAN),
    })
    if (pageToken) q.set('pageToken', pageToken)

    const r = await googleGet(
      `${GBP_PERFORMA}/${lokasi}/searchkeywords/impressions/monthly?${q}`, token)
    if (!r.ok) return { ...kosong, galat: pesanErrorGoogle(r) }

    const baris = (r.json?.searchKeywordsCounts ?? []) as {
      searchKeyword?: string
      insightsValue?: { value?: string; threshold?: string }
    }[]

    for (const b of baris) {
      const kata = (b.searchKeyword ?? '').trim()
      if (!kata) continue
      const v = b.insightsValue?.value
      const t = b.insightsValue?.threshold
      istilah.push({
        istilah: kata,
        jumlah: v != null ? Number(v) : null,
        ambang: v == null && t != null ? Number(t) : null,
      })
    }

    pageToken = r.json?.nextPageToken
    halaman++
    if (!pageToken) break
  }

  // Yang pasti didahulukan dan diurutkan turun; yang berambang menyusul di
  // belakang. Mencampur keduanya dalam satu urutan berarti membandingkan angka
  // dengan batas atas, dan itu perbandingan yang tidak sah.
  istilah.sort((a, b) => {
    if ((a.jumlah === null) !== (b.jumlah === null)) return a.jumlah === null ? 1 : -1
    return (b.jumlah ?? b.ambang ?? 0) - (a.jumlah ?? a.ambang ?? 0)
  })

  return {
    ...kosong,
    istilah,
    totalPasti:   istilah.reduce((n, i) => n + (i.jumlah ?? 0), 0),
    jumlahAmbang: istilah.filter(i => i.jumlah === null).length,
  }
}
