import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const db = await getTenantDb(params.slug)
    const items = await db.segment.findMany({
      where: { tenant_slug: params.slug },
      orderBy: { created_at: 'desc' },
      select: {
        id: true, nama: true, deskripsi: true, last_refresh_at: true,
        _count: { select: { segment_persons: true } },
      },
    })
    return NextResponse.json({ success: true, data: items })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
