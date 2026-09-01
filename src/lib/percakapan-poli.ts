/**
 * Master poli/layanan yang ditanyakan — dimensi kedua label percakapan.
 *
 * Tidak punya daftar bawaan yang ditulis tangan seperti `percakapan-topik.ts`.
 * Isinya DISALIN dari SimrsUnitLibrary milik tenant, karena tiap rumah sakit
 * punya poli yang berbeda dan menebaknya dari sini pasti meleset.
 *
 * Menyalin, bukan merujuk. Sebabnya: yang ditanyakan orang di media sosial
 * tidak selalu unit yang ditagihkan SIMRS — "Gizi" misalnya bukan unit di RKZ,
 * tetapi tetap masuk akal ditanyakan. Kalau daftar ini merujuk langsung ke
 * master SIMRS, menambah satu kategori demi medsos akan memunculkan baris kosong
 * di laporan kunjungan yang memakai master yang sama. Salinan boleh menyimpang;
 * itu justru gunanya.
 */

/** Warna per kelompok asal — supaya tabel laporan terbaca berkelompok. */
const WARNA_KELOMPOK: Record<string, string> = {
  'Rawat Jalan':  '#0089A8',
  'Penunjang':    '#7C3AED',
  'Rawat Inap':   '#DB2777',
  'Pondok Sehat': '#16A34A',
  'Home Care':    '#D97706',
  'One Day Care': '#0EA5E9',
}

/**
 * Kode dinormalkan sekali lalu KEKAL — ia dirujuk ConversationLabel.kode.
 * Aturannya disamakan dengan POST /api/[slug]/library agar kode yang dibuat
 * lewat penyemaian dan lewat UI tidak berbeda bentuk.
 */
export function kodeDariNama(nama: string): string {
  return nama.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

/**
 * Semai dari unit SIMRS bila tenant belum punya satu pun poli percakapan.
 *
 * Seperti `semaiSifat` dan `semaiTopik`: pengecekan "sudah ada isinya" mencegah
 * kategori yang SUDAH DINONAKTIFKAN admin hidup kembali diam-diam, dan mencegah
 * unit baru di SIMRS diam-diam masuk ke daftar medsos tanpa ada yang memutuskan.
 */
export async function semaiPoli(db: any, slug: string): Promise<number> {
  const ada = await db.percakapanPoliLibrary.count({ where: { tenant_slug: slug } })
  if (ada > 0) return 0

  const unit = await db.simrsUnitLibrary.findMany({
    where:   { tenant_slug: slug, aktif: true },
    orderBy: [{ kelompok: 'asc' }, { nama: 'asc' }],
    select:  { nama: true, kelompok: true },
  })
  if (!unit.length) return 0

  // Nama unit bisa bertabrakan setelah dinormalkan menjadi kode (mis. "THT" dan
  // "T.H.T"). Yang pertama menang; sisanya dilewati alih-alih menimpa.
  const dipakai = new Set<string>()
  const baris: any[] = []
  unit.forEach((u: { nama: string; kelompok: string | null }, i: number) => {
    const kode = kodeDariNama(u.nama)
    if (!kode || dipakai.has(kode)) return
    dipakai.add(kode)
    baris.push({
      tenant_slug: slug,
      kode,
      nama:        u.nama,
      kelompok:    u.kelompok ?? null,
      warna:       WARNA_KELOMPOK[u.kelompok ?? ''] ?? '#64748B',
      urutan:      i + 1,
    })
  })

  const r = await db.percakapanPoliLibrary.createMany({ data: baris, skipDuplicates: true })
  return r.count ?? 0
}
