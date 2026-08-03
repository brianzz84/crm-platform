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
 * Kandidat metric Page Insights beserta period yang sah untuknya.
 *
 * Meta memangkas banyak metric Page Insights (berlaku 2024) dan memangkasnya lagi
 * tiap versi Graph. Menembak SATU metric seperti sebelumnya membuat probe merah
 * dengan galat "(#100) must be a valid insights metric" — yang terbaca seolah izin
 * kurang, padahal izinnya baik-baik saja dan hanya nama metric-nya yang sudah mati.
 *
 * Maka: uji beberapa kandidat satu per satu (satu metric tak sah menggagalkan
 * seluruh permintaan bila digabung), lalu laporkan mana yang benar-benar hidup.
 * Hasilnya sekaligus menjadi daftar metric yang boleh dipakai data collector F1.
 */
const KANDIDAT_METRIK_PAGE: { metric: string; period: string }[] = [
  { metric: 'page_impressions',          period: 'day' },
  { metric: 'page_impressions_unique',   period: 'day' },
  { metric: 'page_post_engagements',     period: 'day' },
  { metric: 'page_daily_follows_unique', period: 'day' },
  { metric: 'page_fan_adds',             period: 'day' },
  { metric: 'page_views_total',          period: 'day' },
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

  // 2) Facebook Page
  await cek('page', 'Facebook Page', cfg.page_id, `${cfg.page_id}?fields=name,followers_count,fan_count`,
    j => `Page "${j.name}" — ${j.followers_count ?? j.fan_count ?? '?'} follower.`)

  // 3) Facebook Page Insights — uji beberapa kandidat metric, laporkan yang hidup
  if (!cfg.page_id) {
    hasil.push({ kunci: 'page_insights', label: 'Facebook Page Insights', status: 'lewati', pesan: 'Page ID belum diisi di form.' })
  } else {
    const hidup: string[] = []
    const mati:  string[] = []
    let galatIzin = ''

    for (const { metric, period } of KANDIDAT_METRIK_PAGE) {
      const r = await graphGet(`${cfg.page_id}/insights?metric=${metric}&period=${period}`, token)
      if (r.ok) { hidup.push(metric); continue }
      // code 100 = nama metric tidak dikenal versi Graph ini (bukan soal izin).
      if (r.json?.error?.code === 100) mati.push(metric)
      else if (!galatIzin) galatIzin = pesanErrorGraph(r)
    }

    hasil.push({
      kunci: 'page_insights', label: 'Facebook Page Insights',
      status: hidup.length ? 'ok' : 'gagal',
      pesan: hidup.length
        ? `${hidup.length} dari ${KANDIDAT_METRIK_PAGE.length} metric bisa ditarik: ${hidup.join(', ')}.`
        : galatIzin
          ? `Tidak ada metric yang bisa ditarik — ${galatIzin}`
          : 'Semua kandidat metric ditolak Graph sebagai nama tak dikenal. Daftar metric Page kemungkinan berubah lagi di versi Graph ini.',
      detail: `hidup: ${hidup.join(', ') || '(tidak ada)'}\nditolak (nama tak dikenal): ${mati.join(', ') || '(tidak ada)'}${galatIzin ? `\ngalat lain: ${galatIzin}` : ''}`,
    })
  }

  // 4) Instagram account
  await cek('ig', 'Instagram Account', cfg.ig_business_id, `${cfg.ig_business_id}?fields=username,followers_count,media_count`,
    j => `IG @${j.username} — ${j.followers_count ?? '?'} follower, ${j.media_count ?? '?'} media.`)

  // 5) Instagram account Insights
  await cek('ig_insights', 'Instagram Insights', cfg.ig_business_id, `${cfg.ig_business_id}/insights?metric=reach&period=day`,
    j => `Insights IG bisa ditarik (${j.data?.length ?? 0} metric).`)

  // 6) Instagram media (daftar konten)
  await cek('ig_media', 'Instagram Media', cfg.ig_business_id, `${cfg.ig_business_id}/media?fields=id,media_type,timestamp&limit=1`,
    j => `Daftar media IG bisa ditarik (${j.data?.length ?? 0} contoh).`)

  // 7) Marketing API (iklan) — butuh ads_read, DAN pemilik Ad Account memberi akses app.
  await cek('ads', 'Marketing API (Iklan)', cfg.ad_account_id, `${cfg.ad_account_id}/insights?date_preset=last_7d&fields=spend,impressions&limit=1`,
    j => `Ad Account bisa ditarik (${j.data?.length ?? 0} baris 7 hari terakhir).`, 'Fase 4')

  // 8) Langganan webhook Page — butuh pages_manage_metadata (satu-satunya izin non-baca).
  await cek('webhook', 'Langganan Webhook Page', cfg.page_id, `${cfg.page_id}/subscribed_apps`,
    j => `${j.data?.length ?? 0} app berlangganan webhook Page ini.`, 'Fase 2')

  return hasil
}
