/**
 * Kata kunci pencarian sebutan publik — daftar bawaan dan penyemaiannya.
 *
 * Disimpan di TABEL, bukan di kode: admin medsos menambah atau mencabut sendiri
 * tanpa menunggu deploy. Ini keputusan pemilik sistem 4 Sep 2026, dan mengikuti
 * pola yang sudah dipakai seluruh pustaka lain di CRM ini.
 *
 * SATU KATA SENGAJA TIDAK DISEMAI: "RKZ" sendirian.
 *
 * Singkatan sependek itu cocok dengan banyak hal yang sama sekali tak berkaitan,
 * dan seluruh deraunya menjadi beban peninjau manusia — bukan beban mesin.
 * Pengujian 4 Sep 2026 menunjukkan "RKZ Surabaya" saja sudah mengembalikan hasil
 * yang hampir seluruhnya relevan. Admin tetap bisa menambahkannya sendiri bila
 * memang menginginkan cakupan lebih luas beserta konsekuensinya.
 *
 * BIAYA KUOTA. Satu pencarian YouTube memakan 100 unit dari kuota harian 10.000,
 * jadi ruangnya lega — tetapi tiap kata kunci baru adalah satu pencarian lagi
 * per putaran. Kolom `ditarik_pada` dipakai membagi kuota bila daftarnya panjang.
 */

export interface KataKunciBawaan {
  sumber: string; kata: string; urutan: number
}

export const KATA_KUNCI_BAWAAN: KataKunciBawaan[] = [
  // Terbukti relevan pada probe 4 Sep 2026 — hasil teratas seluruhnya menyangkut RKZ.
  { sumber: 'YOUTUBE', kata: 'RKZ Surabaya', urutan: 1 },
  // Nama resmi. Lebih jarang dipakai orang, tetapi menangkap liputan formal dan
  // dokumen resmi yang tidak memakai singkatan.
  { sumber: 'YOUTUBE', kata: 'Rumah Sakit Katolik St. Vincentius a Paulo', urutan: 2 },
]

/**
 * Semai bila tenant belum punya satu pun kata kunci.
 *
 * Sama seperti pustaka lain: pengecekan "sudah ada isinya" menghormati keputusan
 * admin yang menonaktifkan kata kunci — ia tidak boleh hidup kembali sendiri.
 */
export async function semaiKataKunci(db: any, slug: string): Promise<number> {
  const ada = await db.sebutanKataKunci.count({ where: { tenant_slug: slug } })
  if (ada > 0) return 0

  const r = await db.sebutanKataKunci.createMany({
    data: KATA_KUNCI_BAWAAN.map(k => ({ ...k, tenant_slug: slug })),
    skipDuplicates: true,
  })
  return r.count ?? 0
}
