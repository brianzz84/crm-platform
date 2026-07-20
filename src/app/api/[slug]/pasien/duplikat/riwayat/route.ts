import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'

type Ctx = { params: { slug: string } }

// GET /api/[slug]/pasien/duplikat/riwayat — riwayat penggabungan, terbaru dulu.
// Dipakai untuk pertanggungjawaban dan sebagai titik masuk pembatalan.
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'mergePatients')
  if (error) return error

  try {
    const db  = await getTenantDb(params.slug)
    const log = await db.personMergeLog.findMany({
      where:   { tenant_slug: params.slug },
      orderBy: { dilakukan_at: 'desc' },
      take:    50,
    })

    // Nama orang tidak disimpan di log (bisa berubah), jadi diambil saat dibaca.
    const ids = Array.from(new Set(log.flatMap(l => [l.person_sumber_id, l.person_tujuan_id])))
    const persons = await db.person.findMany({
      where:  { id: { in: ids } },
      select: { id: true, name: true, no_rm: true },
    })
    const byId = new Map(persons.map(p => [p.id, p]))

    return NextResponse.json({
      success: true,
      data: log.map(l => ({
        id:             l.id,
        alasan:         l.alasan,
        dilakukan_at:   l.dilakukan_at,
        dibatalkan_at:  l.dibatalkan_at,
        sumber:         byId.get(l.person_sumber_id) ?? null,
        tujuan:         byId.get(l.person_tujuan_id) ?? null,
        dipindahkan:    l.dipindahkan,
      })),
    })
  } catch (e) {
    console.error('[GET /api/[slug]/pasien/duplikat/riwayat]', e)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
