import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getSapaanQueue } from '@/lib/queue'

type Ctx = { params: { slug: string } }

// POST — trigger manual sync SIMRS sekarang
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageSegments')
  if (error) return error

  try {
    const queue = getSapaanQueue()
    const jobId = `simrs-sync-manual-${params.slug}-${Date.now()}`

    await queue.add(
      'simrs-sync',
      { type: 'SIMRS_SYNC', tenantSlug: params.slug, mode: 'manual' },
      { jobId, removeOnComplete: 20, removeOnFail: 30 },
    )

    return NextResponse.json({ success: true, message: 'Sync dijadwalkan, akan berjalan dalam beberapa detik.' })
  } catch (e: any) {
    console.error('[POST /api/[slug]/simrs/sync]', e)
    return NextResponse.json({ error: 'Gagal menjadwalkan sync' }, { status: 500 })
  }
}

// GET — status sync terakhir
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageSegments')
  if (error) return error

  try {
    const { getLastSyncStatus } = await import('@/lib/simrs-sync')
    const last = await getLastSyncStatus(params.slug)

    return NextResponse.json({ success: true, data: last })
  } catch (e: any) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
