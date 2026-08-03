/**
 * Penarik data Kanal Publik — YouTube & Google Analytics 4.
 *
 * Sengaja MEMBACA LANGSUNG dari Google tiap kali halaman dibuka, tanpa tabel
 * penyimpan sendiri. Alasannya: kedua API sudah menyimpan riwayatnya dan bisa
 * ditanya per rentang tanggal, jadi membangun kolektor + tabel snapshot sekarang
 * hanya menduplikasi data Google tanpa menambah kemampuan apa pun. Tabel baru
 * dibuat nanti kalau memang butuh hal yang TIDAK disediakan API — misalnya
 * menautkan konten ke taksonomi tag internal.
 *
 * Endpoint yang dipakai di sini adalah endpoint yang sudah terbukti hidup lewat
 * probe diagnostik, ditambah dimensi (day/video/pagePath) sesuai dokumentasi.
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

/** Rentang yang boleh diminta UI — dibatasi agar tidak jadi kueri liar. */
export const RENTANG_HARI = [7, 28, 90] as const
export type RentangHari = typeof RENTANG_HARI[number]

function tanggal(nHariLalu: number): string {
  return new Date(Date.now() - nHariLalu * 86_400_000).toISOString().slice(0, 10)
}

// ──────────────────────────────────────────────
// YouTube
// ──────────────────────────────────────────────

export interface RingkasYouTube {
  channel: { id: string; nama: string; subscriber: number; video: number; totalTayangan: number } | null
  periode: { tayangan: number; menitDitonton: number; retensiPersen: number; subscriberBaru: number }
  harian:  { tanggal: string; tayangan: number; menitDitonton: number }[]
  teratas: { videoId: string; judul: string; tayangan: number; retensiPersen: number }[]
  galat?:  string
}

export async function ringkasYouTube(
  slug: string, cfg: KonfigKanal, hari: RentangHari,
): Promise<RingkasYouTube> {
  const kosong: RingkasYouTube = {
    channel: null,
    periode: { tayangan: 0, menitDitonton: 0, retensiPersen: 0, subscriberBaru: 0 },
    harian: [], teratas: [],
  }

  let token: string
  try {
    token = await ambilAccessToken(slug, cfg)
  } catch (e: any) {
    return { ...kosong, galat: String(e?.message ?? e) }
  }

  // Data YouTube tertinggal 1–2 hari; meminta sampai hari ini menghasilkan baris kosong.
  const mulai   = tanggal(hari + 2)
  const selesai = tanggal(2)
  const ids     = cfg.youtube_channel_id?.trim()
    ? `channel==${cfg.youtube_channel_id.trim()}`
    : 'channel==MINE'

  // 1. Identitas channel
  const rCh = await googleGet(`${YT_DATA}/channels?part=snippet,statistics&mine=true`, token)
  if (!rCh.ok) return { ...kosong, galat: pesanErrorGoogle(rCh) }
  const ch = rCh.json?.items?.[0]

  // 2. Total periode
  const qTotal = new URLSearchParams({
    ids, startDate: mulai, endDate: selesai,
    metrics: 'views,estimatedMinutesWatched,averageViewPercentage,subscribersGained',
  })
  const rTotal = await googleGet(`${YT_ANALYTICS}/reports?${qTotal.toString()}`, token)
  if (!rTotal.ok) return { ...kosong, galat: pesanErrorGoogle(rTotal) }
  const t = rTotal.json?.rows?.[0] ?? [0, 0, 0, 0]

  // 3. Tren harian
  const qHari = new URLSearchParams({
    ids, startDate: mulai, endDate: selesai,
    metrics: 'views,estimatedMinutesWatched', dimensions: 'day', sort: 'day',
  })
  const rHari = await googleGet(`${YT_ANALYTICS}/reports?${qHari.toString()}`, token)

  // 4. Video teratas — retensi ikut ditarik karena itu sinyal mutu, bukan sekadar ramai
  const qVid = new URLSearchParams({
    ids, startDate: mulai, endDate: selesai,
    metrics: 'views,averageViewPercentage', dimensions: 'video',
    sort: '-views', maxResults: '10',
  })
  const rVid = await googleGet(`${YT_ANALYTICS}/reports?${qVid.toString()}`, token)
  const barisVid: any[] = rVid.ok ? (rVid.json?.rows ?? []) : []

  // Judul video tidak ada di Analytics API — harus diambil dari Data API.
  let judul: Record<string, string> = {}
  if (barisVid.length) {
    const idList = barisVid.map(r => r[0]).join(',')
    const rMeta  = await googleGet(`${YT_DATA}/videos?part=snippet&id=${idList}`, token)
    if (rMeta.ok) {
      judul = Object.fromEntries((rMeta.json?.items ?? []).map((v: any) => [v.id, v.snippet?.title ?? v.id]))
    }
  }

  return {
    channel: ch ? {
      id:            ch.id,
      nama:          ch.snippet?.title ?? '-',
      subscriber:    Number(ch.statistics?.subscriberCount ?? 0),
      video:         Number(ch.statistics?.videoCount ?? 0),
      totalTayangan: Number(ch.statistics?.viewCount ?? 0),
    } : null,
    periode: {
      tayangan:      Number(t[0] ?? 0),
      menitDitonton: Number(t[1] ?? 0),
      retensiPersen: Number(t[2] ?? 0),
      subscriberBaru: Number(t[3] ?? 0),
    },
    harian: (rHari.ok ? (rHari.json?.rows ?? []) : []).map((r: any) => ({
      tanggal: String(r[0]), tayangan: Number(r[1] ?? 0), menitDitonton: Number(r[2] ?? 0),
    })),
    teratas: barisVid.map((r: any) => ({
      videoId: String(r[0]),
      judul:   judul[String(r[0])] ?? String(r[0]),
      tayangan: Number(r[1] ?? 0),
      retensiPersen: Number(r[2] ?? 0),
    })),
  }
}

// ──────────────────────────────────────────────
// Google Analytics 4
// ──────────────────────────────────────────────

export interface RingkasGa4 {
  propertyId: string | null
  periode: { sesi: number; pengguna: number; tayanganHalaman: number; rerataDetik: number }
  harian:  { tanggal: string; sesi: number; pengguna: number }[]
  sumber:  { nama: string; sesi: number }[]
  halaman: { path: string; tayangan: number }[]
  galat?:  string
}

export async function ringkasGa4(
  slug: string, cfg: KonfigKanal, hari: RentangHari,
): Promise<RingkasGa4> {
  const propertyId = cfg.ga4_property_id?.trim() || ''
  const kosong: RingkasGa4 = {
    propertyId: propertyId || null,
    periode: { sesi: 0, pengguna: 0, tayanganHalaman: 0, rerataDetik: 0 },
    harian: [], sumber: [], halaman: [],
  }
  if (!propertyId) {
    return { ...kosong, galat: 'GA4 Property ID belum diisi di Pengaturan → Integrasi Google Business.' }
  }

  let token: string
  try {
    token = await ambilAccessToken(slug, cfg)
  } catch (e: any) {
    return { ...kosong, galat: String(e?.message ?? e) }
  }

  const rentang = [{ startDate: tanggal(hari), endDate: tanggal(1) }]
  const url     = `${GA4_DATA}/${propertyId}:runReport`

  const [rTotal, rHari, rSumber, rHalaman] = await Promise.all([
    googlePost(url, token, {
      dateRanges: rentang,
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'averageSessionDuration' }],
    }),
    googlePost(url, token, {
      dateRanges: rentang, dimensions: [{ name: 'date' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    }),
    googlePost(url, token, {
      dateRanges: rentang, dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: '10',
    }),
    googlePost(url, token, {
      dateRanges: rentang, dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: '10',
    }),
  ])

  if (!rTotal.ok) return { ...kosong, galat: pesanErrorGoogle(rTotal) }
  const t = rTotal.json?.rows?.[0]?.metricValues ?? []

  const angka = (r: any, i: number) => Number(r?.metricValues?.[i]?.value ?? 0)

  return {
    propertyId,
    periode: {
      sesi:            Number(t[0]?.value ?? 0),
      pengguna:        Number(t[1]?.value ?? 0),
      tayanganHalaman: Number(t[2]?.value ?? 0),
      rerataDetik:     Math.round(Number(t[3]?.value ?? 0)),
    },
    harian: (rHari.ok ? (rHari.json?.rows ?? []) : []).map((r: any) => ({
      tanggal:  String(r.dimensionValues?.[0]?.value ?? ''),
      sesi:     angka(r, 0),
      pengguna: angka(r, 1),
    })),
    sumber: (rSumber.ok ? (rSumber.json?.rows ?? []) : []).map((r: any) => ({
      nama: String(r.dimensionValues?.[0]?.value ?? '-'), sesi: angka(r, 0),
    })),
    halaman: (rHalaman.ok ? (rHalaman.json?.rows ?? []) : []).map((r: any) => ({
      path: String(r.dimensionValues?.[0]?.value ?? '-'), tayangan: angka(r, 0),
    })),
  }
}
