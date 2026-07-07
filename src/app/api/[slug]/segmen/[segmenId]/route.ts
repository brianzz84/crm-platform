import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { requireTenantPermission } from "@/lib/auth"
import { z } from 'zod'

type Ctx = { params: { slug: string; segmenId: string } }

// GET: detail segmen + daftar person
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageSegments')
  if (error) return error

  try {
    const db = await getTenantDb(params.slug)
    const { searchParams } = req.nextUrl
    const page    = Math.max(1, Number(searchParams.get('page') || 1))
    const perPage = 20

    const segmen = await db.segment.findFirst({
      where: { id: params.segmenId, tenant_slug: params.slug },
      include: { _count: { select: { segment_persons: true, campaigns: true } } },
    })

    if (!segmen) return NextResponse.json({ error: 'Segmen tidak ditemukan' }, { status: 404 })

    const [persons, total] = await Promise.all([
      db.segmentPerson.findMany({
        where: { segment_id: params.segmenId },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          segment: false,
        },
      }),
      db.segmentPerson.count({ where: { segment_id: params.segmenId } }),
    ])

    const personIds = persons.map(p => p.person_id)
    const personData = await db.person.findMany({
      where: { id: { in: personIds } },
      select: { id: true, name: true, no_hp: true, no_rm: true },
    })

    return NextResponse.json({
      success: true,
      data: { ...segmen, members: personData },
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    })
  } catch (err) {
    console.error('[GET /api/[slug]/segmen/[id]]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE: hapus segmen
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageSegments')
  if (error) return error

  try {
    const db = await getTenantDb(params.slug)
    const segmen = await db.segment.findFirst({
      where: { id: params.segmenId, tenant_slug: params.slug },
    })
    if (!segmen) return NextResponse.json({ error: 'Segmen tidak ditemukan' }, { status: 404 })

    await db.segmentPerson.deleteMany({ where: { segment_id: params.segmenId } })
    await db.segment.delete({ where: { id: params.segmenId } })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/[slug]/segmen/[id]]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
