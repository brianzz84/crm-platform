import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'

type Ctx = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageSegments')
  if (error) return error

  try {
    const db   = await getTenantDb(params.slug)
    const logs = await db.simrsSyncLog.findMany({
      where:   { tenant_slug: params.slug },
      orderBy: { started_at: 'desc' },
      take:    30,
    })

    // Hitung summary 14 hari terakhir
    const cutoff = new Date(Date.now() - 14 * 86_400_000)
    const recent = logs.filter(l => new Date(l.started_at) >= cutoff)
    const done   = recent.filter(l => l.status === 'DONE')
    const failed = recent.filter(l => l.status === 'FAILED')

    const summary = {
      total_14d:       recent.length,
      sukses_14d:      done.length,
      gagal_14d:       failed.length,
      success_rate:    recent.length ? Math.round((done.length / recent.length) * 100) : null,
      total_baru_14d:  recent.reduce((s, l) => s + l.jumlah_baru, 0),
      total_update_14d: recent.reduce((s, l) => s + l.jumlah_update, 0),
    }

    return NextResponse.json({ success: true, data: logs, summary })
  } catch (e: any) {
    console.error('[GET /api/[slug]/simrs/logs]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
