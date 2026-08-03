/**
 * Probe Diagnostik Media Sosial (Fase 0) — memverifikasi apakah config + izin Meta
 * sudah cukup untuk menarik analitik FB/IG dan iklan, SEBELUM membangun data collector.
 *
 * Privasi/keamanan:
 *  - Hanya memanggil endpoint READ-ONLY dari akun yang sudah dikonfigurasi tenant
 *    (bukan URL bebas). Tidak menulis apa pun ke Meta.
 *  - Token tidak pernah di-log; potongan respons dipangkas.
 *  - Dibatasi laju sederhana per-tenant (in-memory) agar tidak membebani Graph.
 */
import { graphGet, pesanErrorGraph, type GraphResult } from './meta-social-client'

export type StatusCek = 'ok' | 'gagal' | 'lewati'

export interface HasilCek {
  kunci:  string
  label:  string
  status: StatusCek
  pesan:  string
  detail?: string
  /**
   * Fase yang membutuhkan cek ini. Ditampilkan sebagai chip di UI supaya merah
   * pada kebutuhan fase lanjut tidak terbaca sebagai penghalang fase sekarang —
   * mis. iklan baru dipakai di F4, jadi gagalnya tidak menahan dashboard konten.
   */
  fase?:   string
}

export interface ConfigProbe {
  access_token?:   string | null
  insights_token?: string | null
  page_id?:        string | null
  ig_business_id?: string | null
  ad_account_id?:  string | null
}

// Scope yang dibutuhkan untuk analitik + iklan (untuk pengingat kalau kurang).
const SCOPE_WAJIB = [
  'pages_show_list', 'pages_read_engagement', 'read_insights',
  // Wajib untuk membaca komentar & reaksi per postingan Page — tanpanya penghitung
  // itu pulang nol. Hanya membaca, seperti sisanya.
  'pages_read_user_content',
  'instagram_basic', 'instagram_manage_insights', 'ads_read', 'business_management',
]

// ── Rate limit sederhana per tenant (proses ini): maks 10 probe / 5 menit ──
const jejak = new Map<string, number[]>()
function cekBatasLaju(slug: string) {
  const now = Date.now(), jendela = 5 * 60_000
  const arr = (jejak.get(slug) ?? []).filter(t => now - t < jendela)
  if (arr.length >= 10) throw new Error('Terlalu banyak percobaan. Coba lagi beberapa menit.')
  arr.push(now); jejak.set(slug, arr)
}

const potong = (v: any, n = 240) => JSON.stringify(v ?? {}).slice(0, n)

/**
 * Kandidat metric untuk "penemuan metric".
 *
 * Meta memangkas metric Insights berkali-kali (gelombang besar 2024, lalu tiap versi
 * Graph). Menembak SATU nama metric membuat probe merah dengan galat "(#100) must be
 * a valid insights metric" — yang terbaca seolah izin kurang, padahal izinnya baik
 * dan hanya nama metric-nya yang sudah mati.
 *
 * Maka tiap kandidat diuji SATU PER SATU: kalau digabung dalam satu permintaan, satu
 * nama tak sah menggagalkan seluruh permintaan sehingga yang sah pun ikut tak
 * terlihat. Hasilnya = daftar metric yang benar-benar hidup, dan itulah kontrak yang
 * dipakai data collector F1. Lebih baik memetakannya sekarang lewat probe yang murah
 * daripada menemukannya satu-satu saat dashboard sudah dibangun di atasnya.
 */
interface KandidatMetrik { metric: string; query: string }

const q = (metric: string, extra = 'period=day'): KandidatMetrik =>
  ({ metric, query: `metric=${metric}&${extra}` })

/** Hasil terverifikasi 3 Agu 2026: hidup = post_engagements, daily_follows_unique, views_total. */
const KANDIDAT_PAGE: KandidatMetrik[] = [
  q('page_impressions'), q('page_impressions_unique'), q('page_post_engagements'),
  q('page_daily_follows_unique'), q('page_fan_adds'), q('page_views_total'),
  q('page_follows'), q('page_video_views'), q('page_total_actions'),
  q('page_fans', 'period=lifetime'), q('page_fans_country', 'period=lifetime'),
]

/**
 * IG memakai dua gaya: metric lama (`period=day` saja) dan metric generasi baru yang
 * WAJIB disertai `metric_type=total_value`. Keduanya diuji karena kita belum tahu
 * mana yang masih dilayani versi Graph ini.
 */
const KANDIDAT_IG_AKUN: KandidatMetrik[] = [
  q('reach'), q('impressions'), q('profile_views'), q('website_clicks'), q('follower_count'),
  q('accounts_engaged',   'period=day&metric_type=total_value'),
  q('total_interactions', 'period=day&metric_type=total_value'),
  q('views',              'period=day&metric_type=total_value'),
  q('likes',              'period=day&metric_type=total_value'),
  q('saves',              'period=day&metric_type=total_value'),
]

/** Metric per-konten IG — fondasi "Content Intelligence", bagian paling bernilai di F1. */
const KANDIDAT_IG_MEDIA: KandidatMetrik[] = [
  { metric: 'reach', query: 'metric=reach' },
  { metric: 'impressions', query: 'metric=impressions' },
  { metric: 'saved', query: 'metric=saved' },
  { metric: 'likes', query: 'metric=likes' },
  { metric: 'comments', query: 'metric=comments' },
  { metric: 'shares', query: 'metric=shares' },
  { metric: 'total_interactions', query: 'metric=total_interactions' },
  { metric: 'views', query: 'metric=views' },
]

/**
 * Gelombang lanjutan per-konten. Sasaran utamanya `follows` dan `profile_visits`:
 * kalau keduanya hidup, pertanyaan "follower baru datang dari konten apa" bisa
 * dijawab sebagai ATRIBUSI sungguhan, bukan sekadar keterkaitan tanggal seperti
 * yang sekarang ditampilkan dashboard.
 */
const KANDIDAT_IG_MEDIA_LANJUT: KandidatMetrik[] = [
  { metric: 'follows', query: 'metric=follows' },
  { metric: 'profile_visits', query: 'metric=profile_visits' },
  { metric: 'profile_activity', query: 'metric=profile_activity' },
  { metric: 'replies', query: 'metric=replies' },
  { metric: 'plays', query: 'metric=plays' },
  { metric: 'clips_replays_count', query: 'metric=clips_replays_count' },
  { metric: 'ig_reels_avg_watch_time', query: 'metric=ig_reels_avg_watch_time' },
  { metric: 'ig_reels_video_view_total_time', query: 'metric=ig_reels_video_view_total_time' },
]

/**
 * Demografi audiens. Semuanya menuntut `breakdown`, jadi nilainya disertakan di
 * kueri — tanpa itu Graph menolak dengan galat yang menyesatkan (bukan code 100),
 * sehingga metric yang sebenarnya hidup akan tercatat sebagai gagal.
 */
const KANDIDAT_IG_DEMOGRAFI: KandidatMetrik[] = [
  { metric: 'follower_demographics (age)',      query: 'metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=age' },
  { metric: 'follower_demographics (city)',     query: 'metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=city' },
  { metric: 'follower_demographics (gender)',   query: 'metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=gender' },
  { metric: 'engaged_audience_demographics',    query: 'metric=engaged_audience_demographics&period=lifetime&metric_type=total_value&breakdown=city' },
  { metric: 'reached_audience_demographics',    query: 'metric=reached_audience_demographics&period=lifetime&metric_type=total_value&breakdown=city' },
  { metric: 'profile_links_taps',               query: 'metric=profile_links_taps&period=day&metric_type=total_value' },
]

/**
 * Metric per-postingan Facebook. Penting justru KARENA page_impressions mati:
 * kalau reach tingkat Page tidak ada lagi, tingkat postingan adalah satu-satunya
 * jalan tersisa untuk mengukur jangkauan Facebook.
 */
const KANDIDAT_FB_POST: KandidatMetrik[] = [
  { metric: 'post_impressions', query: 'metric=post_impressions' },
  { metric: 'post_impressions_unique', query: 'metric=post_impressions_unique' },
  { metric: 'post_engaged_users', query: 'metric=post_engaged_users' },
  { metric: 'post_clicks', query: 'metric=post_clicks' },
  { metric: 'post_reactions_by_type_total', query: 'metric=post_reactions_by_type_total' },
]

export async function jalankanProbeMedsos(slug: string, cfg: ConfigProbe): Promise<HasilCek[]> {
  cekBatasLaju(slug)

  const token = cfg.insights_token || cfg.access_token || ''
  const hasil: HasilCek[] = []

  // 1) Token & scope
  if (!token) {
    return [{ kunci: 'token', label: 'Token Insights/Ads', status: 'gagal', pesan: 'Belum ada token. Isi "Token Insights/Ads" (atau token WhatsApp) di form Meta.' }]
  }
  const rMe = await graphGet('me?fields=id,name', token)
  if (!rMe.ok) {
    hasil.push({ kunci: 'token', label: 'Token Insights/Ads', status: 'gagal', pesan: 'Token tidak valid / kedaluwarsa: ' + pesanErrorGraph(rMe) })
    return hasil   // percuma lanjut kalau token mati
  }
  const rPerm = await graphGet('me/permissions', token)
  if (rPerm.ok && Array.isArray(rPerm.json?.data)) {
    const granted = rPerm.json.data.filter((p: any) => p.status === 'granted').map((p: any) => p.permission)
    const kurang  = SCOPE_WAJIB.filter(s => !granted.includes(s))
    hasil.push({
      kunci: 'token', label: 'Token & Scope', status: kurang.length ? 'gagal' : 'ok',
      pesan: kurang.length ? `Token valid, tapi scope kurang: ${kurang.join(', ')}` : 'Token valid & semua scope wajib tersedia.',
      detail: `granted: ${granted.join(', ') || '(kosong)'}`,
    })
  } else {
    // Token Page/System User kadang tidak mengembalikan /me/permissions — anggap valid.
    hasil.push({ kunci: 'token', label: 'Token', status: 'ok', pesan: `Token valid (akun: ${rMe.json?.name ?? rMe.json?.id ?? '-'}). Daftar scope tidak bisa dibaca dari token ini — verifikasi lewat cek di bawah.` })
  }

  // Helper cek berbasis endpoint
  async function cek(kunci: string, label: string, idField: string | null | undefined, path: string, sukses: (j: any) => string, fase?: string) {
    if (!idField) { hasil.push({ kunci, label, status: 'lewati', pesan: 'ID belum diisi di form.', fase }); return }
    const r: GraphResult = await graphGet(path, token)
    if (r.ok) hasil.push({ kunci, label, status: 'ok', pesan: sukses(r.json), detail: potong(r.json), fase })
    else      hasil.push({ kunci, label, status: 'gagal', pesan: pesanErrorGraph(r), fase })
  }

  /**
   * Penemuan metric: uji tiap kandidat sendiri-sendiri, laporkan mana yang hidup.
   * Membedakan dua sebab kegagalan yang tampak sama di mata pengguna — nama metric
   * yang sudah dihapus Meta (code 100) versus izin/akses yang kurang (selainnya).
   */
  async function temukanMetrik(kunci: string, label: string, objId: string | null | undefined, kandidat: KandidatMetrik[], fase?: string) {
    if (!objId) { hasil.push({ kunci, label, status: 'lewati', pesan: 'ID belum tersedia.', fase }); return }

    const hidup: string[] = [], mati: string[] = []
    let galatLain = ''

    for (const k of kandidat) {
      const r = await graphGet(`${objId}/insights?${k.query}`, token)
      if (r.ok) { hidup.push(k.metric); continue }
      if (r.json?.error?.code === 100) mati.push(k.metric)
      else if (!galatLain) galatLain = pesanErrorGraph(r)
    }

    hasil.push({
      kunci, label, fase,
      status: hidup.length ? 'ok' : 'gagal',
      pesan: hidup.length
        ? `${hidup.length} dari ${kandidat.length} metric bisa ditarik: ${hidup.join(', ')}.`
        : galatLain
          ? `Tidak ada metric yang bisa ditarik — ${galatLain}`
          : 'Semua kandidat ditolak Graph sebagai nama tak dikenal. Daftar metric kemungkinan berubah lagi di versi Graph ini.',
      detail: `hidup: ${hidup.join(', ') || '(tidak ada)'}\nditolak (nama tak dikenal): ${mati.join(', ') || '(tidak ada)'}${galatLain ? `\ngalat lain: ${galatLain}` : ''}`,
    })
  }

  // 2) Facebook Page
  await cek('page', 'Facebook Page', cfg.page_id, `${cfg.page_id}?fields=name,followers_count,fan_count`,
    j => `Page "${j.name}" — ${j.followers_count ?? j.fan_count ?? '?'} follower.`)

  await temukanMetrik('page_insights', 'Facebook Page Insights', cfg.page_id, KANDIDAT_PAGE)

  // 4) Instagram account
  await cek('ig', 'Instagram Account', cfg.ig_business_id, `${cfg.ig_business_id}?fields=username,followers_count,media_count`,
    j => `IG @${j.username} — ${j.followers_count ?? '?'} follower, ${j.media_count ?? '?'} media.`)

  // 5) Instagram account Insights
  await temukanMetrik('ig_insights', 'Instagram Insights (akun)', cfg.ig_business_id, KANDIDAT_IG_AKUN)

  // 6) Instagram media — ambil satu contoh, lalu pakai id-nya untuk memetakan
  //    metric per-konten. Konten terbaru dipakai karena Insights IG hanya tersedia
  //    untuk konten yang belum terlalu lama.
  let contohMediaId: string | null = null
  let contohMediaTipe = ''
  // Contoh kedua khusus video/Reels: metric keluarga Reels tidak pernah sah pada
  // foto atau carousel, jadi mengujinya di contoh yang salah tipe hanya akan
  // melaporkan "mati" untuk metric yang sebenarnya tersedia.
  let contohVideoId: string | null = null
  let contohVideoTipe = ''

  if (!cfg.ig_business_id) {
    hasil.push({ kunci: 'ig_media', label: 'Instagram Media', status: 'lewati', pesan: 'IG Business ID belum diisi di form.' })
  } else {
    const r = await graphGet(`${cfg.ig_business_id}/media?fields=id,media_type,timestamp&limit=25`, token)
    if (r.ok) {
      const daftar: any[] = r.json?.data ?? []
      const m = daftar[0]
      contohMediaId   = m?.id ?? null
      contohMediaTipe = m?.media_type ?? ''

      const v = daftar.find(x => x.media_type === 'VIDEO' || x.media_type === 'REELS')
      if (v && v.id !== contohMediaId) { contohVideoId = v.id; contohVideoTipe = v.media_type }

      hasil.push({ kunci: 'ig_media', label: 'Instagram Media', status: 'ok', detail: potong(r.json),
        pesan: `${daftar.length} konten terbaru bisa ditarik (contoh: ${contohMediaTipe || 'konten'}${contohVideoTipe ? `, plus contoh ${contohVideoTipe}` : ''}).` })
    } else {
      hasil.push({ kunci: 'ig_media', label: 'Instagram Media', status: 'gagal', pesan: pesanErrorGraph(r) })
    }
  }

  // 6b) Metric per-konten IG. Metric yang sah berbeda antar tipe konten
  //     (REELS/VIDEO vs IMAGE), jadi tipe contohnya ikut dilaporkan.
  await temukanMetrik('ig_media_insights', `Instagram Insights (per konten — ${contohMediaTipe || 'konten'})`,
    contohMediaId, KANDIDAT_IG_MEDIA)

  // 6b-2) Gelombang lanjutan: sasaran utamanya `follows` & `profile_visits`.
  await temukanMetrik('ig_media_lanjut', `Instagram Atribusi (per konten — ${contohMediaTipe || 'konten'})`,
    contohMediaId, KANDIDAT_IG_MEDIA_LANJUT)

  if (contohVideoId) {
    await temukanMetrik('ig_media_video', `Instagram Atribusi (per konten — ${contohVideoTipe})`,
      contohVideoId, KANDIDAT_IG_MEDIA_LANJUT)
  }

  // 6b-3) Demografi audiens — dasar untuk mengetahui SIAPA yang dijangkau.
  await temukanMetrik('ig_demografi', 'Instagram Demografi Audiens', cfg.ig_business_id, KANDIDAT_IG_DEMOGRAFI)

  // 6c) Metric per-postingan Facebook — satu-satunya sisa jalan mengukur jangkauan
  //     FB setelah page_impressions dihapus Meta.
  let contohPostId: string | null = null
  if (cfg.page_id) {
    const r = await graphGet(`${cfg.page_id}/posts?fields=id&limit=1`, token)
    if (r.ok) contohPostId = r.json?.data?.[0]?.id ?? null
    else hasil.push({ kunci: 'fb_posts', label: 'Facebook Posts', status: 'gagal', pesan: pesanErrorGraph(r) })
  }
  await temukanMetrik('fb_post_insights', 'Facebook Insights (per postingan)', contohPostId, KANDIDAT_FB_POST)

  // 7) Marketing API (iklan) — butuh ads_read, DAN pemilik Ad Account memberi akses app.
  await cek('ads', 'Marketing API (Iklan)', cfg.ad_account_id, `${cfg.ad_account_id}/insights?date_preset=last_7d&fields=spend,impressions&limit=1`,
    j => `Ad Account bisa ditarik (${j.data?.length ?? 0} baris 7 hari terakhir).`, 'Fase 4')

  // 8) Langganan webhook Page — butuh pages_manage_metadata (satu-satunya izin non-baca).
  await cek('webhook', 'Langganan Webhook Page', cfg.page_id, `${cfg.page_id}/subscribed_apps`,
    j => `${j.data?.length ?? 0} app berlangganan webhook Page ini.`, 'Fase 2')

  return hasil
}
