import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { ambilKontrakDoc } from '@/lib/simrs-kontrak'

type Ctx = { params: { slug: string } }

// GET /api/[slug]/simrs/kontrak — dokumentasi kontrak API SIMRS lengkap: daftar
// field (dari kode) + anotasi (dari DB) + bagian bebas + catatan umum.
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const db  = await getTenantDb(params.slug)
    const doc = await ambilKontrakDoc(db, params.slug)
    return NextResponse.json({ success: true, data: doc })
  } catch (e) {
    console.error('[GET /api/[slug]/simrs/kontrak]', e)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
