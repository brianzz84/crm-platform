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

/**
 * Potongan respons untuk ditampilkan di panel diagnostik.
 *
 * WAJIB membuang `paging` lebih dulu: Graph menaruh URL halaman berikutnya
 * LENGKAP DENGAN ACCESS TOKEN di dalamnya. Panel ini dibuat untuk ditempel ke
 * tiket atau percakapan dukungan — persis perbuatan yang membocorkan token
 * kalau isinya ditampilkan apa adanya. Sudah terjadi sekali; jangan lagi.
 *
 * Penyaringan berlapis dua dan itu disengaja: `paging` dibuang secara struktur,
 * lalu apa pun yang menyerupai token disamarkan dari teks akhirnya — supaya
 * bentuk balasan baru dari Meta yang menyelipkan token di tempat lain tetap
 * tertangkap tanpa perlu ada yang menyadarinya lebih dulu.
 */
const potong = (v: any, n = 240) => {
  const { paging: _paging, ...sisa } = (v ?? {}) as Record<string, unknown>
  return JSON.stringify(sisa)
    .replace(/access_token=[^"&\\]+/gi, 'access_token=[DISAMARKAN]')
    .replace(/EAA[A-Za-z0-9_-]{20,}/g, '[TOKEN DISAMARKAN]')
    .slice(0, n)
}

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
 * Rincian sumber jangkauan.
 *
 * Menjawab pertanyaan yang paling sering membingungkan: jangkauan melonjak padahal
 * tidak ada postingan baru — datangnya dari mana?
 *
 * Dua kemungkinan diuji berpasangan karena belum diketahui mana yang dilayani:
 * bergaya DERET HARIAN (`period=day`) atau hanya AGREGAT (`metric_type=total_value`).
 * Bedanya menentukan apakah rincian bisa ditempelkan ke tiap batang grafik, atau
 * hanya bisa disajikan sebagai ringkasan satu periode.
 */
const KANDIDAT_IG_RINCIAN: KandidatMetrik[] = [
  { metric: 'reach / media_product_type (harian)', query: 'metric=reach&period=day&breakdown=media_product_type' },
  { metric: 'reach / follow_type (harian)',        query: 'metric=reach&period=day&breakdown=follow_type' },
  { metric: 'reach / media_product_type (agregat)', query: 'metric=reach&period=day&metric_type=total_value&breakdown=media_product_type' },
  { metric: 'reach / follow_type (agregat)',        query: 'metric=reach&period=day&metric_type=total_value&breakdown=follow_type' },
  { metric: 'views / media_product_type (agregat)', query: 'metric=views&period=day&metric_type=total_value&breakdown=media_product_type' },
  { metric: 'total_interactions / media_product_type', query: 'metric=total_interactions&period=day&metric_type=total_value&breakdown=media_product_type' },
]

/**
 * Metric Story. Story hidup 24 jam dan endpoint `/stories` hanya mengembalikan yang
 * SEDANG aktif — tidak ada endpoint arsip. Karena itu daftar ini hanya bisa diuji
 * saat ada story tayang; hasil kosong bukan berarti gagal.
 *
 * `navigation` menuntut breakdown, sama seperti metric demografi.
 */
const KANDIDAT_IG_STORY: KandidatMetrik[] = [
  { metric: 'views', query: 'metric=views' },
  { metric: 'reach', query: 'metric=reach' },
  { metric: 'replies', query: 'metric=replies' },
  { metric: 'shares', query: 'metric=shares' },
  { metric: 'total_interactions', query: 'metric=total_interactions' },
  { metric: 'follows', query: 'metric=follows' },
  { metric: 'profile_visits', query: 'metric=profile_visits' },
  { metric: 'profile_activity', query: 'metric=profile_activity' },
  { metric: 'navigation', query: 'metric=navigation&breakdown=story_navigation_action_type' },
  { metric: 'exits', query: 'metric=exits' },
  { metric: 'taps_forward', query: 'metric=taps_forward' },
  { metric: 'impressions', query: 'metric=impressions' },
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
      // Token PENGGUNA menjawab /me/permissions; token PAGE tidak. Jadi terbacanya
      // daftar scope justru pertanda token yang SALAH JENIS untuk endpoint Halaman —
      // dan itu perlu dikatakan terang-terangan, sebab gejalanya di baris lain
      // (#190) terbaca seolah izin kurang, bukan jenis token yang keliru.
      pesan: 'INI TOKEN PENGGUNA, bukan token Page. Endpoint tingkat Halaman (Insights Page, ' +
             'postingan, percakapan, webhook) akan ditolak dengan galat #190. ' +
             'Jalankan me/accounts dengan token ini, lalu pakai access_token milik entri Page.' +
             (kurang.length ? ` Scope yang belum ada: ${kurang.join(', ')}.` : ''),
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

  // 6b-2b) BENTUK MENTAH balasan breakdown.
  //
  // `temukanMetrik` hanya memeriksa permintaannya diterima (HTTP 200) — dan itu
  // TIDAK sama dengan Graph benar-benar mengirim rinciannya. Meta punya kebiasaan
  // menerima parameter lalu mengabaikannya tanpa keluhan, persis seperti yang
  // terjadi pada izin dulu. Karena itu di sini yang ditampilkan adalah potongan
  // JSON apa adanya: klik barisnya untuk melihat strukturnya sendiri.
  if (cfg.ig_business_id) {
    for (const [kunci, label, kueri] of [
      ['bd_harian',  'Bentuk mentah — breakdown harian',  'metric=reach&period=day&breakdown=media_product_type'],
      ['bd_agregat', 'Bentuk mentah — breakdown agregat', 'metric=reach&period=day&metric_type=total_value&breakdown=media_product_type'],
    ] as const) {
      const r = await graphGet(`${cfg.ig_business_id}/insights?${kueri}`, token)
      hasil.push({
        kunci, label,
        status: r.ok ? 'ok' : 'gagal',
        pesan: r.ok
          ? 'Klik baris ini untuk melihat bentuk balasannya. Cari kata "breakdowns" atau "dimension_values" — kalau tidak ada, Graph mengabaikan permintaan rincian.'
          : pesanErrorGraph(r),
        detail: potong(r.json, 1200),
      })
    }
  }

  // 6b-3) Demografi audiens — dasar untuk mengetahui SIAPA yang dijangkau.
  await temukanMetrik('ig_demografi', 'Instagram Demografi Audiens', cfg.ig_business_id, KANDIDAT_IG_DEMOGRAFI)

  // 6b-3b) Rincian sumber jangkauan — menutup celah "melonjak tanpa postingan baru".
  await temukanMetrik('ig_rincian', 'Instagram Rincian Jangkauan', cfg.ig_business_id, KANDIDAT_IG_RINCIAN)

  // 6b-4) Story. Dua keadaan yang WAJIB dibedakan dan mudah tertukar:
  //   - endpoint bekerja tapi tidak ada story tayang  → bukan kegagalan
  //   - endpoint menolak                              → kegagalan sungguhan
  // Menyamakan keduanya akan membuat kita menyimpulkan "story tidak bisa ditarik"
  // hanya karena kebetulan probe dijalankan saat tidak ada story.
  let contohStoryId: string | null = null
  let adaStoryAktif = false

  if (!cfg.ig_business_id) {
    hasil.push({ kunci: 'ig_story', label: 'Instagram Story (aktif)', status: 'lewati', pesan: 'IG Business ID belum diisi di form.' })
  } else {
    const r = await graphGet(`${cfg.ig_business_id}/stories?fields=id,media_type,timestamp`, token)
    if (!r.ok) {
      hasil.push({ kunci: 'ig_story', label: 'Instagram Story (aktif)', status: 'gagal', pesan: pesanErrorGraph(r) })
    } else {
      const daftar: any[] = r.json?.data ?? []
      adaStoryAktif = daftar.length > 0
      contohStoryId = daftar[0]?.id ?? null
      hasil.push({
        kunci: 'ig_story', label: 'Instagram Story (aktif)', status: 'ok', detail: potong(r.json),
        pesan: adaStoryAktif
          ? `${daftar.length} story sedang tayang — metric-nya diuji di baris berikutnya.`
          : 'Endpoint bisa diakses, tapi TIDAK ADA story yang sedang tayang. Ini bukan kegagalan. Jalankan ulang probe saat ada story aktif agar daftar metric-nya bisa dipetakan.',
      })
    }
  }

  if (contohStoryId) {
    await temukanMetrik('ig_story_insights', 'Instagram Story Insights (per story)', contohStoryId, KANDIDAT_IG_STORY)
  } else if (adaStoryAktif === false && cfg.ig_business_id) {
    hasil.push({
      kunci: 'ig_story_insights', label: 'Instagram Story Insights (per story)', status: 'lewati',
      pesan: 'Menunggu ada story aktif untuk diuji.',
    })
  }

  // 6c) Metric per-postingan Facebook — satu-satunya sisa jalan mengukur jangkauan
  //     FB setelah page_impressions dihapus Meta.
  let contohPostId: string | null = null
  if (cfg.page_id) {
    const r = await graphGet(`${cfg.page_id}/posts?fields=id&limit=1`, token)
    if (r.ok) contohPostId = r.json?.data?.[0]?.id ?? null
    else hasil.push({ kunci: 'fb_posts', label: 'Facebook Posts', status: 'gagal', pesan: pesanErrorGraph(r) })
  }
  await temukanMetrik('fb_post_insights', 'Facebook Insights (per postingan)', contohPostId, KANDIDAT_FB_POST)

  // 6c) Riwayat percakapan — menentukan apakah CRM bisa membaca DM yang dibalas
  //     admin dari Business Suite, dan seberapa jauh ke belakang.
  //
  // Ini bukan sekadar kenyamanan: tanpa akses ke pesan KELUAR, response time tidak
  // bisa dihitung dan seluruh percakapan akan tampak "tidak terjawab" padahal sudah
  // dijawab di tempat lain. Angka yang salah arah begitu lebih berbahaya daripada
  // tidak ada angka sama sekali.
  for (const [kunci, label, platform] of [
    ['pct_fb', 'Riwayat Percakapan Facebook',  ''],
    ['pct_ig', 'Riwayat Percakapan Instagram', '&platform=instagram'],
  ] as const) {
    if (!cfg.page_id) {
      hasil.push({ kunci, label, status: 'lewati', pesan: 'Page ID belum diisi di form.', fase: 'Fase 2' })
      continue
    }
    // Tangga permintaan dari kaya ke ringan. `message_count` menuntut Graph
    // menghitung seluruh pesan tiap percakapan dan itulah yang memicu galat
    // "reduce the amount of data" (code 1) — galat UKURAN, bukan izin. Karena
    // pesannya mudah dikira penolakan, jalur ringan dicoba dulu sebelum
    // menyimpulkan apa pun.
    const tangga = [
      { fields: 'id,updated_time,message_count', limit: 10 },
      { fields: 'id,updated_time',               limit: 10 },
      { fields: 'id',                            limit: 3  },
    ]

    let r: GraphResult | null = null
    for (const t of tangga) {
      r = await graphGet(
        `${cfg.page_id}/conversations?fields=${t.fields}&limit=${t.limit}${platform}`,
        token, 30_000,
      )
      if (r.ok) break
      // Hanya galat ukuran yang layak dicoba lagi lebih ringan; galat izin tidak
      // akan berubah betapapun permintaannya diperkecil.
      if (r.json?.error?.code !== 1) break
    }

    if (!r?.ok) {
      hasil.push({ kunci, label, status: 'gagal', pesan: pesanErrorGraph(r!), fase: 'Fase 2' })
      continue
    }

    const daftar: any[] = r.json?.data ?? []
    const waktu = daftar.map(d => d.updated_time).filter(Boolean).sort()
    const pesanTotal = daftar.reduce((n, d) => n + Number(d.message_count ?? 0), 0)
    hasil.push({
      kunci, label, status: 'ok', fase: 'Fase 2', detail: potong(r.json, 400),
      pesan: daftar.length
        ? `${daftar.length} percakapan terbaca${pesanTotal ? `, ${pesanTotal} pesan` : ''}.` +
          (waktu.length ? ` Terlama: ${String(waktu[0]).slice(0, 10)} — riwayat sejauh itu bisa ditarik masuk.` : '')
        : 'Endpoint bisa diakses, tapi belum ada percakapan. Bukan kegagalan.',
    })
  }

  // 6d) PENELUSURAN percakapan.
  //
  // Galat yang muncul sejauh ini menyesatkan dua kali: #190 (ternyata salah jenis
  // token), lalu code 1 "reduce the amount of data" yang tidak berubah walau
  // permintaannya diperkecil sampai `fields=id&limit=3` — jadi ukurannya bukan
  // sebabnya. Alih-alih menebak lagi, di sini beberapa BENTUK endpoint diuji
  // sendiri-sendiri supaya terlihat mana yang benar-benar dilayani.
  if (cfg.page_id) {
    // `tasks` memberi tahu apa yang boleh dilakukan token ini pada Halaman.
    // Galat Facebook menyebut dua kemungkinan sekaligus — izin kurang ATAU peran
    // tidak memadai — dan hanya baris ini yang bisa memisahkan keduanya.
    const rt = await graphGet('me/accounts?fields=id,name,tasks', token, 20_000)
    const entri = (rt.json?.data ?? []).find((d: any) => String(d.id) === String(cfg.page_id))
    hasil.push({
      kunci: 'peran_page', label: 'Kewenangan Token pada Halaman', fase: 'Fase 2',
      // `me/accounts` hanya ada pada token PENGGUNA. Dengan token Page, `me` adalah
      // Halaman itu sendiri dan Graph menjawab #100 "nonexisting field" — kegagalan
      // yang murni karena cara bertanya, bukan karena kewenangan. Menandainya
      // 'gagal' akan menaruh merah palsu di panel dan mengaburkan yang sungguhan.
      status: rt.ok && entri ? 'ok' : rt.json?.error?.code === 100 ? 'lewati' : 'gagal',
      pesan: rt.json?.error?.code === 100
        ? 'Tidak bisa diperiksa dengan token Page — edge `accounts` hanya ada pada token pengguna. ' +
          'Jalankan me/accounts?fields=id,name,tasks di Graph API Explorer dengan token PENGGUNA untuk melihat daftar tugasnya.'
        : !rt.ok ? pesanErrorGraph(rt)
        : !entri ? 'Page tidak muncul di me/accounts — token ini bukan milik Halaman tersebut.'
        : `Tugas yang diizinkan: ${(entri.tasks ?? []).join(', ') || '(kosong)'}. ` +
          (String(entri.tasks ?? '').includes('MESSAGING')
            ? 'MESSAGING ADA — berarti penghalangnya izin app, bukan peran Anda di Halaman.'
            : 'MESSAGING TIDAK ADA — inilah sebabnya, bukan sekadar izin app.'),
      detail: potong(rt.json, 400),
    })

    for (const [kunci, label, jalur] of [
      ['pct_v1', 'Bentuk 1 — page/conversations',        `${cfg.page_id}/conversations?fields=id&limit=3`],
      ['pct_v2', 'Bentuk 2 — page + platform=instagram', `${cfg.page_id}/conversations?fields=id&limit=3&platform=instagram`],
      ['pct_v3', 'Bentuk 3 — ig-id/conversations',       `${cfg.ig_business_id ?? '0'}/conversations?fields=id&limit=3`],
      ['pct_v4', 'Bentuk 4 — me/conversations',          `me/conversations?fields=id&limit=3&platform=instagram`],
      ['pct_v5', 'Bentuk 5 — bersarang di Page',         `${cfg.page_id}?fields=conversations.limit(3){id}`],
    ] as const) {
      const r = await graphGet(jalur, token, 30_000)
      hasil.push({
        kunci, label, fase: 'Fase 2',
        status: r.ok ? 'ok' : 'gagal',
        pesan: r.ok ? 'Dilayani — bentuk inilah yang dipakai kolektor.' : pesanErrorGraph(r),
        detail: potong(r.json, 300),
      })
    }

    // 6e) UJI TUNTAS DM INSTAGRAM — dijalankan setelah aplikasi diterbitkan.
    //
    // Dua gerbang menghalangi DM Instagram sekaligus: aplikasi harus TERBIT, dan
    // izin harus Advanced Access lewat App Review. Selama keduanya tertutup,
    // galat yang muncul sama saja — `(#3) Application does not have the
    // capability` — sehingga mustahil tahu gerbang mana yang sebenarnya mengunci.
    //
    // Tiga cek di bawah memisahkannya. Kalau ternyata penerbitan saja cukup,
    // seluruh pekerjaan App Review tidak diperlukan.

    // (a) IZIN YANG MELEKAT PADA TOKEN INI.
    //
    // Menerbitkan aplikasi TIDAK menambahkan izin ke token yang sudah telanjur
    // dibuat — izin Meta tidak berlaku surut. Jadi bila daftar di bawah tidak
    // memuat izin pesan, penghalangnya bukan App Review melainkan token yang
    // dibuat sebelum izinnya ditambahkan, dan cukup dibuat ulang.
    //
    // `me/permissions` hanya ada pada token PENGGUNA; untuk token Page dipakai
    // `debug_token`. Keduanya dicoba supaya jenis token apa pun terbaca.
    {
      const IZIN_PESAN = [
        'instagram_manage_messages', 'pages_messaging',
        'instagram_business_manage_messages',
      ]

      let scopes: string[] = []
      let sumber = ''
      let galat  = ''

      const rp = await graphGet('me/permissions', token, 20_000)
      if (rp.ok) {
        scopes = (rp.json?.data ?? [])
          .filter((d: any) => d.status === 'granted')
          .map((d: any) => String(d.permission))
        sumber = 'me/permissions (token pengguna)'
      } else {
        // Token dipakai sebagai input DAN sebagai pemeriksa. Sah selama token itu
        // milik admin aplikasi — dan kalau tidak, galatnya sendiri yang memberi tahu.
        const rd = await graphGet(
          `debug_token?input_token=${encodeURIComponent(token)}`, token, 20_000,
        )
        if (rd.ok) {
          scopes = (rd.json?.data?.scopes ?? []).map(String)
          sumber = `debug_token (jenis: ${rd.json?.data?.type ?? '?'})`
        } else {
          galat = pesanErrorGraph(rd)
        }
      }

      const punya = IZIN_PESAN.filter(i => scopes.includes(i))
      hasil.push({
        kunci: 'izin_pesan_ig', label: 'Izin Pesan pada Token Ini', fase: 'Fase 2',
        status: galat ? 'gagal' : punya.length ? 'ok' : 'lewati',
        pesan: galat
          ? `Daftar izin tidak terbaca: ${galat}`
          : punya.length
            ? `${punya.join(', ')} SUDAH melekat pada token ini (${sumber}). ` +
              'Kalau DM Instagram tetap ditolak, penghalangnya App Review — bukan token.'
            : `Tidak satu pun izin pesan melekat pada token ini (${sumber}). ` +
              'Buat ULANG token setelah izin ditambahkan di dasbor — izin Meta tidak berlaku surut, ' +
              'jadi token lama tetap tanpa izin betapapun aplikasinya sudah terbit.',
        // Hanya nama izin yang ditampilkan. Respons mentahnya memuat token yang
        // sedang diperiksa, dan panel ini dibuat untuk ditempel ke tiket.
        detail: scopes.length ? `scopes: ${scopes.join(', ')}` : undefined,
      })
    }

    // (b) APAKAH AKUN INSTAGRAM MEMANG TERSAMBUNG KE HALAMAN INI.
    //
    // DM Instagram ditarik LEWAT Halaman, bukan langsung dari akun IG. Bila
    // sambungannya putus, seluruh galat di atas menjadi salah alamat: tidak ada
    // izin mana pun yang bisa memperbaikinya.
    {
      const r = await graphGet(
        `${cfg.page_id}?fields=instagram_business_account{id,username},connected_instagram_account{id,username}`,
        token, 20_000,
      )
      const iba = r.json?.instagram_business_account
      const cia = r.json?.connected_instagram_account
      hasil.push({
        kunci: 'ig_tersambung', label: 'Instagram Tersambung ke Halaman', fase: 'Fase 2',
        status: r.ok ? (iba || cia ? 'ok' : 'gagal') : 'gagal',
        pesan: !r.ok ? pesanErrorGraph(r)
          : iba ? `@${iba.username ?? iba.id} tersambung sebagai akun bisnis — jalur DM tersedia.`
          : cia ? `@${cia.username ?? cia.id} tersambung, tapi BUKAN sebagai akun bisnis. ` +
                  'DM hanya bisa ditarik dari akun Bisnis/Kreator yang tertaut Halaman.'
          : 'Tidak ada akun Instagram yang tertaut ke Halaman ini. Sambungkan dulu lewat ' +
            'Pengaturan Halaman → Instagram sebelum menguji DM.',
        detail: potong(r.json, 300),
      })
    }

    // (c) MEMBACA ISI PESAN, bukan sekadar daftar percakapan.
    //
    // Perbedaan ini menentukan. Mendaftar percakapan bisa saja dilayani sementara
    // membaca isinya ditolak — dan isi pesan itulah yang sebenarnya dibutuhkan
    // Inbox. Menyimpulkan "DM sudah bisa" dari daftar percakapan yang lolos adalah
    // persis jenis kekeliruan yang membuat kolektor dibangun di atas lubang.
    {
      const rDaftar = await graphGet(
        `${cfg.page_id}/conversations?fields=id&limit=1&platform=instagram`, token, 30_000,
      )
      const pctId = rDaftar.json?.data?.[0]?.id ?? null

      if (!rDaftar.ok) {
        hasil.push({
          kunci: 'ig_dm_isi', label: 'Isi Pesan Instagram (uji tuntas)', status: 'gagal', fase: 'Fase 2',
          pesan: `Daftar percakapan IG belum bisa dibuka, jadi isinya belum bisa diuji: ${pesanErrorGraph(rDaftar)}`,
        })
      } else if (!pctId) {
        hasil.push({
          kunci: 'ig_dm_isi', label: 'Isi Pesan Instagram (uji tuntas)', status: 'lewati', fase: 'Fase 2',
          pesan: 'Endpoint dilayani, tapi belum ada percakapan Instagram untuk diuji. ' +
                 'Kirim satu DM dari akun lain ke @akun RKZ, lalu jalankan probe ini lagi.',
        })
      } else {
        // `from{id,username}` diminta dengan subfield EKSPLISIT. Tanpa itu Graph
        // tidak selalu menyertakan id pengirim, dan arah pesan jatuh seluruhnya ke
        // "masuk" — kekeliruan senyap yang sudah pernah terjadi pada jalur Facebook
        // dan membuat setiap percakapan tampak tidak terjawab.
        const r = await graphGet(
          `${pctId}/messages?fields=id,created_time,from{id,username},message&limit=3`,
          token, 30_000,
        )
        const pesanMasuk: any[] = r.json?.data ?? []
        const adaArah = pesanMasuk.some(m => m?.from?.id)
        hasil.push({
          kunci: 'ig_dm_isi', label: 'Isi Pesan Instagram (uji tuntas)', fase: 'Fase 2',
          status: r.ok ? (adaArah ? 'ok' : 'gagal') : 'gagal',
          pesan: !r.ok ? pesanErrorGraph(r)
            : adaArah
              ? `${pesanMasuk.length} pesan terbaca lengkap dengan pengirimnya — ` +
                'DM Instagram siap ditarik ke Inbox tanpa App Review.'
              : 'Pesan terbaca tapi TANPA data pengirim. Arah masuk/keluar tidak bisa ' +
                'ditentukan, dan tanpa itu waktu tanggap akan salah hitung. Belum layak dipakai.',
          detail: potong(r.json, 400),
        })
      }
    }
  }

  // 7) Marketing API (iklan) — butuh ads_read, DAN pemilik Ad Account memberi akses app.
  await cek('ads', 'Marketing API (Iklan)', cfg.ad_account_id, `${cfg.ad_account_id}/insights?date_preset=last_7d&fields=spend,impressions&limit=1`,
    j => `Ad Account bisa ditarik (${j.data?.length ?? 0} baris 7 hari terakhir).`, 'Fase 4')

  // 8) Langganan webhook Page — butuh pages_manage_metadata (satu-satunya izin non-baca).
  await cek('webhook', 'Langganan Webhook Page', cfg.page_id, `${cfg.page_id}/subscribed_apps`,
    j => `${j.data?.length ?? 0} app berlangganan webhook Page ini.`, 'Fase 2')

  return hasil
}
