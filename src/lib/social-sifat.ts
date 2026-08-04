/**
 * Master sifat konten — daftar bawaan dan penyemaiannya.
 *
 * Isi bawaan mengikuti PERSIS Tabel 2.4 laporan triwulanan RKZ yang sudah berjalan.
 * Bukan karena taksonomi itu yang paling rapi, tapi karena mengganti kategori akan
 * memutus perbandingan dengan triwulan-triwulan sebelumnya. Kesinambungan deret
 * lebih berharga daripada kerapian di titik awal; tenant bebas menyunting setelahnya.
 */

export interface SifatBawaan {
  kode: string; nama: string; deskripsi: string; warna: string; urutan: number
}

export const SIFAT_BAWAAN: SifatBawaan[] = [
  { kode: 'INFO_LAYANAN',  nama: 'Info Layanan',  urutan: 1, warna: '#0089A8',
    deskripsi: 'Info tentang jadwal praktik dokter, jadwal operasional, atau keterangan mengenai prosedur layanan.' },
  { kode: 'PROMO_LAYANAN', nama: 'Promo Layanan', urutan: 2, warna: '#DB2777',
    deskripsi: 'Info promo diskon atau fitur baru dari layanan yang sudah ada.' },
  { kode: 'PERINGATAN',    nama: 'Peringatan',    urutan: 3, warna: '#D97706',
    deskripsi: 'Info peringatan hari besar nasional maupun internasional.' },
  { kode: 'EDUKASI',       nama: 'Edukasi',       urutan: 4, warna: '#16A34A',
    deskripsi: 'Edukasi kesehatan yang dibawakan oleh dokter spesialis atau tenaga kesehatan.' },
  { kode: 'MOMEN_EVENT',   nama: 'Momen & Event', urutan: 5, warna: '#7C3AED',
    deskripsi: 'Reportase atau liputan kegiatan dalam rangka peristiwa tertentu.' },
  { kode: 'INTERAKSI',     nama: 'Interaksi',     urutan: 6, warna: '#0EA5E9',
    deskripsi: 'Konten yang mengajak followers terlibat untuk berkomentar atau mengisi polling.' },
]

/**
 * Semai daftar bawaan bila tenant belum punya satu pun.
 *
 * Aman dipanggil berkali-kali: `skipDuplicates` bersandar pada unique
 * (tenant_slug, kode), dan pengecekan "sudah ada isinya" mencegah kategori yang
 * SUDAH DINONAKTIFKAN admin muncul kembali diam-diam tiap halaman dibuka —
 * menonaktifkan adalah keputusan yang harus dihormati, bukan diperbaiki sistem.
 */
export async function semaiSifat(db: any, slug: string): Promise<number> {
  const ada = await db.socialSifatLibrary.count({ where: { tenant_slug: slug } })
  if (ada > 0) return 0

  const r = await db.socialSifatLibrary.createMany({
    data: SIFAT_BAWAAN.map(s => ({ ...s, tenant_slug: slug })),
    skipDuplicates: true,
  })
  return r.count ?? 0
}
