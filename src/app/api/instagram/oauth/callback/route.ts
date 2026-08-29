/**
 * Callback Business Login for Instagram — SATU alamat untuk seluruh tenant.
 *
 * Slug sengaja tidak ada di path: Instagram menuntut redirect URI terdaftar
 * secara literal, sehingga slug di dalam path berarti tiap tenant baru menuntut
 * pendaftaran URI baru. Identitas tenant dibawa cookie state dari route start.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { alamatAplikasi } from '@/lib/google-oauth'
import { identitas, tukarKode } from '@/lib/instagram-messaging'
import { COOKIE_STATE_IG, alamatCallbackIg } from '@/app/api/[slug]/instagram/oauth/start/route'

function kembali(origin: string, slug: string | null, pesan?: string) {
  // Alamat publik, BUKAN origin permintaan: di balik proxy Railway origin bernilai
  // 0.0.0.0:3000 sehingga admin mendarat di halaman mati padahal penyambungan
  // sudah berhasil. Jebakan yang sama sudah pernah terjadi pada OAuth Google.
  const url = new URL(slug ? `/${slug}/pengaturan/meta` : '/', alamatAplikasi(origin))
  if (pesan) {
    url.searchParams.set('ig_oauth', 'gagal')
    url.searchParams.set('pesan', pesan)
  } else {
    url.searchParams.set('ig_oauth', 'sukses')
  }
  const res = new NextResponse(null, { status: 307, headers: { Location: url.toString() } })
  res.cookies.delete(COOKIE_STATE_IG)   // sekali pakai, apa pun hasilnya
  return res
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const q      = req.nextUrl.searchParams

  const cookie = req.cookies.get(COOKIE_STATE_IG)?.value ?? ''
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
      : `Instagram menolak: ${q.get('error_description') || galat}`)
  }

  const code = q.get('code')
  if (!code) return kembali(origin, slug, 'Instagram tidak mengirim kode otorisasi.')

  // Slug berasal dari cookie milik kita sendiri, tapi tetap diverifikasi terhadap
  // sesi: yang menyelesaikan callback harus memang berhak atas tenant ini.
  const { error } = await requireTenantPermission(req, slug, 'configSystem')
  if (error) return kembali(origin, slug, 'Anda tidak berhak mengubah konfigurasi tenant ini.')

  const appId     = process.env.INSTAGRAM_APP_ID
  const appSecret = process.env.INSTAGRAM_APP_SECRET
  if (!appId || !appSecret) {
    return kembali(origin, slug, 'INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET belum diset di server.')
  }

  const hasil = await tukarKode(appId, appSecret, alamatCallbackIg(), code)
  if (!hasil.ok) return kembali(origin, slug, hasil.pesan)

  // Identitas diperiksa SEBELUM disimpan: otorisasi dari akun Instagram yang
  // keliru akan tersimpan diam-diam dan baru ketahuan saat pesan tidak muncul.
  const siapa = await identitas(hasil.data.token)
  if (!siapa.ok) return kembali(origin, slug, `Token diperoleh tapi identitas gagal dibaca: ${siapa.pesan}`)

  try {
    const db = await getTenantDb(slug)
    await db.metaConfig.update({
      where: { tenant_slug: slug },
      data: {
        ig_msg_token:        hasil.data.token,
        ig_msg_user_id:      siapa.userId || hasil.data.userId,
        ig_msg_username:     siapa.username,
        // Kedaluwarsa disimpan eksplisit — token jalur ini MATI dalam 60 hari,
        // berbeda dari token lain di tabel ini yang tidak pernah kedaluwarsa.
        ig_msg_expires_at:   new Date(Date.now() + hasil.data.expiresIn * 1000),
        ig_msg_refreshed_at: new Date(),
        // Sengaja TIDAK menyalakan ig_msg_aktif di sini. Tersambung bukan berarti
        // terbukti: Uji baca percakapan yang menentukan, dan saklarnya dinyalakan
        // manual setelah itu.
      },
    })
  } catch (e) {
    return kembali(origin, slug, e instanceof Error ? e.message : 'Gagal menyimpan token.')
  }

  return kembali(origin, slug)
}
