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
  { kode: 'KONSULTASI_KESEHATAN', nama: 'Konsultasi Kesehatan', urutan: 6, warna: '#0891B2',
    deskripsi: 'Menceritakan keluhan atau gejala, meminta saran medis, atau menanyakan dokter spesialis mana yang sesuai untuk suatu kondisi. Bidang layanannya dicatat terpisah pada dimensi Poli.' },
  { kode: 'LAYANAN_KLINIK', nama: 'Layanan Klinik Tersedia', urutan: 7, warna: '#14B8A6',
    deskripsi: 'Menanyakan APAKAH suatu tindakan, pemeriksaan, atau layanan tersedia di RS — beserta syarat, persiapan, atau batas usianya. Bedanya dengan Konsultasi Kesehatan: di sini orang menanyakan ketersediaan layanan, bukan menceritakan keluhannya sendiri.' },
  { kode: 'PELAYANAN_ROHANI', nama: 'Pelayanan Rohani', urutan: 8, warna: '#8B5CF6',
    deskripsi: 'Jadwal misa atau ibadah di kapel, permintaan pendampingan rohani, kunjungan pastoral, atau menanyakan rohaniwan yang berkarya di rumah sakit.' },
  { kode: 'INFO_UMUM', nama: 'Informasi Umum', urutan: 9, warna: '#16A34A',
    deskripsi: 'Jam besuk, lokasi gedung, nomor telepon, parkir, ketersediaan kamar, dan keterangan administratif serupa. KATEGORI SISA: pakai hanya setelah memastikan tidak ada kategori lain yang cocok. Bila percakapan menyebut keluhan, gejala, tindakan medis, nama layanan, atau nama spesialisasi — kategorinya BUKAN ini.' },
  { kode: 'KELUHAN', nama: 'Keluhan Layanan', urutan: 10, warna: '#DC2626',
    deskripsi: 'Menyampaikan ketidakpuasan atas layanan yang SUDAH diterima: waktu tunggu, sikap petugas, tagihan, atau hasil yang mengecewakan. Nada kesal saat bertanya BUKAN keluhan — yang menjadikannya keluhan adalah adanya pengalaman yang dikeluhkan.' },
  { kode: 'APRESIASI', nama: 'Apresiasi & Testimoni', urutan: 11, warna: '#65A30D',
    deskripsi: 'Pujian, ucapan terima kasih, ucapan selamat, atau testimoni positif atas layanan maupun staf — biasanya tanpa pertanyaan sama sekali. Kebalikan dari Keluhan Layanan, dan sama pentingnya untuk dihitung.' },
  { kode: 'LOWONGAN', nama: 'Lowongan & Magang', urutan: 12, warna: '#D97706',
    deskripsi: 'Melamar pekerjaan, menanyakan lowongan, mengajukan magang, PKL, atau penelitian mahasiswa.' },
  { kode: 'PELATIHAN', nama: 'Pelatihan & Diklat', urutan: 13, warna: '#EA580C',
    deskripsi: 'Tenaga kesehatan atau institusi lain menanyakan pelatihan profesi, workshop, atau diklat yang diselenggarakan RS. BUKAN orang yang mencari pekerjaan, magang, atau PKL; itu Lowongan & Magang.' },
  { kode: 'KERJA_SAMA', nama: 'Kerja Sama & Vendor', urutan: 14, warna: '#DB2777',
    deskripsi: 'Penawaran vendor, ajakan kerja sama institusi, permintaan sponsor, atau permintaan wawancara media.' },
  { kode: 'SPAM', nama: 'Spam / Salah Sambung', urutan: 15, warna: '#94A3B8',
    deskripsi: 'Promosi masuk yang tidak diminta, pesan berantai, penipuan, atau orang yang jelas salah menghubungi.' },
  { kode: 'LAINNYA', nama: 'Lainnya', urutan: 16, warna: '#64748B',
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
