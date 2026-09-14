/**
 * Lapisan Threads API — OAuth, identitas, dan pencarian kata kunci.
 *
 * ══ MENGAPA JALUR SENDIRI, BUKAN MENUMPANG YANG SUDAH ADA ══
 *
 * Threads punya host, kredensial aplikasi, dan token yang SEPENUHNYA terpisah
 * dari Instagram maupun Facebook. Token Instagram Login tidak berlaku di sini,
 * dan sebaliknya. Ini jalur ketiga, bukan cabang dari yang sudah ada.
 *
 * Bentuknya nyaris identik dengan `instagram-messaging.ts` — token pendek ditukar
 * jadi 60 hari, bisa disegarkan, dan mati diam-diam bila tidak dipantau. Berkas
 * ini sengaja meniru pola itu baris demi baris supaya orang yang sudah memahami
 * jalur Instagram tidak perlu mempelajari bentuk kedua.
 *
 * ══ YANG MEMBUAT THREADS BERBEDA DARI SELURUH SUMBER META LAIN ══
 *
 * `keyword_search` mencari TEKS PENUH unggahan publik orang lain. Instagram dan
 * Facebook tidak memberikan itu di tingkat akses mana pun — pencarian tagar
 * Instagram bahkan ditolak dengan tuntutan App Review ("Instagram Public Content
 * Access", diprobe 11 Sep 2026).
 *
 * Apakah Threads menuntut hal yang sama BELUM DIKETAHUI, dan itulah yang hendak
 * dijawab probe. Preseden kita berlawanan arah: tagar Instagram ditolak, tetapi
 * DM Instagram lewat Instagram Login justru jalan tanpa App Review karena kita
 * hanya melayani akun milik RKZ sendiri. Threads bisa jatuh di mana saja di
 * antara keduanya, jadi tidak ada yang dijanjikan sebelum dicoba.
 */

import { alamatAplikasi } from './google-oauth'

/**
 * Nama cookie state dan alamat callback.
 *
 * Ditaruh DI SINI, bukan di berkas rute, karena berkas rute Next.js hanya boleh
 * mengekspor penangan HTTP — ekspor lain ditolak saat pembuatan tipe. Jalur
 * Instagram menaruhnya di rute dan lolos hanya karena tipenya sudah terlanjur
 * dibuat sebelum aturan itu berlaku; jangan ditiru.
 */
export const COOKIE_STATE_THREADS = 'threads_oauth_state'

/** Satu alamat untuk seluruh tenant — Threads menuntut redirect URI terdaftar
 *  secara literal, jadi slug tidak boleh ada di dalam path. */
export function alamatCallbackThreads(): string {
  return `${alamatAplikasi()}/api/threads/oauth/callback`
}

const OAUTH_AUTHORIZE = 'https://threads.net/oauth/authorize'
const OAUTH_TOKEN     = 'https://graph.threads.net/oauth/access_token'
const GRAPH           = 'https://graph.threads.net'
const VERSI           = 'v1.0'

/**
 * Izin seminimal mungkin untuk membuktikan dua hal: identitas terbaca, dan
 * pencarian kata kunci boleh dipakai.
 *
 * `threads_basic` wajib ada sebagai dasar. `threads_keyword_search` adalah yang
 * sebenarnya diuji — bila ia yang ditolak, seluruh rencana Sebutan Publik lewat
 * Threads gugur dan sisanya tidak perlu dibangun.
 *
 * Izin lain (balasan, wawasan, penerbitan) SENGAJA belum diminta: tiap izin
 * tambahan memperluas permukaan yang bisa gagal tanpa menambah bukti, dan
 * layar izin yang panjang membuat pemilik akun ragu menyetujui.
 */
export const SCOPE_THREADS = [
  'threads_basic',
  'threads_keyword_search',
].join(',')

/**
 * Izin DASAR saja — jalur cadangan.
 *
 * Dasbor Meta (14 Sep 2026) menunjukkan `threads_basic` berstatus "Siap untuk
 * pengujian", sementara `threads_keyword_search` kosong dan satu-satunya
 * tindakannya "Tambahkan ke Tinjauan Aplikasi". Bila izin yang belum aktif ikut
 * diminta, LAYAR IZINNYA SENDIRI bisa ditolak — dan penyambungan gagal sebelum
 * sempat membuktikan apa pun.
 *
 * Dengan cadangan ini, penyambungan tetap bisa diselesaikan memakai izin dasar,
 * lalu probe memanggil `keyword_search` apa adanya. Galat yang muncul di situ
 * jauh lebih berguna daripada layar izin yang menolak tanpa keterangan: ia
 * datang dari endpointnya sendiri, bukan dari pemeriksaan di depan.
 */
export const SCOPE_THREADS_DASAR = 'threads_basic'

export type JsonThreads = Record<string, unknown> & {
  error?: { message?: string; type?: string; code?: number } | string
}
export interface HasilThreads { ok: boolean; status: number; json: JsonThreads }

async function panggil(url: string, init?: RequestInit): Promise<HasilThreads> {
  try {
    const res  = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) })
    const json = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, json }
  } catch (e) {
    const pesan = e instanceof Error ? e.message : 'network error'
    return { ok: false, status: 0, json: { error: { message: pesan } } }
  }
}

/** Pesan galat Threads yang ramah dibaca admin. */
export function pesanGalatThreads(r: HasilThreads): string {
  const e = r.json?.error ?? (r.json?.error_message as string | undefined)
  if (!e) return `HTTP ${r.status}`
  if (typeof e === 'string') return e.slice(0, 400)
  return [e.message, e.type, e.code ? `(code ${e.code})` : '']
    .filter(Boolean).join(' ').slice(0, 400)
}

/** URL yang dibuka admin untuk memberi izin. */
export function urlOtorisasiThreads(
  appId: string, redirectUri: string, state: string, scope = SCOPE_THREADS,
): string {
  const q = new URLSearchParams({
    client_id:     appId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope,
    state,
  })
  return `${OAUTH_AUTHORIZE}?${q}`
}

export interface TokenThreads {
  token:     string
  userId:    string
  expiresIn: number // detik
}

/**
 * Tukar kode otorisasi menjadi token 60 hari.
 *
 * DUA langkah, dan yang kedua tidak boleh dilewat: penukaran pertama hanya
 * menghasilkan token berumur satu jam. Melewatkannya mengulang bentuk kegagalan
 * yang sudah pernah terjadi pada Page token — token mati diam-diam, dan
 * ketahuannya sepuluh hari kemudian.
 */
export async function tukarKodeThreads(
  appId: string, appSecret: string, redirectUri: string, kode: string,
): Promise<{ ok: true; data: TokenThreads } | { ok: false; pesan: string }> {
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
  if (!pendek.ok) return { ok: false, pesan: `tukar kode: ${pesanGalatThreads(pendek)}` }

  const tokenPendek = String(pendek.json?.access_token ?? '')
  const userId      = String(pendek.json?.user_id ?? '')
  if (!tokenPendek) return { ok: false, pesan: 'Respons tidak memuat access_token.' }

  // `th_exchange_token` — bukan `ig_exchange_token`. Nama grant-nya berbeda per
  // platform meski bentuk alurnya sama.
  const q = new URLSearchParams({
    grant_type:    'th_exchange_token',
    client_secret: appSecret,
    access_token:  tokenPendek,
  })
  const panjang = await panggil(`${GRAPH}/access_token?${q}`)
  if (!panjang.ok) return { ok: false, pesan: `tukar token panjang: ${pesanGalatThreads(panjang)}` }

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
 * tengah umur (30 hari), bukan menjelang habis — satu kegagalan masih menyisakan
 * 30 hari untuk diperbaiki, alih-alih beberapa jam.
 */
export async function segarkanTokenThreads(
  token: string,
): Promise<{ ok: true; token: string; expiresIn: number } | { ok: false; pesan: string }> {
  const q = new URLSearchParams({ grant_type: 'th_refresh_token', access_token: token })
  const r = await panggil(`${GRAPH}/refresh_access_token?${q}`)
  if (!r.ok) return { ok: false, pesan: pesanGalatThreads(r) }
  return {
    ok: true,
    token: String(r.json.access_token ?? ''),
    expiresIn: Number(r.json.expires_in ?? 0),
  }
}

/** Identitas pemilik token — memastikan akun yang benar yang terotorisasi. */
export async function identitasThreads(
  token: string,
): Promise<{ ok: true; userId: string; username: string } | { ok: false; pesan: string }> {
  const q = new URLSearchParams({ fields: 'id,username', access_token: token })
  const r = await panggil(`${GRAPH}/${VERSI}/me?${q}`)
  if (!r.ok) return { ok: false, pesan: pesanGalatThreads(r) }
  return {
    ok: true,
    userId:   String(r.json.id ?? ''),
    username: String(r.json.username ?? ''),
  }
}

export interface UnggahanThreads {
  id: string
  teks: string | null
  username: string | null
  tautan: string | null
  terbitPada: string | null
}

/**
 * Cari unggahan publik yang memuat kata kunci.
 *
 * INILAH yang membuat Threads berharga bagi Sebutan Publik: pencarian teks penuh
 * di seluruh platform, bukan hanya konten yang menandai akun kita. Instagram
 * tidak pernah memberikan ini.
 *
 * `search_type` RECENT dipilih, bukan TOP: modul ini mengejar kelengkapan
 * pemantauan, bukan popularitas. Unggahan sepi yang mengeluh justru yang paling
 * perlu terbaca, dan TOP akan mengubur tepat unggahan semacam itu.
 */
export async function cariKataKunciThreads(
  token: string, kata: string, limit = 50,
): Promise<{ ok: true; data: UnggahanThreads[]; mentah: JsonThreads }
         | { ok: false; pesan: string; status: number; mentah: JsonThreads }> {
  const q = new URLSearchParams({
    q: kata,
    search_type: 'RECENT',
    fields: 'id,text,username,permalink,timestamp',
    limit: String(limit),
    access_token: token,
  })
  const r = await panggil(`${GRAPH}/${VERSI}/keyword_search?${q}`)
  if (!r.ok) {
    return { ok: false, pesan: pesanGalatThreads(r), status: r.status, mentah: r.json }
  }

  const data = ((r.json?.data ?? []) as Record<string, unknown>[]).map(u => ({
    id:         String(u.id ?? ''),
    teks:       (u.text as string | undefined) ?? null,
    username:   (u.username as string | undefined) ?? null,
    tautan:     (u.permalink as string | undefined) ?? null,
    terbitPada: (u.timestamp as string | undefined) ?? null,
  })).filter(u => u.id)

  return { ok: true, data, mentah: r.json }
}
