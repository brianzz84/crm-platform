/**
 * Alur OAuth Google untuk CRM — menggantikan cara lama (admin menyalin refresh
 * token dari OAuth Playground).
 *
 * Kenapa dibangun di dalam aplikasi:
 * - Satu consent menutup TIGA layanan (Business Profile, YouTube, Analytics)
 *   karena semuanya memakai OAuth yang sama. Jalur manual menuntut prosedur
 *   diulang tiap kali scope bertambah.
 * - refresh_token tidak pernah melewati tangan manusia maupun papan klip.
 * - RS lain yang memakai CRM ini tidak akan sanggup memakai OAuth Playground.
 *
 * Keamanan: token TIDAK PERNAH di-log. State OAuth dipasangkan dengan cookie
 * httpOnly berumur pendek untuk menangkal CSRF.
 */
import { randomBytes } from 'crypto'

const AUTH_URL     = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL    = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

/**
 * Scope yang diminta. Sengaja HANYA BACA untuk layanan analitik — hak tulis
 * (mis. membalas komentar YouTube) baru ditambahkan saat fiturnya benar-benar
 * dibangun, supaya izin yang diminta tidak melebihi yang dipakai.
 *
 * Catatan: `business.manage` adalah satu-satunya scope Business Profile yang
 * tersedia; Google tidak menyediakan varian read-only untuknya.
 */
export const SCOPE_GOOGLE = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/business.manage',        // Google Business Profile
  'https://www.googleapis.com/auth/yt-analytics.readonly',  // YouTube Analytics
  'https://www.googleapis.com/auth/youtube.readonly',       // YouTube Data (judul, komentar)
  'https://www.googleapis.com/auth/analytics.readonly',     // Google Analytics 4
] as const

export const COOKIE_STATE = 'g_oauth_state'
export const STATE_TTL_DETIK = 600   // 10 menit — cukup untuk login, cukup pendek untuk aman

/**
 * Alamat callback WAJIB sama persis dengan yang didaftarkan di Google Cloud
 * Console. Sengaja TANPA slug tenant: Google menuntut redirect URI terdaftar
 * secara literal, sehingga slug di dalam path berarti tiap tenant baru menuntut
 * pendaftaran URI baru. Identitas tenant dibawa lewat cookie state.
 */
export function alamatCallback(): string {
  const base = process.env.NEXTAUTH_URL?.replace(/\/+$/, '')
  if (!base) throw new Error('NEXTAUTH_URL belum diset — alamat callback OAuth tidak bisa dipastikan')
  return `${base}/api/google/oauth/callback`
}

/** Nilai acak untuk dipasangkan antara parameter `state` dan cookie. */
export function buatNonce(): string {
  return randomBytes(24).toString('hex')
}

export function buatUrlOtorisasi(clientId: string, state: string): string {
  const q = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  alamatCallback(),
    response_type: 'code',
    scope:         SCOPE_GOOGLE.join(' '),
    access_type:   'offline',
    // Tanpa ini Google TIDAK mengirim refresh_token pada persetujuan ulang,
    // sehingga sambungan yang diperbarui akan kehilangan tokennya.
    prompt:        'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `${AUTH_URL}?${q.toString()}`
}

export interface HasilToken {
  refresh_token: string
  access_token:  string
  scopes:        string[]
}

export async function tukarKodeDenganToken(
  clientId: string, clientSecret: string, code: string,
): Promise<HasilToken> {
  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  alamatCallback(),
      grant_type:    'authorization_code',
    }),
  })
  const json = await res.json().catch(() => ({}))

  if (!res.ok) {
    // Pesan Google saja yang diteruskan — body lengkap bisa memuat token.
    const sebab = json?.error_description || json?.error || `HTTP ${res.status}`
    throw new Error(`Google menolak penukaran kode: ${sebab}`)
  }
  if (!json.refresh_token) {
    throw new Error(
      'Google tidak mengirim refresh token. Biasanya karena izin sebelumnya masih tersimpan — ' +
      'cabut akses aplikasi ini di myaccount.google.com/permissions lalu ulangi.',
    )
  }

  return {
    refresh_token: json.refresh_token,
    access_token:  json.access_token ?? '',
    scopes:        typeof json.scope === 'string' ? json.scope.split(' ').filter(Boolean) : [],
  }
}

/**
 * Ambil email akun pemberi izin. Dipakai untuk ditampilkan di halaman pengaturan
 * supaya salah akun (mis. login dengan akun pribadi, bukan akun pengelola
 * listing) langsung ketahuan alih-alih baru terasa saat data tidak muncul.
 */
export async function ambilEmailPemberiIzin(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) return null
    const json = await res.json()
    return typeof json?.email === 'string' ? json.email : null
  } catch {
    return null   // sekadar pelengkap tampilan — jangan gagalkan penyambungan
  }
}

/** Layanan mana yang tercakup oleh scope yang disetujui — untuk ditampilkan di UI. */
export function layananTercakup(scopes: string[]): { gbp: boolean; youtube: boolean; ga4: boolean } {
  const punya = (s: string) => scopes.some(x => x === s)
  return {
    gbp:     punya('https://www.googleapis.com/auth/business.manage'),
    youtube: punya('https://www.googleapis.com/auth/yt-analytics.readonly'),
    ga4:     punya('https://www.googleapis.com/auth/analytics.readonly'),
  }
}
