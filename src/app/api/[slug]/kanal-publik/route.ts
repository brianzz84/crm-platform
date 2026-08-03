/**
 * GET /api/[slug]/kanal-publik
 *   ?kanal=youtube|ga4
 *   &mulai=YYYY-MM-DD&selesai=YYYY-MM-DD
 *   [&bandingMulai=YYYY-MM-DD&bandingSelesai=YYYY-MM-DD]
 *
 * Menarik data kanal publik langsung dari Google saat diminta. Dipisah per kanal
 * supaya satu kanal yang bermasalah (mis. Business Profile yang masih menunggu
 * allowlist) tidak menggagalkan tampilan kanal lain yang sudah hidup.
 *
 * Tanggal WAJIB divalidasi di sini: nilainya datang dari URL, dan tanpa penjagaan
 * ia langsung menjadi kueri ke Google — rentang bertahun-tahun bisa menghabiskan
 * kuota API tenant hanya karena satu URL yang diubah-ubah.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { periksaRentang, ringkasGa4, ringkasYouTube, type Rentang } from '@/lib/google-kanal'

type Ctx = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageBroadcast')
  if (error) return error

  const q     = req.nextUrl.searchParams
  const kanal = q.get('kanal') === 'ga4' ? 'ga4' : 'youtube'

  const cekUtama = periksaRentang(q.get('mulai') ?? '', q.get('selesai') ?? '')
  if (!cekUtama.ok) {
    return NextResponse.json({ success: false, error: `Periode: ${cekUtama.pesan}` }, { status: 400 })
  }

  // Pembanding opsional — hanya diproses bila KEDUA batasnya dikirim.
  let banding: Rentang | null = null
  const bMulai = q.get('bandingMulai'), bSelesai = q.get('bandingSelesai')
  if (bMulai && bSelesai) {
    const cekBanding = periksaRentang(bMulai, bSelesai)
    if (!cekBanding.ok) {
      return NextResponse.json({ success: false, error: `Pembanding: ${cekBanding.pesan}` }, { status: 400 })
    }
    banding = cekBanding.rentang
  }

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
      ? await ringkasGa4(params.slug, konfig, cekUtama.rentang, banding)
      : await ringkasYouTube(params.slug, konfig, cekUtama.rentang, banding)

    return NextResponse.json({ success: true, kanal, periode: cekUtama.rentang, banding, data })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 },
    )
  }
}
