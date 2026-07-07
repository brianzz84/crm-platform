import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { requireTenantPermission } from "@/lib/auth"
import { z } from 'zod'

const createSchema = z.object({
  nama:         z.string().min(1),
  deskripsi:    z.string().optional(),
  nlp_query:    z.string().optional(),
  simrs_params: z.record(z.string(), z.any()).optional(),
  person_ids:   z.array(z.string()).optional(),
})

// GET: list semua segmen tenant
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageSegments')
  if (error) return error

  try {
    const db  = await getTenantDb(params.slug)
    const { searchParams } = req.nextUrl
    const q   = searchParams.get('q') || ''
    const page = Math.max(1, Number(searchParams.get('page') || 1))
    const perPage = 20

    const where = {
      tenant_slug: params.slug,
      ...(q && { nama: { contains: q, mode: 'insensitive' as const } }),
    }

    const [segmen, total] = await Promise.all([
      db.segment.findMany({
        where,
        orderBy: { updated_at: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          _count: { select: { segment_persons: true, campaigns: true } },
        },
      }),
      db.segment.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      data: segmen,
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    })
  } catch (err) {
    console.error('[GET /api/[slug]/segmen]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST: simpan segmen baru
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { session, error } = await requireTenantPermission(req, params.slug, 'manageSegments')
  if (error) return error

  try {
    const body = await req.json()
    const data = createSchema.parse(body)
    const db   = await getTenantDb(params.slug)

    const segmen = await db.segment.create({
      data: {
        tenant_slug:    params.slug,
        nama:           data.nama,
        deskripsi:      data.deskripsi,
        nlp_query:      data.nlp_query,
        simrs_params:   data.simrs_params as any,
        created_by:     session!.userId,
        last_refresh_at: new Date(),
        ...(data.person_ids?.length && {
          segment_persons: {
            createMany: {
              data: data.person_ids.map(id => ({ person_id: id })),
              skipDuplicates: true,
            },
          },
        }),
      },
    })

    return NextResponse.json({ success: true, data: segmen }, { status: 201 })
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Data tidak valid', details: err.errors }, { status: 400 })
    }
    console.error('[POST /api/[slug]/segmen]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
