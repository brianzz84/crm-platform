/**
 * Callback OAuth Google — SATU alamat untuk seluruh tenant.
 *
 * Sengaja tidak memuat slug di path: Google menuntut redirect URI terdaftar
 * secara literal, sehingga slug di dalam path berarti tiap tenant baru menuntut
 * pendaftaran URI baru di Cloud Console. Identitas tenant dibawa lewat cookie
 * state yang dipasang oleh route `oauth/start`.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { lupakanTokenTenant } from '@/lib/google-business-client'
import {
  alamatAplikasi, ambilEmailPemberiIzin, COOKIE_STATE, tukarKodeDenganToken,
} from '@/lib/google-oauth'

function kembali(origin: string, slug: string | null, pesan?: string) {
  // Alamat publik, BUKAN origin permintaan: di balik proxy Railway origin bernilai
  // 0.0.0.0:3000 sehingga admin mendarat di halaman mati padahal penyambungannya
  // sudah berhasil.
  const url = new URL(slug ? `/${slug}/pengaturan/google-bisnis` : '/', alamatAplikasi(origin))
  if (pesan) {
    url.searchParams.set('oauth', 'gagal')
    url.searchParams.set('pesan', pesan)
  } else {
    url.searchParams.set('oauth', 'sukses')
  }
  const res = new NextResponse(null, { status: 307, headers: { Location: url.toString() } })
  res.cookies.delete(COOKIE_STATE)   // sekali pakai, apa pun hasilnya
  return res
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const q      = req.nextUrl.searchParams

  // Pasangkan state dari Google dengan cookie yang kita pasang saat memulai.
  const cookie = req.cookies.get(COOKIE_STATE)?.value ?? ''
  const [nonceCookie, slug] = cookie.split(':')
  if (!nonceCookie || !slug) {
    return kembali(origin, null, 'Sesi penyambungan kedaluwarsa. Ulangi dari halaman Pengaturan.')
  }
  if (q.get('state') !== nonceCookie) {
    return kembali(origin, slug, 'Verifikasi keamanan gagal (state tidak cocok). Ulangi penyambungan.')
  }

  // Admin membatalkan di layar Google.
  const galatGoogle = q.get('error')
  if (galatGoogle) {
    return kembali(origin, slug, galatGoogle === 'access_denied'
      ? 'Penyambungan dibatalkan — izin tidak diberikan.'
      : `Google menolak: ${galatGoogle}`)
  }

  const code = q.get('code')
  if (!code) return kembali(origin, slug, 'Google tidak mengirim kode otorisasi.')

  // Slug berasal dari cookie milik kita sendiri, tapi tetap diverifikasi terhadap
  // sesi: yang menyelesaikan callback harus memang berhak atas tenant ini.
  const { error } = await requireTenantPermission(req, slug, 'configSystem')
  if (error) return kembali(origin, slug, 'Sesi Anda tidak berwenang menyambungkan tenant ini.')

  try {
    const db  = await getTenantDb(slug)
    const cfg = await db.googleConfig.findUnique({ where: { tenant_slug: slug } })
    if (!cfg?.client_id || !cfg?.client_secret) {
      return kembali(origin, slug, 'Client ID / Client Secret tidak ditemukan. Simpan dulu kredensialnya.')
    }

    const token = await tukarKodeDenganToken(cfg.client_id, cfg.client_secret, code)
    const email = await ambilEmailPemberiIzin(token.access_token)

    await db.googleConfig.update({
      where: { tenant_slug: slug },
      data: {
        refresh_token:   token.refresh_token,
        scopes:          token.scopes,
        connected_at:    new Date(),
        connected_email: email,
      },
    })

    // Kredensial berganti → access token hasil cache tidak lagi sah.
    lupakanTokenTenant(slug)

    return kembali(origin, slug)

  } catch (e) {
    return kembali(origin, slug, e instanceof Error ? e.message : 'Gagal menyelesaikan penyambungan')
  }
}
