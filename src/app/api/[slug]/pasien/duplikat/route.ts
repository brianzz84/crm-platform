import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { cariCalonDuplikat } from '@/lib/person-merge'

type Ctx = { params: { slug: string } }

// GET /api/[slug]/pasien/duplikat — daftar calon duplikat untuk ditinjau petugas.
// Hanya MENGUSULKAN; penggabungan selalu lewat keputusan manusia (lihat /gabung).
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'mergePatients')
  if (error) return error

  try {
    const batas = Math.min(200, Number(req.nextUrl.searchParams.get('batas') ?? 100))
    const db    = await getTenantDb(params.slug)
    const data  = await cariCalonDuplikat(db, params.slug, batas)

    return NextResponse.json({ success: true, data })
  } catch (e) {
    console.error('[GET /api/[slug]/pasien/duplikat]', e)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
