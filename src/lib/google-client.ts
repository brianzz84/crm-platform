/**
 * Klien tipis untuk SELURUH layanan Google yang dipakai CRM: Business Profile,
 * Google Analytics 4, dan YouTube. Disatukan karena ketiganya berbagi satu OAuth
 * dan satu refresh token — memisahkannya per layanan hanya akan menggandakan
 * logika penukaran token dan cache-nya.
 *
 * Host-nya banyak karena Google memang memecah tiap layanan ke host sendiri, dan
 * ULASAN Business Profile masih tertinggal di API lama v4 sementara sisanya v1.
 *
 * Autentikasi: refresh token milik akun pengelola ditukar menjadi access token
 * berumur pendek, di-cache di memori proses sampai hampir kedaluwarsa supaya satu
 * probe tidak menukar berulang kali.
 *
 * Keamanan: hanya baca. client_secret dan refresh_token TIDAK PERNAH di-log
 * maupun dikembalikan ke pemanggil.
 */

// ── Google Business Profile ──
export const GBP_AKUN    = 'https://mybusinessaccountmanagement.googleapis.com/v1'
export const GBP_INFO    = 'https://mybusinessbusinessinformation.googleapis.com/v1'
export const GBP_PERFORMA = 'https://businessprofileperformance.googleapis.com/v1'
/** Ulasan belum dipindahkan Google ke v1 — masih di API lama. */
export const GBP_LAMA_V4 = 'https://mybusiness.googleapis.com/v4'

// ── Google Analytics 4 ──
/** Admin API: menemukan properti yang bisa diakses akun. */
export const GA4_ADMIN = 'https://analyticsadmin.googleapis.com/v1beta'
/** Data API: menarik laporan. Hanya menerima POST (runReport). */
export const GA4_DATA  = 'https://analyticsdata.googleapis.com/v1beta'

// ── YouTube ──
/** Data API: identitas channel, judul video, komentar. */
export const YT_DATA      = 'https://www.googleapis.com/youtube/v3'
/** Analytics API: metrik tontonan, retensi, pertumbuhan subscriber. */
export const YT_ANALYTICS = 'https://youtubeanalytics.googleapis.com/v2'

/** Scope tunggal yang mencakup seluruh pengelolaan Business Profile. */
export const SCOPE_GBP = 'https://www.googleapis.com/auth/business.manage'

export interface KredensialGoogle {
  client_id:     string
  client_secret: string
  refresh_token: string
}

export interface HasilGoogle {
  ok:     boolean
  status: number
  json:   any
}

// ── Cache access token per tenant (proses ini saja) ──
const cacheToken = new Map<string, { token: string; kedaluwarsa: number }>()

/**
 * Tukar refresh token menjadi access token. Melempar Error dengan pesan Google
 * apa adanya bila gagal — pemanggil (probe) yang memutuskan cara menampilkannya.
 */
export async function ambilAccessToken(slug: string, kredensial: KredensialGoogle): Promise<string> {
  const cached = cacheToken.get(slug)
  if (cached && cached.kedaluwarsa > Date.now()) return cached.token

  const body = new URLSearchParams({
    client_id:     kredensial.client_id,
    client_secret: kredensial.client_secret,
    refresh_token: kredensial.refresh_token,
    grant_type:    'refresh_token',
  })

  let res: Response
  try {
    res = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal:  AbortSignal.timeout(12_000),
    })
  } catch (e: any) {
    throw new Error(`Tidak bisa menghubungi Google: ${e?.message || 'network error'}`)
  }

  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.access_token) {
    // json.error contoh: "invalid_grant" (refresh token dicabut/kedaluwarsa),
    // "invalid_client" (client id/secret salah).
    const sebab = [json.error, json.error_description].filter(Boolean).join(' — ')
    throw new Error(sebab || `Gagal menukar refresh token (HTTP ${res.status})`)
  }

  const umur = Number(json.expires_in ?? 3600)
  cacheToken.set(slug, { token: json.access_token, kedaluwarsa: Date.now() + (umur - 60) * 1000 })
  return json.access_token as string
}

/** Buang cache token tenant — dipakai saat kredensial diubah. */
export function lupakanTokenTenant(slug: string): void {
  cacheToken.delete(slug)
}

/**
 * GET satu endpoint GBP. Tidak melempar; selalu mengembalikan HasilGoogle supaya
 * probe bisa melaporkan tiap kegagalan apa adanya.
 */
export async function googleGet(url: string, accessToken: string): Promise<HasilGoogle> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal:  AbortSignal.timeout(15_000),
    })
    const json = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, json }
  } catch (e: any) {
    return { ok: false, status: 0, json: { error: { message: e?.message || 'network error' } } }
  }
}

/**
 * POST satu endpoint Google. Dibutuhkan karena GA4 Data API hanya menerima POST
 * (`runReport`), berbeda dari layanan lain yang cukup GET. Sama seperti googleGet:
 * tidak melempar, selalu mengembalikan HasilGoogle supaya probe bisa melaporkan
 * tiap kegagalan apa adanya.
 */
export async function googlePost(url: string, accessToken: string, body: unknown): Promise<HasilGoogle> {
  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(body ?? {}),
      signal:  AbortSignal.timeout(15_000),
    })
    const json = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, json }
  } catch (e: any) {
    return { ok: false, status: 0, json: { error: { message: e?.message || 'network error' } } }
  }
}

/** Pesan error Google yang ramah dibaca admin. */
export function pesanErrorGoogle(r: HasilGoogle): string {
  const e = r.json?.error
  if (!e) return `HTTP ${r.status}`
  const bagian = [e.message, e.status, e.code ? `(code ${e.code})` : '']
  return bagian.filter(Boolean).join(' ').slice(0, 300)
}

/**
 * API v1 menyebut lokasi sebagai "locations/123", sedangkan API ulasan v4 menuntut
 * bentuk lengkap "accounts/456/locations/123". Penggabungan ini sumber kekeliruan
 * yang mudah terjadi, jadi disatukan di sini.
 */
export function namaLokasiV4(accountId: string, namaLokasi: string): string {
  const akun  = accountId.startsWith('accounts/') ? accountId : `accounts/${accountId}`
  const lokasi = namaLokasi.startsWith('locations/') ? namaLokasi : `locations/${namaLokasi}`
  return `${akun}/${lokasi}`
}
