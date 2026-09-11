/**
 * Penarik data Kanal Publik — YouTube & Google Analytics 4.
 *
 * Sengaja MEMBACA LANGSUNG dari Google tiap kali halaman dibuka, tanpa tabel
 * penyimpan sendiri. Kedua API sudah menyimpan riwayatnya dan bisa ditanya per
 * rentang tanggal, jadi kolektor + tabel snapshot sekarang hanya menduplikasi
 * data Google tanpa menambah kemampuan. Tabel baru dibuat kalau butuh yang TIDAK
 * disediakan API — misalnya menautkan konten ke taksonomi tag internal.
 *
 * Tiap potongan laporan ditarik lewat panggilan terpisah dan kegagalannya
 * ditangani sendiri-sendiri. Ini disengaja: satu kombinasi dimensi yang ditolak
 * Google (mis. yang tidak didukung untuk jenis channel tertentu) hanya membuat
 * bagian itu kosong, bukan menggugurkan seluruh halaman.
 */
import {
  ambilAccessToken, googleGet, googlePost, pesanErrorGoogle,
  GA4_DATA, YT_DATA, YT_ANALYTICS,
  type KredensialGoogle,
} from './google-client'

export interface KonfigKanal extends KredensialGoogle {
  ga4_property_id?:    string | null
  youtube_channel_id?: string | null
}

export interface Rentang { mulai: string; selesai: string }

/** Batas atas rentang — menjaga satu permintaan tidak menarik data bertahun-tahun. */
export const MAKS_HARI_RENTANG = 400

const hariAntara = (r: Rentang) =>
  Math.round((Date.parse(r.selesai) - Date.parse(r.mulai)) / 86_400_000) + 1

// ──────────────────────────────────────────────
// YouTube
// ──────────────────────────────────────────────

export interface TotalYouTube {
  tayangan: number; menitDitonton: number; retensiPersen: number
  subscriberNaik: number; subscriberTurun: number
}
export interface RingkasYouTube {
  channel: { id: string; nama: string; subscriber: number; video: number; totalTayangan: number } | null
  periode: TotalYouTube
  banding: TotalYouTube | null
  harian:  { tanggal: string; tayangan: number; menitDitonton: number }[]
  /** Naik/turun/bersih per hari — angka EKSAK dari API. */
  subscriberHarian: { tanggal: string; naik: number; turun: number; bersih: number }[]
  teratas: { videoId: string; judul: string; tayangan: number; retensiPersen: number }[]
  sumberTrafik: { nama: string; tayangan: number }[]
  /**
   * Istilah yang DIKETIK PENONTON di pencarian YouTube sampai menemukan video
   * ini. Berbeda dari `sumberTrafik`, yang hanya menyebut kategorinya
   * ("Pencarian YouTube: 1.240") tanpa pernah mengatakan orang mencari APA.
   *
   * Berbeda pula dari kata kunci di Sebutan Publik: yang di sana adalah kueri
   * KITA untuk menemukan video orang lain; yang di sini kueri MEREKA.
   */
  istilahPencarian: { istilah: string; tayangan: number }[]
  /** Total tayangan dari YT_SEARCH. Dipakai menghitung berapa persen istilah di
   *  atas benar-benar mencakup pencarian — lihat catatan di `ringkasYouTube`. */
  tayanganPencarian: number
  demografi:    { kelompok: string; gender: string; persen: number }[]
  jenisKonten:  { jenis: string; tayangan: number }[]
  galat?: string
}

const TOTAL_KOSONG: TotalYouTube = {
  tayangan: 0, menitDitonton: 0, retensiPersen: 0, subscriberNaik: 0, subscriberTurun: 0,
}

/** Nama sumber trafik YouTube dalam bahasa yang dimengerti admin, bukan kode API. */
const LABEL_SUMBER: Record<string, string> = {
  YT_SEARCH:        'Pencarian YouTube',
  RELATED_VIDEO:    'Video terkait / disarankan',
  YT_CHANNEL:       'Halaman channel',
  EXT_URL:          'Situs & aplikasi luar',
  PLAYLIST:         'Playlist',
  SUBSCRIBER:       'Beranda subscriber',
  NOTIFICATION:     'Notifikasi',
  SHORTS:           'Feed Shorts',
  NO_LINK_OTHER:    'Lainnya',
  NO_LINK_EMBEDDED: 'Disematkan di situs lain',
  ADVERTISING:      'Iklan',
  END_SCREEN:       'Layar akhir',
  HASHTAGS:         'Tagar',
}

async function totalYouTube(token: string, ids: string, r: Rentang): Promise<TotalYouTube> {
  const q = new URLSearchParams({
    ids, startDate: r.mulai, endDate: r.selesai,
    metrics: 'views,estimatedMinutesWatched,averageViewPercentage,subscribersGained,subscribersLost',
  })
  const res = await googleGet(`${YT_ANALYTICS}/reports?${q.toString()}`, token)
  if (!res.ok) return TOTAL_KOSONG
  const b = res.json?.rows?.[0] ?? []
  return {
    tayangan:        Number(b[0] ?? 0),
    menitDitonton:   Number(b[1] ?? 0),
    retensiPersen:   Number(b[2] ?? 0),
    subscriberNaik:  Number(b[3] ?? 0),
    subscriberTurun: Number(b[4] ?? 0),
  }
}

export async function ringkasYouTube(
  slug: string, cfg: KonfigKanal, periode: Rentang, banding?: Rentang | null,
): Promise<RingkasYouTube> {
  const kosong: RingkasYouTube = {
    channel: null, periode: TOTAL_KOSONG, banding: null,
    harian: [], subscriberHarian: [], teratas: [], sumberTrafik: [],
    istilahPencarian: [], tayanganPencarian: 0, demografi: [], jenisKonten: [],
  }

  let token: string
  try { token = await ambilAccessToken(slug, cfg) }
  catch (e: any) { return { ...kosong, galat: String(e?.message ?? e) } }

  const ids = cfg.youtube_channel_id?.trim()
    ? `channel==${cfg.youtube_channel_id.trim()}`
    : 'channel==MINE'

  const rCh = await googleGet(`${YT_DATA}/channels?part=snippet,statistics&mine=true`, token)
  if (!rCh.ok) return { ...kosong, galat: pesanErrorGoogle(rCh) }
  const ch = rCh.json?.items?.[0]

  const dasar = { ids, startDate: periode.mulai, endDate: periode.selesai }
  const laporan = (p: Record<string, string>) =>
    googleGet(`${YT_ANALYTICS}/reports?${new URLSearchParams({ ...dasar, ...p }).toString()}`, token)

  const [tot, tBanding, rHari, rSub, rVid, rSumber, rIstilah, rDemo, rJenis] = await Promise.all([
    totalYouTube(token, ids, periode),
    banding ? totalYouTube(token, ids, banding) : Promise.resolve(null),
    laporan({ metrics: 'views,estimatedMinutesWatched', dimensions: 'day', sort: 'day' }),
    laporan({ metrics: 'subscribersGained,subscribersLost', dimensions: 'day', sort: 'day' }),
    laporan({ metrics: 'views,averageViewPercentage', dimensions: 'video', sort: '-views', maxResults: '10' }),
    laporan({ metrics: 'views', dimensions: 'insightTrafficSourceType', sort: '-views', maxResults: '12' }),
    // Istilah pencarian. `filters` WAJIB — tanpa penyaring YT_SEARCH, dimensi
    // detail ini mencampur judul video terkait, nama channel, dan URL situs luar
    // ke dalam satu daftar yang tidak berarti apa-apa.
    //
    // Kegagalannya ditangani seperti potongan lain: channel yang terlalu kecil
    // membuat Google menolak dimensi ini, dan itu tidak boleh mengosongkan
    // seluruh halaman.
    laporan({
      metrics: 'views', dimensions: 'insightTrafficSourceDetail',
      filters: 'insightTrafficSourceType==YT_SEARCH',
      sort: '-views', maxResults: '25',
    }),
    laporan({ metrics: 'viewerPercentage', dimensions: 'ageGroup,gender', sort: '-viewerPercentage' }),
    laporan({ metrics: 'views', dimensions: 'creatorContentType', sort: '-views' }),
  ])

  const barisVid: any[] = rVid.ok ? (rVid.json?.rows ?? []) : []
  let judul: Record<string, string> = {}
  if (barisVid.length) {
    // Judul tidak tersedia di Analytics API — harus diambil dari Data API.
    const rMeta = await googleGet(`${YT_DATA}/videos?part=snippet&id=${barisVid.map(r => r[0]).join(',')}`, token)
    if (rMeta.ok) judul = Object.fromEntries((rMeta.json?.items ?? []).map((v: any) => [v.id, v.snippet?.title ?? v.id]))
  }

  return {
    channel: ch ? {
      id: ch.id, nama: ch.snippet?.title ?? '-',
      subscriber:    Number(ch.statistics?.subscriberCount ?? 0),
      video:         Number(ch.statistics?.videoCount ?? 0),
      totalTayangan: Number(ch.statistics?.viewCount ?? 0),
    } : null,
    periode: tot,
    banding: tBanding,
    harian: (rHari.ok ? rHari.json?.rows ?? [] : []).map((r: any) => ({
      tanggal: String(r[0]), tayangan: Number(r[1] ?? 0), menitDitonton: Number(r[2] ?? 0),
    })),
    subscriberHarian: (rSub.ok ? rSub.json?.rows ?? [] : []).map((r: any) => {
      const naik = Number(r[1] ?? 0), turun = Number(r[2] ?? 0)
      return { tanggal: String(r[0]), naik, turun, bersih: naik - turun }
    }),
    teratas: barisVid.map((r: any) => ({
      videoId: String(r[0]), judul: judul[String(r[0])] ?? String(r[0]),
      tayangan: Number(r[1] ?? 0), retensiPersen: Number(r[2] ?? 0),
    })),
    sumberTrafik: (rSumber.ok ? rSumber.json?.rows ?? [] : []).map((r: any) => ({
      nama: LABEL_SUMBER[String(r[0])] ?? String(r[0]), tayangan: Number(r[1] ?? 0),
    })),
    istilahPencarian: (rIstilah.ok ? rIstilah.json?.rows ?? [] : []).map((r: unknown[]) => ({
      istilah: String(r[0]), tayangan: Number(r[1] ?? 0),
    })),
    // Diambil dari baris YT_SEARCH pada laporan sumber trafik, BUKAN dari
    // penjumlahan istilah di atas: YouTube menyembunyikan istilah bervolume
    // rendah, jadi jumlah keduanya memang tidak akan pernah sama. Justru
    // selisihnya yang perlu ditampilkan.
    tayanganPencarian: Number(
      (rSumber.ok ? rSumber.json?.rows ?? [] : [])
        .find((r: unknown[]) => String(r[0]) === 'YT_SEARCH')?.[1] ?? 0),
    demografi: (rDemo.ok ? rDemo.json?.rows ?? [] : []).map((r: any) => ({
      kelompok: String(r[0]).replace('age', ''), gender: String(r[1]), persen: Number(r[2] ?? 0),
    })),
    jenisKonten: (rJenis.ok ? rJenis.json?.rows ?? [] : []).map((r: any) => ({
      jenis: String(r[0]) === 'SHORTS' ? 'Shorts' : String(r[0]) === 'VIDEO_ON_DEMAND' ? 'Video biasa' : String(r[0]),
      tayangan: Number(r[1] ?? 0),
    })),
  }
}

// ──────────────────────────────────────────────
// Google Analytics 4
// ──────────────────────────────────────────────

export interface TotalGa4 {
  sesi: number; pengguna: number; tayanganHalaman: number; rerataDetik: number
}
export interface RingkasGa4 {
  propertyId: string | null
  periode: TotalGa4
  banding: TotalGa4 | null
  harian:  { tanggal: string; sesi: number; pengguna: number }[]
  sumber:  { nama: string; sesi: number }[]
  halaman: { path: string; tayangan: number }[]
  pendarat: { path: string; sesi: number }[]
  perangkat: { nama: string; sesi: number }[]
  kota:      { nama: string; sesi: number }[]
  baruKembali: { nama: string; pengguna: number }[]
  /**
   * Rujukan dari asisten AI — ChatGPT, Gemini, Perplexity, Copilot, Claude.
   *
   * Tidak ada di `sumber`, yang memakai `sessionDefaultChannelGroup` dan melebur
   * seluruhnya ke keranjang "Referral". Kanal ini belum punya kerangka
   * pengukuran di mana pun, dan tanpa pecahan sendiri ia tidak terlihat sama
   * sekali di dalam produk — padahal probe pernah menemukan 145 sesi ChatGPT.
   */
  rujukanAi: { nama: string; sesi: number }[]
  /** Total sesi dari seluruh host AI yang dikenali. */
  sesiAi: number
  /**
   * Kueri yang diketik orang di PENCARIAN DALAM SITUS. Hanya terisi bila situs
   * mengirim event `view_search_results`. Kosong berarti situsnya tidak
   * mengirimnya — bukan berarti tidak ada yang mencari.
   */
  cariDalamSitus: { nama: string; sesi: number }[]
  galat?: string
}

/**
 * Host asisten AI. Dicocokkan sebagai AWALAN pada `sessionSource`, karena GA4
 * kadang mengirim subdomain atau varian ("chat.openai.com", "chatgpt.com").
 *
 * DAFTAR INI TIDAK AKAN PERNAH LENGKAP, dan itu bukan kelalaian: asisten baru
 * muncul terus, dan yang lewat aplikasi ponsel sering datang tanpa referrer
 * sehingga jatuh ke "Direct". Angka di sini SELALU batas bawah.
 */
const HOST_AI: { cocok: string[]; nama: string }[] = [
  { nama: 'ChatGPT',    cocok: ['chatgpt.com', 'chat.openai.com', 'openai.com'] },
  { nama: 'Gemini',     cocok: ['gemini.google.com', 'bard.google.com'] },
  { nama: 'Perplexity', cocok: ['perplexity.ai'] },
  { nama: 'Copilot',    cocok: ['copilot.microsoft.com', 'bing.com/chat'] },
  { nama: 'Claude',     cocok: ['claude.ai'] },
  { nama: 'Meta AI',    cocok: ['meta.ai'] },
  { nama: 'Grok',       cocok: ['grok.com', 'x.ai'] },
  { nama: 'DeepSeek',   cocok: ['deepseek.com'] },
]

/** Nama asisten untuk satu `sessionSource`, atau null bila bukan asisten AI. */
function namaAsisten(sumber: string): string | null {
  const s = sumber.toLowerCase()
  for (const h of HOST_AI) if (h.cocok.some(c => s.includes(c))) return h.nama
  return null
}

const GA4_KOSONG: TotalGa4 = { sesi: 0, pengguna: 0, tayanganHalaman: 0, rerataDetik: 0 }

export async function ringkasGa4(
  slug: string, cfg: KonfigKanal, periode: Rentang, banding?: Rentang | null,
): Promise<RingkasGa4> {
  const propertyId = cfg.ga4_property_id?.trim() || ''
  const kosong: RingkasGa4 = {
    propertyId: propertyId || null, periode: GA4_KOSONG, banding: null,
    harian: [], sumber: [], halaman: [], pendarat: [], perangkat: [], kota: [], baruKembali: [],
    rujukanAi: [], sesiAi: 0, cariDalamSitus: [],
  }
  if (!propertyId) {
    return { ...kosong, galat: 'GA4 Property ID belum diisi di Pengaturan → Integrasi Google Business.' }
  }

  let token: string
  try { token = await ambilAccessToken(slug, cfg) }
  catch (e: any) { return { ...kosong, galat: String(e?.message ?? e) } }

  const url  = `${GA4_DATA}/${propertyId}:runReport`
  const satu = [{ startDate: periode.mulai, endDate: periode.selesai }]

  // GA4 menerima BEBERAPA rentang dalam satu panggilan. Rentangnya diberi NAMA
  // agar pemetaan hasil tidak bergantung pada urutan baris.
  const rentangTotal = banding
    ? [{ ...satu[0], name: 'utama' }, { startDate: banding.mulai, endDate: banding.selesai, name: 'banding' }]
    : [{ ...satu[0], name: 'utama' }]

  const pecahan = (dimensi: string, metrik: string, limit = 10) =>
    googlePost(url, token, {
      dateRanges: satu, dimensions: [{ name: dimensi }], metrics: [{ name: metrik }],
      orderBys: [{ metric: { metricName: metrik }, desc: true }], limit: String(limit),
    })

  const [rTotal, rHari, rSumber, rHalaman, rPendarat, rPerangkat, rKota, rBaru,
         rAsal, rCari] = await Promise.all([
    googlePost(url, token, {
      dateRanges: rentangTotal,
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'averageSessionDuration' }],
    }),
    googlePost(url, token, {
      dateRanges: satu, dimensions: [{ name: 'date' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    }),
    pecahan('sessionDefaultChannelGroup', 'sessions'),
    pecahan('pagePath',    'screenPageViews'),
    pecahan('landingPage', 'sessions'),
    pecahan('deviceCategory', 'sessions', 5),
    pecahan('city',        'sessions'),
    pecahan('newVsReturning', 'activeUsers', 3),
    // `sessionSource` mentah, bukan channel group: rujukan asisten AI hanya
    // terlihat di sini. Limit besar karena host AI jarang masuk sepuluh besar.
    pecahan('sessionSource', 'sessions', 100),
    // Pencarian dalam situs. Gagal atau kosong bila situs tidak mengirim
    // `view_search_results` — ditangani sendiri seperti potongan lain, jadi
    // ketiadaannya tidak mengosongkan apa pun.
    pecahan('searchTerm', 'sessions', 25),
  ])

  if (!rTotal.ok) return { ...kosong, galat: pesanErrorGoogle(rTotal) }

  const bacaTotal = (namaRentang: string): TotalGa4 | null => {
    const rows: any[] = rTotal.json?.rows ?? []
    // Saat >1 rentang diminta, GA4 menambahkan dimensi dateRange berisi namanya.
    const row = rows.length <= 1
      ? rows[0]
      : rows.find(r => (r.dimensionValues ?? []).some((d: any) => d.value === namaRentang))
    if (!row) return null
    const v = row.metricValues ?? []
    return {
      sesi:            Number(v[0]?.value ?? 0),
      pengguna:        Number(v[1]?.value ?? 0),
      tayanganHalaman: Number(v[2]?.value ?? 0),
      rerataDetik:     Math.round(Number(v[3]?.value ?? 0)),
    }
  }

  const angka = (r: any, i = 0) => Number(r?.metricValues?.[i]?.value ?? 0)
  const dim   = (r: any) => String(r?.dimensionValues?.[0]?.value ?? '-')
  const petakan = (res: any, kunci: 'sesi' | 'tayangan' | 'pengguna') =>
    (res.ok ? res.json?.rows ?? [] : []).map((r: any) => ({ nama: dim(r), path: dim(r), [kunci]: angka(r) })) as any[]

  return {
    propertyId,
    periode: bacaTotal('utama') ?? GA4_KOSONG,
    banding: banding ? bacaTotal('banding') : null,
    harian: (rHari.ok ? rHari.json?.rows ?? [] : []).map((r: any) => ({
      tanggal: dim(r), sesi: angka(r, 0), pengguna: angka(r, 1),
    })),
    sumber:      petakan(rSumber,    'sesi'),
    halaman:     petakan(rHalaman,   'tayangan'),
    pendarat:    petakan(rPendarat,  'sesi'),
    perangkat:   petakan(rPerangkat, 'sesi'),
    kota:        petakan(rKota,      'sesi'),
    baruKembali: petakan(rBaru,      'pengguna'),
    ...(() => {
      // Digabung per ASISTEN, bukan per host: "chatgpt.com" dan
      // "chat.openai.com" adalah pintu yang sama, dan menampilkannya sebagai dua
      // baris membuat keduanya tampak lebih kecil daripada kenyataannya.
      const peta = new Map<string, number>()
      for (const r of (rAsal.ok ? rAsal.json?.rows ?? [] : []) as unknown[]) {
        const nama = namaAsisten(dim(r))
        if (!nama) continue
        peta.set(nama, (peta.get(nama) ?? 0) + angka(r))
      }
      const rujukanAi = [...peta.entries()]
        .map(([nama, sesi]) => ({ nama, sesi }))
        .sort((a, b) => b.sesi - a.sesi)
      return {
        rujukanAi,
        sesiAi: rujukanAi.reduce((n, r) => n + r.sesi, 0),
      }
    })(),
    cariDalamSitus: petakan(rCari, 'sesi'),
  }
}

/** Validasi rentang dari luar (URL) — dipakai route API. */
export function periksaRentang(mulai: string, selesai: string): { ok: true; rentang: Rentang } | { ok: false; pesan: string } {
  const pola = /^\d{4}-\d{2}-\d{2}$/
  if (!pola.test(mulai) || !pola.test(selesai)) return { ok: false, pesan: 'Format tanggal harus YYYY-MM-DD.' }
  const m = Date.parse(mulai), s = Date.parse(selesai)
  if (Number.isNaN(m) || Number.isNaN(s)) return { ok: false, pesan: 'Tanggal tidak valid.' }
  if (m > s) return { ok: false, pesan: 'Tanggal mulai melewati tanggal selesai.' }
  const rentang = { mulai, selesai }
  if (hariAntara(rentang) > MAKS_HARI_RENTANG) {
    return { ok: false, pesan: `Rentang maksimal ${MAKS_HARI_RENTANG} hari.` }
  }
  return { ok: true, rentang }
}
