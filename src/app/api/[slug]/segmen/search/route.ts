import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { requireTenantPermission } from "@/lib/auth"
import { z } from 'zod'

const schema = z.object({
  units:       z.array(z.string()).optional(),
  icdCodes:    z.array(z.string()).optional(),
  periodeAwal: z.string().optional(),
  periodeAkhir:z.string().optional(),
  poli:        z.string().optional(),
})

// POST: search pasien berdasarkan params SIMRS di DB lokal
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageSegments')
  if (error) return error

  try {
    const body = await req.json()
    const p    = schema.parse(body)
    const db   = await getTenantDb(params.slug)

    const visitWhere: any = { aktif: true, person: { tenant_slug: params.slug, aktif: true } }

    if (p.units?.length) {
      visitWhere.unit = { in: p.units }
    }
    if (p.icdCodes?.length) {
      visitWhere.OR = [
        { diagnosa_kode: { in: p.icdCodes } },
        ...p.icdCodes.map(code => ({ diagnosa_kode: { startsWith: code } })),
      ]
    }
    if (p.periodeAwal) {
      visitWhere.tanggal = { ...visitWhere.tanggal, gte: new Date(p.periodeAwal) }
    }
    if (p.periodeAkhir) {
      visitWhere.tanggal = { ...visitWhere.tanggal, lte: new Date(p.periodeAkhir) }
    }
    if (p.poli) {
      visitWhere.poli = { contains: p.poli, mode: 'insensitive' }
    }

    const matchingVisits = await db.simrsVisit.findMany({
      where: visitWhere,
      select: { person_id: true },
      distinct: ['person_id'],
    })

    const personIds = matchingVisits.map(v => v.person_id)
    const persons   = await db.person.findMany({
      where: { id: { in: personIds } },
      select: { id: true, name: true, no_hp: true, no_rm: true },
      take: 50,
    })

    return NextResponse.json({
      success: true,
      data: { persons, total: personIds.length, person_ids: personIds },
    })
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Parameter tidak valid' }, { status: 400 })
    }
    console.error('[POST /api/[slug]/segmen/search]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
