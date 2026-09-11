/**
 * Perakit tabel Laporan Triwunalan medsos.
 *
 * Bentuk tabelnya sengaja MENIRU laporan ODT yang sudah berjalan di RKZ — sifat
 * sebagai baris, bulan dan format sebagai kolom, lengkap dengan Grand Total.
 * Bukan karena bentuk itu paling elok, melainkan karena laporan ini akan diadu
 * dengan triwulan-triwulan sebelumnya. Bentuk yang berbeda memaksa pembacanya
 * menerjemahkan dua tata letak sekaligus, dan itu justru menghalangi tujuannya.
 *
 * Seluruh angka berasal dari tabel snapshot, bukan dari API — periode triwulan
 * sudah jauh melewati jendela riwayat yang disediakan Meta.
 */
import { getTenantDb } from './tenant'

/** Metrik konten diambil dari baris berjalan (umur -1) yang disegarkan tiap malam. */
const UMUR_TERAKHIR = -1
/**
 * Umur tetap yang dipakai MEMBANDINGKAN konten satu sama lain.
 *
 * UMUR_TERAKHIR tidak boleh dipakai untuk itu. Ia angka berjalan, jadi unggahan
 * tiga hari lalu diadu dengan unggahan delapan bulan lalu pada nilai kumulatif
 * masing-masing — dan yang lama pasti menang karena punya waktu delapan bulan
 * lebih banyak untuk mengumpulkan. Perbandingan semacam itu mengukur UMUR, bukan
 * mutu kontennya.
 *
 * H+7 dipilih karena cukup panjang menangkap sebagian besar interaksi dan cukup
 * pendek sehingga hampir semua konten punya barisnya.
 */
const UMUR_BANDING = 7

export interface SelKonten { jumlah: number; jangkauan: number; interaksi: number; suka: number }

export interface BarisAkun {
  bulan: string            // 'YYYY-MM'; 'TOTAL' untuk baris penjumlahan
  jumlahKonten: number
  jangkauan: number
  tayangan: number
  interaksi: number
  followerBaru: number
  /** Nilai pada hari TERAKHIR bulan itu — bukan penjumlahan. */
  followerAkhir: number

  // ── Ditambahkan 3 Sep 2026 setelah metriknya terbukti hidup lewat probe.
  //    KOSONG untuk periode sebelum tanggal itu — kolomnya memang belum ada,
  //    bukan berarti tidak ada kejadiannya. UI wajib menyatakan ini. ──
  unfollow: number
  /** followerBaru − unfollow. Pertumbuhan yang hanya dibaca dari penambahan
   *  menyembunyikan churn. */
  pertumbuhanBersih: number
  /** Instagram saja — ketukan tautan/kontak di profil. */
  tautanProfil: number
  /** Facebook saja — keluarga Media View, pengganti Reach yang dihapus Meta. */
  tayanganMedia: number
  penontonUnik: number
}

/** Perhatian pada Reels — hanya Reels yang punya angka ini. */
export interface BarisPerhatian {
  bulan: string
  jumlahReels: number
  /** MEDIAN, bukan rata-rata: satu Reels yang ditonton tuntas oleh sedikit orang
   *  tidak boleh menggeser gambaran seluruh bulan. Milidetik mentah. */
  medianTontonMs: number | null
  medianLajuLewat: number | null
}

export interface LaporanMedsos {
  periode: { mulai: string; selesai: string }
  bulan: string[]                 // 'YYYY-MM' berurutan
  format: string[]                // Carousel, Foto, Reels, …
  sifat: { kode: string; nama: string; warna: string }[]

  /** Tabel 2.3 — jumlah konten per format per bulan. */
  jumlahPerFormat: { format: string; perBulan: Record<string, number>; total: number }[]

  /** Tabel 2.5 — sifat × (bulan × format). Kunci sel: `YYYY-MM|Format`. */
  sifatFormatBulan: { sifat: string; nama: string; warna: string; sel: Record<string, SelKonten>; total: SelKonten }[]

  /** Tabel 2.8 — engagement per sifat × format sepanjang periode. */
  engagementSifat: {
    sifat: string; nama: string; warna: string
    perFormat: Record<string, SelKonten>; total: SelKonten
    /** Median laju interaksi (%) pada H+7. `null` bila tak satu pun konten
     *  sifat ini punya snapshot umur tetap. */
    lajuMedian: number | null
    jumlahLaju: number
  }[]

  /** Tabel 2.11 — konten terbaik tiap format. */
  teratasPerFormat: {
    format: string
    konten: { id: string; teks: string; tanggal: string; permalink: string; gambar: string
              jangkauan: number; tayangan: number; interaksi: number; sifat: string | null } | null
  }[]

  /**
   * Tabel pembuka laporan — ringkasan tingkat akun per bulan.
   *
   * `followerAkhir` sengaja TIDAK dijumlahkan: ia jumlah pengikut pada hari
   * terakhir bulan itu, bukan sesuatu yang bertambah tiap hari. Menjumlahkannya
   * akan menghasilkan angka raksasa yang tidak berarti apa pun.
   */
  ringkasAkun: BarisAkun[]

  /** Perhatian Reels per bulan. Kosong bila kanalnya bukan Instagram atau
   *  belum ada Reels yang terekam metrik perhatiannya. */
  perhatianReels: BarisPerhatian[]

  /** Tanggal paling awal metrik baru mulai direkam — dipakai UI menyatakan
   *  kenapa kolomnya kosong untuk periode lampau. Null bila belum ada sama sekali. */
  metrikBaruSejak: string | null

  /**
   * Angka triwulan lampau dari laporan manual. DISAJIKAN TERPISAH dan ditandai
   * berbeda di layar: sumbernya lain, tidak bisa diverifikasi ulang ke Meta, dan
   * tidak akan pernah berubah — jaminannya berbeda dari data snapshot.
   */
  riwayatManual: {
    periode: string; urutan: number; sumber: string
    jumlahKonten: number; jangkauan: number; interaksi: number; follower: number
    perFormat: Record<string, number>
  }[]

  /** Berapa konten belum bertanda — penentu apakah tabel sifat layak dipercaya. */
  belumDitandai: number
  totalKonten: number
  /** Konten yang punya snapshot H+7, jadi ikut menghitung laju interaksi.
   *  Konten yang terbit sebelum snapshot malam berjalan tidak punya baris itu
   *  dan tidak akan pernah punya — waktunya sudah lewat. */
  kontenDenganLaju: number
}

const kosongSel = (): SelKonten => ({ jumlah: 0, jangkauan: 0, interaksi: 0, suka: 0 })

/**
 * Median, BUKAN rerata.
 *
 * Satu unggahan yang viral menarik rerata seluruh kategorinya ke atas, dan
 * kesimpulan "sifat ini paling berhasil" lalu berdiri di atas satu kejadian yang
 * tidak terulang. Median menjawab pertanyaan yang sebenarnya ditanyakan tim:
 * unggahan yang BIASA dari sifat ini biasanya sebagus apa.
 *
 * NAMANYA SENGAJA BERBEDA dari `median` lokal di dalam `rakitLaporan`. Yang di
 * sana membulatkan — benar untuk milidetik tonton, tetapi merusak laju interaksi
 * yang bernilai satuan persen (1,37% akan menjadi 1%). Dan karena yang di sana
 * `const` berblok fungsi, memakai nama yang sama membuat pemanggilan dari baris
 * yang lebih awal jatuh ke TDZ-nya dan melempar saat dijalankan — bukan saat
 * dikompilasi.
 */
function medianTepat(v: number[]): number | null {
  if (!v.length) return null
  const u = [...v].sort((a, b) => a - b)
  const t = u.length >> 1
  return u.length % 2 ? u[t] : (u[t - 1] + u[t]) / 2
}
const tambah = (a: SelKonten, b: Partial<SelKonten>) => {
  a.jumlah    += b.jumlah    ?? 1
  a.jangkauan += b.jangkauan ?? 0
  a.interaksi += b.interaksi ?? 0
  a.suka      += b.suka      ?? 0
}

/** Bentuk snapshot yang benar-benar dibaca di berkas ini. Sengaja tidak memakai
 *  tipe Prisma penuh: yang dipakai hanya sebagian kecil kolomnya. */
interface BarisSnapshot {
  umur_hari: number
  jangkauan: number; tayangan: number; interaksi: number; suka: number
  rerata_tonton_ms: number | null
  laju_lewat: number | null
}

export type KanalLaporan = 'IG' | 'FB' | 'YOUTUBE' | 'GA4'

export async function rakitLaporan(
  slug: string, mulai: string, selesai: string, kanal: KanalLaporan,
): Promise<LaporanMedsos> {
  const db = await getTenantDb(slug)

  const [isi, pustaka, manual, harian] = await Promise.all([
    db.socialContent.findMany({
      where: {
        tenant_slug: slug, kanal,
        terbit_pada: { gte: new Date(mulai + 'T00:00:00Z'), lte: new Date(selesai + 'T23:59:59Z') },
      },
      // DUA snapshot, bukan satu. UMUR_TERAKHIR dipakai untuk angka kumulatif
      // di tabel-tabel jumlah; UMUR_BANDING dipakai KHUSUS membandingkan konten
      // satu sama lain — lihat catatan pada UMUR_BANDING.
      include: { snapshots: { where: { umur_hari: { in: [UMUR_TERAKHIR, UMUR_BANDING] } } } },
      orderBy: { terbit_pada: 'asc' },
    }),
    db.socialSifatLibrary.findMany({
      where: { tenant_slug: slug }, orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
    }),
    db.socialLaporanManual.findMany({
      where: { tenant_slug: slug, kanal }, orderBy: { urutan: 'asc' },
    }),
    db.socialAccountDaily.findMany({
      where: {
        tenant_slug: slug, kanal,
        tanggal: { gte: new Date(mulai + 'T00:00:00Z'), lte: new Date(selesai + 'T23:59:59Z') },
      },
      orderBy: { tanggal: 'asc' },
    }),
  ])

  const namaSifat = new Map(pustaka.map((p: any) => [p.kode, p]))
  const bulanSet  = new Set<string>()
  const formatSet = new Set<string>()

  // Sifat yang MASIH DIPAKAI riwayat ikut ditampilkan walau sudah dinonaktifkan —
  // menonaktifkan berlaku untuk konten baru, bukan menghapus jejak yang lama.
  const sifatTerpakai = new Set<string>()

  const baris = isi.map((k: any) => {
    const cari = (umur: number) =>
      (k.snapshots as BarisSnapshot[]).find(x => x.umur_hari === umur)
    const s  = cari(UMUR_TERAKHIR)
    const s7 = cari(UMUR_BANDING)
    const bulan = k.terbit_pada.toISOString().slice(0, 7)
    bulanSet.add(bulan)
    formatSet.add(k.jenis)
    if (k.sifat) sifatTerpakai.add(k.sifat)
    return {
      id: k.id, teks: k.teks ?? '', tanggal: k.terbit_pada.toISOString().slice(0, 10),
      permalink: k.permalink ?? '', gambar: k.sampul_url ?? '',
      jenis: k.jenis, bulan, sifat: k.sifat as string | null,
      jangkauan: s?.jangkauan ?? 0, tayangan: s?.tayangan ?? 0,
      interaksi: s?.interaksi ?? 0, suka: s?.suka ?? 0,
      // null, BUKAN 0 — Reels dan konten statis punya metrik yang saling
      // eksklusif, jadi ketiadaan di sini berarti "tidak berlaku".
      rerataTontonMs: (s?.rerata_tonton_ms ?? null) as number | null,
      lajuLewat:      (s?.laju_lewat ?? null) as number | null,
      // Laju interaksi pada umur yang SAMA untuk semua konten. `null` bila
      // konten ini tidak punya baris H+7 — dibedakan dari 0, dan yang null
      // dikeluarkan dari perhitungan alih-alih dihitung sebagai nol.
      laju7: s7 && s7.jangkauan > 0 ? (s7.interaksi / s7.jangkauan) * 100 : null,
    }
  })

  const bulan  = [...bulanSet].sort()
  const format = [...formatSet].sort()

  // ── Tabel 2.3 ──
  const jumlahPerFormat = format.map(f => {
    const perBulan: Record<string, number> = {}
    let total = 0
    for (const b of bulan) {
      const n = baris.filter(r => r.jenis === f && r.bulan === b).length
      perBulan[b] = n; total += n
    }
    return { format: f, perBulan, total }
  })

  // ── Tabel 2.5 & 2.8 ──
  const daftarSifat = pustaka
    .filter((p: any) => p.aktif || sifatTerpakai.has(p.kode))
    .map((p: any) => ({ kode: p.kode, nama: p.nama, warna: p.warna }))

  // Konten tanpa sifat tetap ditampilkan sebagai barisnya sendiri. Menyembunyikannya
  // akan membuat Grand Total tabel ini tidak cocok dengan jumlah konten sebenarnya,
  // dan selisih diam-diam itu justru yang paling sulit ditelusuri belakangan.
  const semuaSifat = [...daftarSifat, { kode: '', nama: '(Belum ditandai)', warna: '#94A3B8' }]

  const sifatFormatBulan = semuaSifat.map(s => {
    const sel: Record<string, SelKonten> = {}
    const total = kosongSel()
    for (const r of baris) {
      if ((r.sifat ?? '') !== s.kode) continue
      const kunci = `${r.bulan}|${r.jenis}`
      ;(sel[kunci] ??= kosongSel())
      tambah(sel[kunci], r); tambah(total, r)
    }
    return { sifat: s.kode, nama: s.nama, warna: s.warna, sel, total }
  }).filter(x => x.total.jumlah > 0)

  const engagementSifat = semuaSifat.map(s => {
    const perFormat: Record<string, SelKonten> = {}
    const total = kosongSel()
    const laju: number[] = []
    for (const r of baris) {
      if ((r.sifat ?? '') !== s.kode) continue
      ;(perFormat[r.jenis] ??= kosongSel())
      tambah(perFormat[r.jenis], r); tambah(total, r)
      if (r.laju7 !== null) laju.push(r.laju7)
    }
    return {
      sifat: s.kode, nama: s.nama, warna: s.warna, perFormat, total,
      // Laju interaksi khas sifat ini, diukur pada umur yang sama untuk semua.
      // `jumlahLaju` ikut dikembalikan supaya angka yang berdiri di atas dua
      // unggahan tidak dibaca setara dengan yang berdiri di atas empat puluh.
      lajuMedian: medianTepat(laju),
      jumlahLaju: laju.length,
    }
  }).filter(x => x.total.jumlah > 0)

  // ── Tabel 2.11 ──
  const teratasPerFormat = format.map(f => {
    const kandidat = baris.filter(r => r.jenis === f)
      .sort((a, b) => b.jangkauan - a.jangkauan || b.interaksi - a.interaksi)[0]
    return {
      format: f,
      konten: kandidat ? {
        id: kandidat.id, teks: kandidat.teks, tanggal: kandidat.tanggal,
        permalink: kandidat.permalink, gambar: kandidat.gambar,
        jangkauan: kandidat.jangkauan, tayangan: kandidat.tayangan,
        interaksi: kandidat.interaksi,
        sifat: kandidat.sifat ? (namaSifat.get(kandidat.sifat)?.nama ?? kandidat.sifat) : null,
      } : null,
    }
  })

  // ── Tabel pembuka: ringkasan akun per bulan ──
  const bulanAkun = [...new Set(harian.map((h: any) => h.tanggal.toISOString().slice(0, 7)))].sort()
  // ── Perhatian Reels ──
  // MEDIAN, bukan rata-rata: satu Reels yang ditonton tuntas oleh sedikit orang
  // tidak boleh menggeser gambaran seluruh bulan. Alasan yang sama dipakai pada
  // laporan percakapan.
  const median = (v: number[]): number | null => {
    if (!v.length) return null
    const u = [...v].sort((a, b) => a - b)
    const t = Math.floor(u.length / 2)
    return u.length % 2 ? u[t] : Math.round((u[t - 1] + u[t]) / 2)
  }
  const perhatianReels: BarisPerhatian[] = bulan
    .map(b => {
      const r = baris.filter(x => x.bulan === b && x.rerataTontonMs != null)
      return {
        bulan: b,
        jumlahReels:     r.length,
        medianTontonMs:  median(r.map(x => x.rerataTontonMs as number)),
        medianLajuLewat: median(r.filter(x => x.lajuLewat != null).map(x => x.lajuLewat as number)),
      }
    })
    .filter(x => x.jumlahReels > 0)

  // Sejak kapan metrik baru mulai direkam — dipakai UI menjelaskan kolom yang
  // kosong pada periode lampau. Diambil dari baris pertama yang benar-benar
  // punya isi, bukan dari tanggal rilis yang ditulis tangan.
  const barisBaru = (harian as { tanggal: Date; unfollow?: number; tautan_profil?: number; tayangan_media?: number }[])
    .filter(h => (h.unfollow ?? 0) > 0 || (h.tautan_profil ?? 0) > 0 || (h.tayangan_media ?? 0) > 0)
  const metrikBaruSejak = barisBaru.length
    ? barisBaru[0].tanggal.toISOString().slice(0, 10)
    : null

  const ringkasAkun: BarisAkun[] = bulanAkun.map(b => {
    const rows = harian.filter((h: any) => h.tanggal.toISOString().slice(0, 7) === b)
    const jml = (f: string) => rows.reduce((s: number, r: any) => s + (r[f] ?? 0), 0)
    return {
      bulan: b,
      jumlahKonten:  baris.filter(r => r.bulan === b).length,
      unfollow:          jml('unfollow'),
      pertumbuhanBersih: jml('follower_baru') - jml('unfollow'),
      tautanProfil:      jml('tautan_profil'),
      tayanganMedia:     jml('tayangan_media'),
      penontonUnik:      jml('penonton_unik'),
      jangkauan:     jml('jangkauan'),
      tayangan:      jml('tayangan'),
      interaksi:     jml('interaksi'),
      followerBaru:  jml('follower_baru'),
      // Baris terakhir bulan itu — keadaan pada akhir bulan, bukan penjumlahan.
      followerAkhir: rows.length ? (rows[rows.length - 1].follower_total ?? 0) : 0,
    }
  })

  if (ringkasAkun.length) {
    const t = (f: keyof BarisAkun) => ringkasAkun.reduce((s, r) => s + (r[f] as number), 0)
    ringkasAkun.push({
      bulan: 'TOTAL',
      jumlahKonten: t('jumlahKonten'), jangkauan: t('jangkauan'),
      tayangan: t('tayangan'), interaksi: t('interaksi'), followerBaru: t('followerBaru'),
      unfollow: t('unfollow'), pertumbuhanBersih: t('pertumbuhanBersih'),
      tautanProfil: t('tautanProfil'),
      tayanganMedia: t('tayanganMedia'), penontonUnik: t('penontonUnik'),
      followerAkhir: ringkasAkun[ringkasAkun.length - 1].followerAkhir,
    })
  }

  // ── Riwayat manual, dikelompokkan per periode ──
  const petaManual = new Map<string, any>()
  for (const m of manual as any[]) {
    const rec = petaManual.get(m.periode) ?? {
      periode: m.periode, urutan: m.urutan, sumber: m.sumber,
      jumlahKonten: 0, jangkauan: 0, interaksi: 0, follower: 0, perFormat: {},
    }
    if (m.dimensi === 'AKUN') {
      rec.jumlahKonten = m.jumlah_konten; rec.jangkauan = m.jangkauan
      rec.interaksi = m.interaksi;        rec.follower  = m.follower
    } else if (m.dimensi === 'FORMAT') {
      rec.perFormat[m.nilai_dim] = m.jumlah_konten
    }
    petaManual.set(m.periode, rec)
  }
  const riwayatManual = [...petaManual.values()].sort((a, b) => a.urutan - b.urutan)

  return {
    periode: { mulai, selesai },
    ringkasAkun, perhatianReels, metrikBaruSejak,
    riwayatManual,
    bulan, format,
    sifat: daftarSifat,
    jumlahPerFormat, sifatFormatBulan, engagementSifat, teratasPerFormat,
    belumDitandai: baris.filter(r => !r.sifat).length,
    totalKonten: baris.length,
    kontenDenganLaju: baris.filter(r => r.laju7 !== null).length,
  }
}
