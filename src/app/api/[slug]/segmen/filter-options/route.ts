import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'

type Ctx = { params: { slug: string } }

/**
 * Opsi dinamis untuk form Buat Segmen — nilai yang benar-benar ada di data
 * tenant ini (bukan daftar hardcode). Sekarang: daftar penjamin dari kunjungan.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageSegments')
  if (error) return error

  try {
    const db = await getTenantDb(params.slug)

    // Penjamin = nama_instansi pada kunjungan NON_TUNAI (yang punya penjamin nyata).
    const rows = await db.simrsVisit.groupBy({
      by: ['nama_instansi'],
      where: { aktif: true, nama_instansi: { not: null } },
      _count: { _all: true },
    })
    const penjamin = rows
      .filter((r: any) => r.nama_instansi?.trim())
      .map((r: any) => ({ nama: r.nama_instansi as string, jumlah_kunjungan: r._count._all }))
      .sort((a: any, b: any) => b.jumlah_kunjungan - a.jumlah_kunjungan)

    return NextResponse.json({ penjamin })
  } catch (e) {
    console.error('[GET /api/[slug]/segmen/filter-options]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
