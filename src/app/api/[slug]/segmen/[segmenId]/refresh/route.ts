import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { requireTenantPermission } from '@/lib/auth'
import { runSegmenSearch } from '../../search/route'

type Ctx = { params: { slug: string; segmenId: string } }

// POST: jalankan ulang filter tersimpan → perbarui anggota segmen
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageSegments')
  if (error) return error

  try {
    const db = await getTenantDb(params.slug)

    const segmen = await db.segment.findFirst({
      where: { id: params.segmenId, tenant_slug: params.slug },
    })
    if (!segmen) return NextResponse.json({ error: 'Segmen tidak ditemukan' }, { status: 404 })

    if (segmen.tipe === 'MANUAL') {
      return NextResponse.json({ error: 'Segmen manual tidak dapat di-refresh' }, { status: 400 })
    }

    const filter = (segmen.filter_def as any) || (segmen.simrs_params as any)
    if (!filter) {
      return NextResponse.json({ error: 'Segmen tidak punya definisi filter tersimpan' }, { status: 400 })
    }

    const { person_ids } = await runSegmenSearch(db, params.slug, filter)

    await db.$transaction([
      db.segmentPerson.deleteMany({ where: { segment_id: segmen.id } }),
      ...(person_ids.length
        ? [db.segmentPerson.createMany({
            data: person_ids.map((id: string) => ({ segment_id: segmen.id, person_id: id })),
            skipDuplicates: true,
          })]
        : []),
      db.segment.update({ where: { id: segmen.id }, data: { last_refresh_at: new Date() } }),
    ])

    return NextResponse.json({ success: true, total: person_ids.length })
  } catch (err) {
    console.error('[POST /api/[slug]/segmen/[segmenId]/refresh]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
