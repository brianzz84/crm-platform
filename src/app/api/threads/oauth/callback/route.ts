/**
 * GET /api/threads/oauth/callback
 *
 * Menerima kode otorisasi Threads, menukarnya jadi token 60 hari, memverifikasi
 * identitas pemiliknya, lalu menyimpannya.
 *
 * TANPA slug di path: Threads menuntut redirect URI terdaftar secara literal,
 * jadi identitas tenant dibawa lewat cookie state.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { alamatAplikasi } from '@/lib/google-oauth'
import {
  tukarKodeThreads, identitasThreads,
  COOKIE_STATE_THREADS, alamatCallbackThreads,
} from '@/lib/threads-api'

function kembali(origin: string, slug: string | null, galat?: string) {
  // Alamat PUBLIK, bukan origin permintaan: di balik proxy Railway `origin`
  // bernilai 0.0.0.0:3000, sehingga admin mendarat di halaman mati padahal
  // penyambungan sudah berhasil.
  //
  // Jebakan ini sudah tercatat dan sudah pernah terjadi dua kali — pada OAuth
  // Google, lalu pada Instagram. Versi pertama berkas ini mengulanginya untuk
  // ketiga kalinya, dan baru ketahuan saat endpointnya diuji langsung.
  const url = new URL(slug ? `/${slug}/pengaturan/meta` : '/', alamatAplikasi(origin))
  if (galat) url.searchParams.set('threads_error', galat)
  else if (slug) url.searchParams.set('threads', 'ok')
  return NextResponse.redirect(url.toString())
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const q      = req.nextUrl.searchParams

  const cookie = req.cookies.get(COOKIE_STATE_THREADS)?.value ?? ''
  const [nonce, slug] = cookie.split(':')
  if (!nonce || !slug) {
    return kembali(origin, null, 'Sesi penyambungan kedaluwarsa. Ulangi dari halaman Pengaturan.')
  }
  if (q.get('state') !== nonce) {
    return kembali(origin, slug, 'Verifikasi keamanan gagal (state tidak cocok). Ulangi penyambungan.')
  }

  const galat = q.get('error')
  if (galat) {
    return kembali(origin, slug, galat === 'access_denied'
      ? 'Penyambungan dibatalkan — izin tidak diberikan.'
      : `Threads menolak: ${q.get('error_description') || galat}`)
  }

  const code = q.get('code')
  if (!code) return kembali(origin, slug, 'Threads tidak mengirim kode otorisasi.')

  // Slug berasal dari cookie milik kita sendiri, tetapi tetap diverifikasi
  // terhadap sesi: yang menyelesaikan callback harus memang berhak atas tenant.
  const { error } = await requireTenantPermission(req, slug, 'configSystem')
  if (error) return kembali(origin, slug, 'Anda tidak berhak mengubah konfigurasi tenant ini.')

  const appId     = process.env.THREADS_APP_ID
  const appSecret = process.env.THREADS_APP_SECRET
  if (!appId || !appSecret) {
    return kembali(origin, slug, 'THREADS_APP_ID / THREADS_APP_SECRET belum diset di server.')
  }

  const hasil = await tukarKodeThreads(appId, appSecret, alamatCallbackThreads(), code)
  if (!hasil.ok) return kembali(origin, slug, hasil.pesan)

  // Identitas diperiksa SEBELUM disimpan: otorisasi dari akun yang keliru akan
  // tersimpan diam-diam dan baru ketahuan saat hasilnya kosong.
  const siapa = await identitasThreads(hasil.data.token)
  if (!siapa.ok) {
    return kembali(origin, slug, `Token diperoleh tapi identitas gagal dibaca: ${siapa.pesan}`)
  }

  try {
    const db = await getTenantDb(slug)
    await db.metaConfig.update({
      where: { tenant_slug: slug },
      data: {
        threads_token:        hasil.data.token,
        threads_user_id:      siapa.userId || hasil.data.userId,
        threads_username:     siapa.username,
        threads_expires_at:   new Date(Date.now() + hasil.data.expiresIn * 1000),
        threads_refreshed_at: new Date(),
      },
    })
  } catch (e) {
    return kembali(origin, slug, e instanceof Error ? e.message : 'Gagal menyimpan token.')
  }

  return kembali(origin, slug)
}
