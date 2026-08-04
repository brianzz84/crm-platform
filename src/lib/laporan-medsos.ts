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
  engagementSifat: { sifat: string; nama: string; warna: string; perFormat: Record<string, SelKonten>; total: SelKonten }[]

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
}

const kosongSel = (): SelKonten => ({ jumlah: 0, jangkauan: 0, interaksi: 0, suka: 0 })
const tambah = (a: SelKonten, b: Partial<SelKonten>) => {
  a.jumlah    += b.jumlah    ?? 1
  a.jangkauan += b.jangkauan ?? 0
  a.interaksi += b.interaksi ?? 0
  a.suka      += b.suka      ?? 0
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
      include: { snapshots: { where: { umur_hari: UMUR_TERAKHIR }, take: 1 } },
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
    const s = k.snapshots[0]
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
    for (const r of baris) {
      if ((r.sifat ?? '') !== s.kode) continue
      ;(perFormat[r.jenis] ??= kosongSel())
      tambah(perFormat[r.jenis], r); tambah(total, r)
    }
    return { sifat: s.kode, nama: s.nama, warna: s.warna, perFormat, total }
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
  const ringkasAkun: BarisAkun[] = bulanAkun.map(b => {
    const rows = harian.filter((h: any) => h.tanggal.toISOString().slice(0, 7) === b)
    const jml = (f: string) => rows.reduce((s: number, r: any) => s + (r[f] ?? 0), 0)
    return {
      bulan: b,
      jumlahKonten:  baris.filter(r => r.bulan === b).length,
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
    ringkasAkun,
    riwayatManual,
    bulan, format,
    sifat: daftarSifat,
    jumlahPerFormat, sifatFormatBulan, engagementSifat, teratasPerFormat,
    belumDitandai: baris.filter(r => !r.sifat).length,
    totalKonten: baris.length,
  }
}
