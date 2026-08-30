/**
 * Instagram Messaging lewat jalur "Instagram API with Instagram Login".
 *
 * JALUR BERBEDA, bukan pengganti sebagian. Host, jenis token, dan model izinnya
 * semuanya lain dari integrasi Meta yang sudah berjalan:
 *
 *   lama  → graph.facebook.com   · Page token            · instagram_manage_messages
 *   ini   → graph.instagram.com  · Instagram User token  · instagram_business_manage_messages
 *
 * ALASAN PINDAH. Jalur lama tersandung `{page-id}/conversations?platform=instagram`
 * yang konsisten mengembalikan timeout (subcode 2534084). Dokumentasi Meta untuk
 * jalur ini menyatakan syarat aksesnya ditentukan oleh AKUN SIAPA yang dilayani:
 *
 *   "Standard Access if your app serves Instagram professional accounts you own
 *    or manage or have added to your app in the App Dashboard."
 *
 * CRM hanya melayani @rkz_surabaya — akun rumah sakit sendiri. Dan yang dimaksud
 * "app user" oleh Meta adalah pemilik akun profesional yang mengotorisasi app,
 * BUKAN orang yang mengirim DM. Analisis sebelumnya keliru pada titik itu.
 *
 * ⚠️ Token di jalur ini KEDALUWARSA — 60 hari, dapat disegarkan. Berbeda dari
 * Page token yang tidak pernah mati. Token yang mati diam-diam sudah pernah
 * menelan sepuluh hari tanpa disadari, jadi `expires_at` wajib dipantau.
 */

const OAUTH_AUTHORIZE = 'https://www.instagram.com/oauth/authorize'
const OAUTH_TOKEN     = 'https://api.instagram.com/oauth/access_token'
const GRAPH           = 'https://graph.instagram.com'
const VERSI           = 'v21.0'

/** Izin seminimal mungkin. Jangan ditambah sebelum messaging dasar terbukti —
 *  tiap izin tambahan memperluas permukaan yang bisa gagal tanpa menambah bukti. */
export const SCOPE_IG_MSG = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
].join(',')

/** Respons mentah Graph. Sengaja longgar — bentuk balasan Instagram berbeda
 *  antar endpoint, dan memaksakan satu tipe kaku hanya memindahkan kebohongan
 *  dari runtime ke tipe. */
export type JsonIg = Record<string, unknown> & {
  error?: { message?: string; type?: string; code?: number } | string
}
export interface HasilIg { ok: boolean; status: number; json: JsonIg }

async function panggil(url: string, init?: RequestInit): Promise<HasilIg> {
  try {
    const res  = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) })
    const json = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, json }
  } catch (e) {
    const pesan = e instanceof Error ? e.message : 'network error'
    return { ok: false, status: 0, json: { error: { message: pesan } } }
  }
}

/** Pesan galat Instagram yang ramah dibaca admin. */
export function pesanGalatIg(r: HasilIg): string {
  const e = r.json?.error ?? (r.json?.error_message as string | undefined)
  if (!e) return `HTTP ${r.status}`
  if (typeof e === 'string') return e.slice(0, 300)
  return [e.message, e.type, e.code ? `(code ${e.code})` : '']
    .filter(Boolean).join(' ').slice(0, 300)
}

/** URL yang dibuka admin untuk memberi izin. */
export function urlOtorisasi(appId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id:     appId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         SCOPE_IG_MSG,
    state,
  })
  return `${OAUTH_AUTHORIZE}?${q}`
}

export interface TokenPanjang {
  token:     string
  userId:    string
  expiresIn: number // detik
}

/**
 * Tukar kode otorisasi menjadi token 60 hari.
 *
 * DUA langkah, dan yang kedua tidak boleh dilewat: penukaran pertama hanya
 * menghasilkan token berumur satu jam. Melewatkannya akan mengulang bentuk
 * kegagalan yang sama seperti insiden Page token 18 Agustus.
 */
export async function tukarKode(
  appId: string, appSecret: string, redirectUri: string, kode: string,
): Promise<{ ok: true; data: TokenPanjang } | { ok: false; pesan: string }> {
  const form = new URLSearchParams({
    client_id:     appId,
    client_secret: appSecret,
    grant_type:    'authorization_code',
    redirect_uri:  redirectUri,
    code:          kode,
  })

  const pendek = await panggil(OAUTH_TOKEN, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    form.toString(),
  })
  if (!pendek.ok) return { ok: false, pesan: `tukar kode: ${pesanGalatIg(pendek)}` }

  const tokenPendek = String(pendek.json?.access_token ?? '')
  const userId      = String(pendek.json?.user_id ?? '')
  if (!tokenPendek) return { ok: false, pesan: 'Respons tidak memuat access_token.' }

  const q = new URLSearchParams({
    grant_type:    'ig_exchange_token',
    client_secret: appSecret,
    access_token:  tokenPendek,
  })
  const panjang = await panggil(`${GRAPH}/access_token?${q}`)
  if (!panjang.ok) return { ok: false, pesan: `tukar token panjang: ${pesanGalatIg(panjang)}` }

  return {
    ok: true,
    data: {
      token:     String(panjang.json.access_token ?? ''),
      userId,
      expiresIn: Number(panjang.json.expires_in ?? 0),
    },
  }
}

/**
 * Perpanjang token yang sudah ada.
 *
 * Token harus berumur minimal 24 jam sebelum bisa disegarkan. Penjadwalannya di
 * tengah umur (30 hari), bukan menjelang habis — satu kali kegagalan masih
 * menyisakan 30 hari untuk diperbaiki, alih-alih beberapa jam.
 */
export async function segarkanToken(
  token: string,
): Promise<{ ok: true; token: string; expiresIn: number } | { ok: false; pesan: string }> {
  const q = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token })
  const r = await panggil(`${GRAPH}/refresh_access_token?${q}`)
  if (!r.ok) return { ok: false, pesan: pesanGalatIg(r) }
  return {
    ok: true,
    token: String(r.json.access_token ?? ''),
    expiresIn: Number(r.json.expires_in ?? 0),
  }
}

/** Identitas pemilik token — dipakai memastikan akun yang benar yang terotorisasi. */
export async function identitas(
  token: string,
): Promise<{ ok: true; userId: string; username: string } | { ok: false; pesan: string }> {
  const q = new URLSearchParams({ fields: 'user_id,username', access_token: token })
  const r = await panggil(`${GRAPH}/${VERSI}/me?${q}`)
  if (!r.ok) return { ok: false, pesan: pesanGalatIg(r) }
  return {
    ok: true,
    userId:   String(r.json.user_id ?? r.json.id ?? ''),
    username: String(r.json.username ?? ''),
  }
}

export interface PesertaIg { id: string; username: string | null }
export interface PercakapanIg {
  id: string
  diperbaruiPada: string | null
  /** Hanya terisi bila diminta lewat `denganPeserta`. */
  peserta?: PesertaIg[]
}

/**
 * Daftar percakapan. INILAH pemutus apakah App Review bisa dihindari.
 *
 * Tiga bentuk kegagalan punya arti yang sangat berbeda, dan membedakannya adalah
 * inti dari seluruh percobaan ini:
 *   - menyebut Advanced Access / App Review → hipotesis terbantah, review wajib
 *   - timeout atau "reduce the amount of data" → BUKAN jawaban soal akses
 *   - galat izin biasa → konfigurasi, bukan tingkat akses
 */
export async function daftarPercakapan(
  token: string, batas = 25, denganPeserta = false,
): Promise<{ ok: true; data: PercakapanIg[] } | { ok: false; pesan: string; status: number }> {
  const q = new URLSearchParams({
    // Peserta hanya diminta bila dibutuhkan: probe cukup tahu percakapannya
    // terbaca, sedangkan penarik Inbox butuh tahu siapa lawan bicaranya.
    fields:       denganPeserta ? 'id,updated_time,participants' : 'id,updated_time',
    limit:        String(batas),
    access_token: token,
  })
  const r = await panggil(`${GRAPH}/${VERSI}/me/conversations?${q}`)
  if (!r.ok) return { ok: false, pesan: pesanGalatIg(r), status: r.status }
  return {
    ok: true,
    data: ((r.json?.data ?? []) as {
      id: string
      updated_time?: string
      participants?: { data?: { id: string; username?: string }[] }
    }[]).map(c => ({
      id: c.id,
      diperbaruiPada: c.updated_time ?? null,
      peserta: c.participants?.data?.map(p => ({
        id: String(p.id), username: p.username ?? null,
      })),
    })),
  }
}

interface PesanMentah {
  id: string
  from?: { id?: string; username?: string }
  message?: string
  created_time?: string
}

export interface PesanIg {
  id: string
  dari: string
  dariNama: string | null
  teks: string
  dibuatPada: string | null
}

/** Isi satu percakapan. */
export async function isiPercakapan(
  token: string, percakapanId: string,
): Promise<{ ok: true; data: PesanIg[] } | { ok: false; pesan: string; status: number }> {
  const q = new URLSearchParams({
    fields:       'messages{id,from,message,created_time}',
    access_token: token,
  })
  const r = await panggil(`${GRAPH}/${VERSI}/${encodeURIComponent(percakapanId)}?${q}`)
  if (!r.ok) return { ok: false, pesan: pesanGalatIg(r), status: r.status }
  return {
    ok: true,
    data: (((r.json?.messages as { data?: PesanMentah[] } | undefined)?.data) ?? []).map(m => ({
      id:         m.id,
      dari:       m.from?.id ?? m.from?.username ?? '-',
      dariNama:   m.from?.username ?? null,
      teks:       m.message ?? '',
      dibuatPada: m.created_time ?? null,
    })),
  }
}

/**
 * Kirim balasan.
 *
 * Percakapan HARUS dimulai oleh pengguna, dan balasan hanya boleh dalam 24 jam
 * sejak pesan terakhir mereka. Ini batas Meta, sekaligus batas yang kita pilih
 * sendiri: CRM tidak pernah mengirim DM lebih dulu.
 */
export async function kirimPesan(
  token: string, igUserId: string, penerimaId: string, teks: string,
): Promise<{ ok: true } | { ok: false; pesan: string; status: number }> {
  const bersih = teks.trim()
  if (!bersih) return { ok: false, pesan: 'Pesan kosong.', status: 400 }

  const r = await panggil(`${GRAPH}/${VERSI}/${encodeURIComponent(igUserId)}/messages`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ recipient: { id: penerimaId }, message: { text: bersih } }),
  })
  return r.ok ? { ok: true } : { ok: false, pesan: pesanGalatIg(r), status: r.status }
}

/**
 * Menerjemahkan galat menjadi keputusan.
 *
 * Dipakai probe agar admin — dan kami — tidak lagi menyimpulkan "Advanced Access
 * wajib" dari galat yang sebenarnya tidak mengatakan apa pun soal akses. Persis
 * kekeliruan yang sudah sekali terjadi pada subcode 2534084.
 */
export function bacaArtiGalat(pesan: string): 'akses' | 'tidak-jelas' | 'konfigurasi' {
  const p = pesan.toLowerCase()
  if (p.includes('advanced access') || p.includes('app review') ||
      p.includes('permission') && p.includes('unavailable')) return 'akses'
  if (p.includes('timeout') || p.includes('reduce the amount of data')) return 'tidak-jelas'
  return 'konfigurasi'
}

/**
 * Segarkan token milik satu tenant, bila sudah waktunya.
 *
 * Dijalankan penjadwal harian. Ambangnya 30 hari — SETENGAH umur token, bukan
 * menjelang habis. Alasannya bukan kehati-hatian berlebihan: menunggu sampai
 * hari ke-59 berarti satu kali gangguan jaringan sudah cukup mematikan
 * integrasi, sedangkan pada hari ke-30 masih tersisa sebulan untuk memperbaiki.
 *
 * Ini pengaman langsung terhadap insiden 18 Agustus 2026, ketika token mati
 * diam-diam dan baru ketahuan sepuluh hari kemudian.
 */
export async function segarkanTokenTenant(
  slug: string, ambangHari = 30,
): Promise<{ status: 'disegarkan' | 'belum-waktunya' | 'tidak-ada' | 'gagal'; pesan: string }> {
  const { getTenantDb } = await import('./tenant')
  const db  = await getTenantDb(slug)
  const cfg = await db.metaConfig.findUnique({ where: { tenant_slug: slug } })

  if (!cfg?.ig_msg_token) return { status: 'tidak-ada', pesan: 'Instagram Messaging belum tersambung.' }

  const usiaHari = cfg.ig_msg_refreshed_at
    ? (Date.now() - cfg.ig_msg_refreshed_at.getTime()) / 86_400_000
    : Infinity

  // Meta menolak penyegaran token yang belum berumur 24 jam.
  if (usiaHari < 1) return { status: 'belum-waktunya', pesan: 'Token baru saja disegarkan.' }
  if (usiaHari < ambangHari) {
    return { status: 'belum-waktunya', pesan: `Baru ${Math.floor(usiaHari)} hari sejak penyegaran terakhir.` }
  }

  const hasil = await segarkanToken(cfg.ig_msg_token)
  if (!hasil.ok) return { status: 'gagal', pesan: hasil.pesan }

  await db.metaConfig.update({
    where: { tenant_slug: slug },
    data: {
      ig_msg_token:        hasil.token,
      ig_msg_expires_at:   new Date(Date.now() + hasil.expiresIn * 1000),
      ig_msg_refreshed_at: new Date(),
    },
  })
  const sisa = Math.floor(hasil.expiresIn / 86_400)
  return { status: 'disegarkan', pesan: `Token disegarkan, berlaku ${sisa} hari lagi.` }
}
