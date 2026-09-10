/**
 * Master topik SEBUTAN PUBLIK — daftar bawaan dan penyemaiannya.
 *
 * Taksonomi ketiga di sistem ini, dan ketiganya sengaja terpisah karena
 * subjeknya berbeda:
 *
 *   SocialSifatLibrary      — konten yang KAMI terbitkan
 *   PercakapanTopikLibrary  — yang MEREKA tanyakan lewat Inbox
 *   SebutanTopikLibrary     — yang MEREKA katakan tentang kami di publik  ← ini
 *
 * Godaan memakai ulang PercakapanTopikLibrary besar, dan sudah ditimbang: 16
 * kategorinya menjawab "orang ini mau apa". Video webinar dari mitra bukan
 * "menanyakan pelatihan" — ia ADALAH konten pelatihan. Dipaksakan, labelnya
 * terbaca aneh di laporan dan dua daftar itu akan saling menarik ke arah
 * berlawanan tiap kali disunting.
 *
 * ISI DAFTAR INI BUKAN TEBAKAN. Seluruhnya diturunkan dari pengamatan 252 konten
 * Instagram bertanda milik RKZ (probe 4 Sep 2026) — termasuk SPAM, yang ada di
 * sini justru karena ditemukan: iklan properti yang menandai RKZ semata demi
 * jangkauan. Penyaring semacam itu dibutuhkan sejak hari pertama, bukan
 * ditambahkan setelah laporan terlanjur tercemar.
 */

export interface SebutanTopikBawaan {
  kode: string; nama: string; deskripsi: string; warna: string; urutan: number
}

export const SEBUTAN_TOPIK_BAWAAN: SebutanTopikBawaan[] = [
  { kode: 'MITRA', nama: 'Mitra & Kolaborasi', urutan: 1, warna: '#0089A8',
    deskripsi: 'Institusi, komunitas, atau profesional yang bekerja sama dengan RKZ — webinar bersama, pelatihan, kegiatan gabungan, atau lembaga afiliasi. Nadanya kemitraan, bukan pujian pasien.' },

  { kode: 'APRESIASI', nama: 'Apresiasi & Testimoni', urutan: 2, warna: '#65A30D',
    deskripsi: 'Pujian, ucapan terima kasih, ucapan selamat, atau pengalaman baik yang diceritakan orang lain di akunnya sendiri. Kebalikan dari Keluhan, dan sama pentingnya untuk dihitung.' },

  { kode: 'KELUHAN', nama: 'Keluhan Publik', urutan: 3, warna: '#DC2626',
    deskripsi: 'Ketidakpuasan atas layanan yang disampaikan di ruang publik — bukan lewat Inbox. Ini yang paling berkonsekuensi bagi reputasi karena terbaca siapa pun. Nada kesal saja belum cukup; harus ada pengalaman yang dikeluhkan.' },

  { kode: 'LIPUTAN', nama: 'Liputan & Penyebutan Media', urutan: 4, warna: '#7C3AED',
    deskripsi: 'Media, akun berita, atau akun kota yang menyebut RKZ dalam pemberitaan atau daftar — misalnya ulasan rumah sakit di Surabaya. Penyebutnya pihak ketiga yang tidak punya kepentingan langsung.' },

  { kode: 'EDUKASI', nama: 'Konten Edukasi Kesehatan', urutan: 5, warna: '#0891B2',
    deskripsi: 'Konten kesehatan yang menyebut atau menandai RKZ sebagai rujukan, sumber, atau tempat kegiatan — tetapi bukan buatan RKZ sendiri.' },

  { kode: 'INTERNAL', nama: 'Karyawan & Keluarga Besar', urutan: 6, warna: '#D97706',
    deskripsi: 'Unggahan orang dalam: karyawan, perawat, unit, sekolah keperawatan afiliasi. Sering berupa kegiatan bersama atau perayaan. Dipisahkan karena ia BUKAN suara publik — mencampurnya akan membuat sentimen tampak lebih baik dari kenyataannya.' },

  { kode: 'SPAM', nama: 'Spam / Menumpang Jangkauan', urutan: 7, warna: '#94A3B8',
    deskripsi: 'Menandai RKZ tanpa kaitan nyata, semata agar unggahannya terlihat lebih luas — iklan properti, promosi dagang, akun yang menandai puluhan pihak sekaligus.' },

  { kode: 'LAINNYA', nama: 'Lainnya', urutan: 8, warna: '#64748B',
    deskripsi: 'Maksudnya jelas terbaca tetapi tidak cocok dengan kategori mana pun di atas. BUKAN untuk sebutan yang terlalu singkat atau kabur — itu dibiarkan tanpa topik.' },
]

/** Nilai tetap yang TIDAK berpustaka: cukup sedikit dan tidak akan bertambah. */
export const SENTIMEN = ['POSITIF', 'NETRAL', 'NEGATIF'] as const
export const RISIKO   = ['RENDAH', 'SEDANG', 'TINGGI'] as const

/**
 * Semai daftar bawaan bila tenant belum punya satu pun.
 *
 * Meniru `semaiSifat` dan `semaiTopik` sampai ke perilaku kecilnya: pengecekan
 * "sudah ada isinya" mencegah kategori yang SUDAH DINONAKTIFKAN admin hidup
 * kembali diam-diam tiap halaman dibuka.
 */
export async function semaiSebutanTopik(db: any, slug: string): Promise<number> {
  const ada = await db.sebutanTopikLibrary.count({ where: { tenant_slug: slug } })
  if (ada > 0) return 0

  const r = await db.sebutanTopikLibrary.createMany({
    data: SEBUTAN_TOPIK_BAWAAN.map(t => ({ ...t, tenant_slug: slug })),
    skipDuplicates: true,
  })
  return r.count ?? 0
}
