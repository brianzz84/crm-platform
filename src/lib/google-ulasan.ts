/**
 * Lapisan ulasan Google Business Profile.
 *
 * Semua ulasan dilayani API LAMA v4 (`mybusiness.googleapis.com/v4`) — tidak ada
 * padanannya di API v1 mana pun. Itu bukan pilihan kita: Google belum memindahkan
 * ulasan ke v1 sampai sekarang.
 *
 * Batas yang sudah diuji langsung ke API RKZ (27 Agu 2026), jangan ditebak ulang:
 *   - `pageSize` mentok di 50. Meminta 200 tetap mengembalikan 50.
 *   - `orderBy` DIDUKUNG: 'rating' (terburuk dulu), 'rating desc', 'updateTime desc'.
 *     Ini yang membuat daftar "perlu perhatian" cukup satu panggilan, bukan menyapu
 *     seluruh 1365 ulasan.
 *   - `GET .../reviews/{reviewId}` untuk SATU ulasan berhasil (HTTP 200). Karena itu
 *     CRM cukup menyimpan reviewId sebagai pegangan; teks bisa diambil hidup-hidup
 *     kapan pun, bahkan bertahun kemudian.
 *   - Media ulasan hanya menyediakan `thumbnailUrl`; tidak ada versi ukuran penuh.
 *     URL-nya terbuka tanpa token (bisa langsung jadi <img src>), tapi berumur
 *     pendek — perlakukan seperti `sampul_url` di SocialContent: segarkan tiap tarik.
 */

import {
  GBP_AKUN, GBP_INFO, GBP_LAMA_V4,
  ambilAccessToken, googleDelete, googleGet, googlePut, namaLokasiV4, pesanErrorGoogle,
  type HasilGoogle,
} from './google-client'
import { getTenantDb } from './tenant'

/** Batas keras dari Google — meminta lebih tidak berpengaruh. */
export const MAKS_ULASAN_PER_HALAMAN = 50

/** Batas panjang balasan menurut Google. */
export const MAKS_PANJANG_BALASAN = 4096

export type UrutanUlasan = 'terbaru' | 'terburuk' | 'terbaik'

const ORDER_BY: Record<UrutanUlasan, string> = {
  terbaru:  'updateTime desc',
  terburuk: 'rating',
  terbaik:  'rating desc',
}

const BINTANG: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }

/** 'FIVE' → 5. Mengembalikan 0 untuk STAR_RATING_UNSPECIFIED. */
export function keAngkaBintang(s: string | undefined): number {
  return BINTANG[s ?? ''] ?? 0
}

/**
 * Google menempelkan terjemahan ke dalam satu string yang sama, dengan bentuk
 * "<teks asli> (Translated by Google) <terjemahan>". Ditampilkan mentah, ulasan
 * terbaca seolah pengulas menulis dua kali dalam dua bahasa.
 */
export function pisahTerjemahan(teks: string | undefined): { asli: string; terjemahan: string | null } {
  if (!teks) return { asli: '', terjemahan: null }
  const penanda = '(Translated by Google)'
  const i = teks.indexOf(penanda)
  if (i === -1) return { asli: teks.trim(), terjemahan: null }
  return {
    asli:       teks.slice(0, i).trim(),
    terjemahan: teks.slice(i + penanda.length).trim() || null,
  }
}

export interface LokasiGbp {
  nama:  string // "locations/123"
  judul: string
}

export interface RingkasLokasi extends LokasiGbp {
  jumlahUlasan: number
  rataRata:     number | null
}

export interface UlasanGbp {
  reviewId:     string
  bintang:      number
  pengulas:     string
  fotoPengulas: string | null
  teks:         string
  terjemahan:   string | null
  dibuatPada:   string
  /// Berubah saat pengulas menyunting ulasannya ATAU saat balasan diubah. Dipakai
  /// snapshot untuk berhenti menarik begitu sampai pada ulasan yang tak berubah.
  diubahPada:   string
  balasan:      { teks: string; diperbaruiPada: string } | null
  fotoUlasan:   string[]
}

/**
 * Siapkan token + accountId untuk satu tenant.
 *
 * `account_id` boleh kosong di basis data — pada tenant RKZ memang kosong, dan
 * probe pun menemukannya saat berjalan. Jadi kalau kosong, ditelusuri ulang di
 * sini alih-alih menolak permintaan.
 */
export async function siapkanKlien(
  slug: string,
): Promise<{ ok: true; token: string; accountId: string } | { ok: false; pesan: string; status: number }> {
  const db  = await getTenantDb(slug)
  const cfg = await db.googleConfig.findUnique({ where: { tenant_slug: slug } })

  if (!cfg?.aktif || !cfg.refresh_token) {
    return {
      ok: false, status: 400,
      pesan: 'Belum tersambung ke Google. Buka Pengaturan → Integrasi Google Business lalu klik "Hubungkan dengan Google".',
    }
  }

  const token = await ambilAccessToken(slug, {
    client_id:     cfg.client_id,
    client_secret: cfg.client_secret,
    refresh_token: cfg.refresh_token,
  })

  const accountId = cfg.account_id?.trim() || (await ambilAccountId(token))?.id
  if (!accountId) {
    return { ok: false, status: 502, pesan: 'Akun Google Business tidak terbaca dari token ini.' }
  }

  return { ok: true, token, accountId }
}

/** Akun GBP pertama yang bisa diakses token ini. */
export async function ambilAccountId(token: string): Promise<{ id: string; nama: string } | null> {
  const r = await googleGet(`${GBP_AKUN}/accounts`, token)
  if (!r.ok) return null
  const a = (r.json?.accounts ?? [])[0]
  return a ? { id: a.name, nama: a.accountName ?? a.name } : null
}

/**
 * Seluruh lokasi di bawah satu akun, dengan paginasi.
 *
 * `readMask` sengaja minimal — halaman Kanal Publik hanya butuh judul. Meminta
 * field lain memperbesar respons tanpa ada yang memakainya.
 */
export async function daftarLokasi(token: string, accountId: string): Promise<LokasiGbp[]> {
  const keluar: LokasiGbp[] = []
  let pageToken = ''
  do {
    const q = new URLSearchParams({ readMask: 'name,title', pageSize: '100' })
    if (pageToken) q.set('pageToken', pageToken)
    const r = await googleGet(`${GBP_INFO}/${accountId}/locations?${q}`, token)
    if (!r.ok) break
    for (const l of r.json?.locations ?? []) {
      keluar.push({ nama: l.name, judul: l.title ?? l.name })
    }
    pageToken = r.json?.nextPageToken ?? ''
  } while (pageToken)
  return keluar
}

/**
 * Rating dan jumlah ulasan tiap lokasi.
 *
 * Murah dengan sengaja: `totalReviewCount` dan `averageRating` ikut pada respons
 * ulasan MANA PUN, jadi cukup meminta satu ulasan per lokasi. Menariknya lewat
 * pageSize=1 membuat tujuh kartu di Kanal Publik hanya berongkos tujuh panggilan
 * kecil, bukan menyapu 1636 ulasan.
 */
export async function ringkasSemuaLokasi(
  token: string, accountId: string, lokasi: LokasiGbp[],
): Promise<RingkasLokasi[]> {
  return Promise.all(lokasi.map(async (l) => {
    const r = await googleGet(
      `${GBP_LAMA_V4}/${namaLokasiV4(accountId, l.nama)}/reviews?pageSize=1`, token,
    )
    return {
      ...l,
      jumlahUlasan: r.ok ? (r.json?.totalReviewCount ?? 0) : 0,
      rataRata:     r.ok && r.json?.averageRating != null ? Number(r.json.averageRating) : null,
    }
  }))
}

/** Bentuk mentah satu ulasan dari API v4 — semua opsional, karena Google memang
 *  menghilangkan field yang kosong (ulasan tanpa teks tidak punya `comment`). */
export interface UlasanMentah {
  reviewId?: string
  starRating?: string
  comment?: string
  createTime?: string
  updateTime?: string
  reviewer?: { displayName?: string; profilePhotoUrl?: string }
  reviewReply?: { comment?: string; updateTime?: string }
  reviewMediaItems?: { thumbnailUrl?: string }[]
}

export function petakanUlasan(u: UlasanMentah): UlasanGbp {
  const { asli, terjemahan } = pisahTerjemahan(u.comment)
  return {
    reviewId:     u.reviewId ?? '',
    bintang:      keAngkaBintang(u.starRating),
    pengulas:     u.reviewer?.displayName ?? 'Tanpa nama',
    fotoPengulas: u.reviewer?.profilePhotoUrl ?? null,
    teks:         asli,
    terjemahan,
    dibuatPada:   u.createTime ?? '',
    diubahPada:   u.updateTime ?? u.createTime ?? '',
    balasan:      u.reviewReply
      ? { teks: u.reviewReply.comment ?? '', diperbaruiPada: u.reviewReply.updateTime ?? '' }
      : null,
    // Hanya thumbnail yang disediakan Google. URL-nya publik, jadi dipakai apa
    // adanya tanpa proxy.
    fotoUlasan:   (u.reviewMediaItems ?? [])
      .map(m => m.thumbnailUrl)
      .filter((s): s is string => !!s),
  }
}

export interface HalamanUlasan {
  ulasan:       UlasanGbp[]
  tokenLanjut:  string | null
  jumlahUlasan: number
  rataRata:     number | null
}

/**
 * Satu halaman ulasan untuk SATU lokasi.
 *
 * Sengaja per lokasi, bukan gabungan tujuh lokasi: paginasi Google berjalan per
 * lokasi dengan token yang tidak bisa disatukan. Menggabungkannya hanya bisa
 * dangkal (beberapa terbaru per lokasi lalu buntu), dan itu justru menyesatkan
 * pada listing utama yang ulasannya 1365.
 */
export async function ambilUlasan(
  token: string,
  accountId: string,
  namaLokasi: string,
  opsi: { urutan?: UrutanUlasan; tokenHalaman?: string; jumlah?: number } = {},
): Promise<{ ok: true; data: HalamanUlasan } | { ok: false; pesan: string; status: number }> {
  const q = new URLSearchParams({
    pageSize: String(Math.min(opsi.jumlah ?? MAKS_ULASAN_PER_HALAMAN, MAKS_ULASAN_PER_HALAMAN)),
    orderBy:  ORDER_BY[opsi.urutan ?? 'terbaru'],
  })
  if (opsi.tokenHalaman) q.set('pageToken', opsi.tokenHalaman)

  const r = await googleGet(
    `${GBP_LAMA_V4}/${namaLokasiV4(accountId, namaLokasi)}/reviews?${q}`, token,
  )
  if (!r.ok) return { ok: false, pesan: pesanErrorGoogle(r), status: r.status }

  return {
    ok: true,
    data: {
      ulasan:       (r.json?.reviews ?? []).map(petakanUlasan),
      tokenLanjut:  r.json?.nextPageToken ?? null,
      jumlahUlasan: r.json?.totalReviewCount ?? 0,
      rataRata:     r.json?.averageRating != null ? Number(r.json.averageRating) : null,
    },
  }
}

/** Satu ulasan lewat reviewId — dipakai menampilkan ulasan lama yang teksnya tidak lagi di cache. */
export async function ambilSatuUlasan(
  token: string, accountId: string, namaLokasi: string, reviewId: string,
): Promise<UlasanGbp | null> {
  const r = await googleGet(
    `${GBP_LAMA_V4}/${namaLokasiV4(accountId, namaLokasi)}/reviews/${encodeURIComponent(reviewId)}`,
    token,
  )
  return r.ok ? petakanUlasan(r.json) : null
}

/**
 * Kirim balasan. LANGSUNG TAYANG PUBLIK di Google Maps dan Search.
 *
 * Bersifat menimpa: kalau ulasan sudah pernah dibalas, teks lama hilang tanpa
 * jejak. Pemanggil WAJIB sudah memastikan admin menyetujui lewat dialog konfirmasi
 * — tidak ada mode peragaan di sini, berbeda dengan pesan WhatsApp.
 */
export async function kirimBalasan(
  token: string, accountId: string, namaLokasi: string, reviewId: string, teks: string,
): Promise<{ ok: true } | { ok: false; pesan: string; status: number }> {
  const bersih = teks.trim()
  if (!bersih) return { ok: false, pesan: 'Balasan kosong.', status: 400 }
  if (bersih.length > MAKS_PANJANG_BALASAN) {
    return { ok: false, pesan: `Balasan melebihi ${MAKS_PANJANG_BALASAN} karakter.`, status: 400 }
  }

  const r: HasilGoogle = await googlePut(
    `${GBP_LAMA_V4}/${namaLokasiV4(accountId, namaLokasi)}/reviews/${encodeURIComponent(reviewId)}/reply`,
    token,
    { comment: bersih },
  )
  return r.ok ? { ok: true } : { ok: false, pesan: pesanErrorGoogle(r), status: r.status }
}

/**
 * Tarik kembali balasan yang sudah tayang.
 *
 * Ada bukan sebagai pelengkap, melainkan sebagai pengaman: tanpa ini, balasan
 * pertama yang dikirim lewat CRM tidak bisa dibatalkan dari CRM — admin harus
 * membuka Google Business Profile Manager. Google mengembalikan badan kosong
 * saat berhasil.
 */
export async function hapusBalasan(
  token: string, accountId: string, namaLokasi: string, reviewId: string,
): Promise<{ ok: true } | { ok: false; pesan: string; status: number }> {
  const r = await googleDelete(
    `${GBP_LAMA_V4}/${namaLokasiV4(accountId, namaLokasi)}/reviews/${encodeURIComponent(reviewId)}/reply`,
    token,
  )
  return r.ok ? { ok: true } : { ok: false, pesan: pesanErrorGoogle(r), status: r.status }
}
