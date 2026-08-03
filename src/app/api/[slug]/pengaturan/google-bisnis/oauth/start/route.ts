/**
 * Mulai penyambungan Google: alihkan admin ke layar persetujuan Google.
 * Nonce disimpan di cookie httpOnly dan dikirim sebagai `state`; pasangan itu
 * yang diperiksa di callback untuk menangkal CSRF.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { alamatAplikasi, buatNonce, buatUrlOtorisasi, COOKIE_STATE, STATE_TTL_DETIK } from '@/lib/google-oauth'

type Ctx = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  // Alamat publik, bukan origin permintaan — lihat catatan di alamatAplikasi().
  const halamanPengaturan = new URL(
    `/${params.slug}/pengaturan/google-bisnis`,
    alamatAplikasi(req.nextUrl.origin),
  )

  try {
    const db  = await getTenantDb(params.slug)
    const cfg = await db.googleConfig.findUnique({ where: { tenant_slug: params.slug } })

    if (!cfg?.client_id || !cfg?.client_secret) {
      halamanPengaturan.searchParams.set('oauth', 'gagal')
      halamanPengaturan.searchParams.set('pesan', 'Isi dan simpan Client ID serta Client Secret lebih dulu.')
      return NextResponse.redirect(halamanPengaturan)
    }

    const nonce = buatNonce()
    const res   = NextResponse.redirect(buatUrlOtorisasi(cfg.client_id, nonce))

    // Slug ikut disimpan di cookie karena alamat callback sengaja tanpa slug.
    res.cookies.set(COOKIE_STATE, `${nonce}:${params.slug}`, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',          // 'lax' wajib: cookie harus ikut saat Google mengalihkan balik
      path:     '/',
      maxAge:   STATE_TTL_DETIK,
    })
    return res

  } catch (e) {
    halamanPengaturan.searchParams.set('oauth', 'gagal')
    halamanPengaturan.searchParams.set('pesan', e instanceof Error ? e.message : 'Gagal memulai penyambungan')
    return NextResponse.redirect(halamanPengaturan)
  }
}
