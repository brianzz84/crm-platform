import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'

type Ctx = { params: { slug: string } }

// GET /api/[slug]/broadcast/layanan?q=... — cari layanan untuk dipilih sebagai
// "produk yang dipromosikan" saat membuat campaign.
//
// SENGAJA dibuat terpisah dari /api/[slug]/library?tab=layanan: endpoint itu dikunci
// ke izin `icdLibrary` (SUPER_ADMIN/ADMIN_IT), sedangkan yang membuat campaign adalah
// ADMIN_OPS lewat `manageBroadcast`. Memakai endpoint lama akan membuat ADMIN_OPS
// kena 403 saat mencari layanan di wizard broadcast.
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageBroadcast')
  if (error) return error

  try {
    const q  = req.nextUrl.searchParams.get('q')?.trim() ?? ''
    const db = await getTenantDb(params.slug)

    const data = await db.simrsLayananLibrary.findMany({
      where: {
        aktif: true,
        ...(q ? {
          OR: [
            { kode_barang: { contains: q, mode: 'insensitive' } },
            { nama:        { contains: q, mode: 'insensitive' } },
          ],
        } : {}),
      },
      select: { kode_barang: true, nama: true, kelompok: true },
      orderBy: [{ kelompok: 'asc' }, { nama: 'asc' }],
      take: 30,
    })

    return NextResponse.json({ success: true, data })
  } catch (e) {
    console.error('[GET /api/[slug]/broadcast/layanan]', e)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
