import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { requireTenantPermission } from "@/lib/auth"
import { runSegmenSearch, segmenSearchSchema } from '@/lib/segmen-search'

// POST: search pasien berdasarkan filter gabungan di DB lokal.
// Mesin pencariannya sendiri ada di @/lib/segmen-search — berkas route sengaja
// hanya memuat handler HTTP (konvensi Next.js), dan mesin itu juga dipakai oleh
// route refresh segmen serta tool AI Partner.
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageSegments')
  if (error) return error

  try {
    const body = await req.json()
    const p    = segmenSearchSchema.parse(body)
    const db   = await getTenantDb(params.slug)

    const data = await runSegmenSearch(db, params.slug, p)
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Parameter tidak valid' }, { status: 400 })
    }
    console.error('[POST /api/[slug]/segmen/search]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
