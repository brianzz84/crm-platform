/**
 * Master topik percakapan masuk — daftar bawaan dan penyemaiannya.
 *
 * Menjawab pertanyaan yang selama ini tidak bisa dijawab laporan mana pun:
 * *orang menghubungi RKZ untuk apa?* Laporan percakapan sudah mengukur seberapa
 * cepat dijawab, tetapi sama sekali bisu soal isinya.
 *
 * Daftar ini SENGAJA tidak meniru Tabel 2.4 (sifat konten). Kategori di sana
 * lahir dari apa yang rumah sakit terbitkan; yang di sini harus lahir dari apa
 * yang orang tanyakan — dua hal yang tidak berhubungan. Isinya adalah tebakan
 * awal yang wajar untuk rumah sakit, bukan hasil pengamatan RKZ, dan memang
 * dimaksudkan untuk disunting admin setelah satu-dua triwulan terlihat.
 *
 * Satu kategori patut diperhatikan: KELUHAN. Ia yang paling berkonsekuensi dan
 * paling mudah salah dilekatkan — orang yang bertanya dengan nada kesal belum
 * tentu sedang mengeluh soal layanan. Uraiannya dibuat ketat justru karena itu.
 */

export interface TopikBawaan {
  kode: string; nama: string; deskripsi: string; warna: string; urutan: number
}

export const TOPIK_BAWAAN: TopikBawaan[] = [
  { kode: 'JADWAL_DOKTER', nama: 'Jadwal Dokter', urutan: 1, warna: '#0089A8',
    deskripsi: 'Menanyakan jadwal praktik dokter, poli tertentu, atau apakah dokter tersedia pada hari/jam tertentu.' },
  { kode: 'PENDAFTARAN', nama: 'Pendaftaran & Antrean', urutan: 2, warna: '#0EA5E9',
    deskripsi: 'Cara mendaftar, membuat janji temu, reservasi, nomor antrean, atau prosedur sebelum datang.' },
  { kode: 'TARIF_BIAYA', nama: 'Tarif & Biaya', urutan: 3, warna: '#7C3AED',
    deskripsi: 'Menanyakan harga layanan, estimasi biaya tindakan, paket pemeriksaan, atau cara pembayaran.' },
  { kode: 'PENJAMIN', nama: 'BPJS & Asuransi', urutan: 4, warna: '#2563EB',
    deskripsi: 'Pertanyaan seputar BPJS, asuransi swasta, rujukan, atau apakah suatu layanan ditanggung penjamin.' },
  { kode: 'HASIL_PERIKSA', nama: 'Hasil Pemeriksaan', urutan: 5, warna: '#059669',
    deskripsi: 'Menanyakan hasil laboratorium, radiologi, medical check-up, atau kapan hasil bisa diambil.' },
  { kode: 'INFO_UMUM', nama: 'Informasi Umum', urutan: 6, warna: '#16A34A',
    deskripsi: 'Jam besuk, lokasi, nomor telepon, fasilitas, ketersediaan kamar, dan keterangan umum lain yang bukan soal jadwal dokter.' },
  { kode: 'KELUHAN', nama: 'Keluhan Layanan', urutan: 7, warna: '#DC2626',
    deskripsi: 'Menyampaikan ketidakpuasan atas layanan yang SUDAH diterima: waktu tunggu, sikap petugas, tagihan, atau hasil yang mengecewakan. Nada kesal saat bertanya BUKAN keluhan — yang menjadikannya keluhan adalah adanya pengalaman yang dikeluhkan.' },
  { kode: 'LOWONGAN', nama: 'Lowongan & Magang', urutan: 8, warna: '#D97706',
    deskripsi: 'Melamar pekerjaan, menanyakan lowongan, mengajukan magang, PKL, atau penelitian mahasiswa.' },
  { kode: 'KERJA_SAMA', nama: 'Kerja Sama & Vendor', urutan: 9, warna: '#DB2777',
    deskripsi: 'Penawaran vendor, ajakan kerja sama institusi, permintaan sponsor, atau permintaan wawancara media.' },
  { kode: 'SPAM', nama: 'Spam / Salah Sambung', urutan: 10, warna: '#94A3B8',
    deskripsi: 'Promosi masuk yang tidak diminta, pesan berantai, penipuan, atau orang yang jelas salah menghubungi.' },
  { kode: 'LAINNYA', nama: 'Lainnya', urutan: 11, warna: '#64748B',
    deskripsi: 'Maksudnya jelas terbaca tetapi tidak cocok dengan kategori mana pun di atas. BUKAN untuk percakapan yang terlalu singkat atau kabur — itu dibiarkan tanpa topik.' },
]

/**
 * Semai daftar bawaan bila tenant belum punya satu pun.
 *
 * Sengaja meniru `semaiSifat` sampai ke perilaku kecilnya: pengecekan "sudah ada
 * isinya" mencegah kategori yang SUDAH DINONAKTIFKAN admin hidup kembali diam-diam
 * setiap halaman dibuka. Menonaktifkan adalah keputusan yang dihormati, bukan
 * kekeliruan yang diperbaiki sistem.
 */
export async function semaiTopik(db: any, slug: string): Promise<number> {
  const ada = await db.percakapanTopikLibrary.count({ where: { tenant_slug: slug } })
  if (ada > 0) return 0

  const r = await db.percakapanTopikLibrary.createMany({
    data: TOPIK_BAWAAN.map(t => ({ ...t, tenant_slug: slug })),
    skipDuplicates: true,
  })
  return r.count ?? 0
}
