/**
 * GET /api/[slug]/kanal-publik?kanal=youtube|ga4&hari=28
 *
 * Menarik data kanal publik langsung dari Google saat diminta. Dipisah per kanal
 * supaya satu kanal yang bermasalah (mis. Business Profile yang masih menunggu
 * allowlist) tidak menggagalkan tampilan kanal lain yang sudah hidup.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { ringkasGa4, ringkasYouTube, RENTANG_HARI, type RentangHari } from '@/lib/google-kanal'

type Ctx = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageBroadcast')
  if (error) return error

  const kanal = req.nextUrl.searchParams.get('kanal') ?? 'youtube'
  const hariQ = Number(req.nextUrl.searchParams.get('hari') ?? 28)
  // Rentang dibatasi daftar yang dikenal — jangan biarkan angka bebas dari URL
  // menjadi kueri ke Google.
  const hari = (RENTANG_HARI as readonly number[]).includes(hariQ)
    ? (hariQ as RentangHari)
    : 28

  try {
    const db  = await getTenantDb(params.slug)
    const cfg = await db.googleConfig.findUnique({ where: { tenant_slug: params.slug } })

    if (!cfg?.aktif || !cfg.refresh_token) {
      return NextResponse.json({
        success: false,
        error: 'Belum tersambung ke Google. Buka Pengaturan → Integrasi Google Business lalu klik "Hubungkan dengan Google".',
      }, { status: 400 })
    }

    const konfig = {
      client_id:          cfg.client_id,
      client_secret:      cfg.client_secret,
      refresh_token:      cfg.refresh_token,
      ga4_property_id:    cfg.ga4_property_id,
      youtube_channel_id: cfg.youtube_channel_id,
    }

    const data = kanal === 'ga4'
      ? await ringkasGa4(params.slug, konfig, hari)
      : await ringkasYouTube(params.slug, konfig, hari)

    return NextResponse.json({ success: true, kanal, hari, data })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 },
    )
  }
}
