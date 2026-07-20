import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { requireTenantPermission } from "@/lib/auth"
import { DEFAULT_PAGE_SIZE } from '@/constants'
import { z } from 'zod'

const CreateSchema = z.object({
  nama:            z.string().min(3),
  channel:         z.enum(['WA', 'IG', 'FB']).default('WA'),
  template_id:     z.string().uuid(),
  template_params: z.record(z.string(), z.string()).default({}),
  segment_id:      z.string().uuid(),
  jadwal_kirim:    z.string().datetime().optional().nullable(),
  kirim_dua_nomor: z.boolean().default(false),
})

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageBroadcast')
  if (error) return error

  try {
    const db     = await getTenantDb(params.slug)
    const search = req.nextUrl.searchParams
    const page   = Math.max(1, Number(search.get('page') ?? 1))
    const status = search.get('status') ?? undefined

    const where = {
      tenant_slug: params.slug,
      ...(status ? { status: status as any } : {}),
    }

    const [total, items] = await Promise.all([
      db.campaign.count({ where }),
      db.campaign.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * DEFAULT_PAGE_SIZE,
        take: DEFAULT_PAGE_SIZE,
        include: {
          template: { select: { nama: true, template_name: true } },
          segment:  { select: { id: true, nama: true } },
          creator:  { select: { name: true } },
        },
      }),
    ])

    return NextResponse.json({
      success: true,
      data: items,
      meta: { page, perPage: DEFAULT_PAGE_SIZE, total, totalPages: Math.ceil(total / DEFAULT_PAGE_SIZE) },
    })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const { session, error } = await requireTenantPermission(req, params.slug, 'manageBroadcast')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = CreateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.message }, { status: 400 })

    const db = await getTenantDb(params.slug)

    // Validasi template & segmen milik tenant ini
    const [tmpl, seg] = await Promise.all([
      db.broadcastTemplate.findFirst({ where: { id: parsed.data.template_id, tenant_slug: params.slug, aktif: true } }),
      db.segment.findFirst({ where: { id: parsed.data.segment_id, tenant_slug: params.slug } }),
    ])
    if (!tmpl) return NextResponse.json({ success: false, error: 'Template tidak ditemukan atau tidak aktif' }, { status: 404 })
    if (!seg)  return NextResponse.json({ success: false, error: 'Segmen tidak ditemukan' }, { status: 404 })

    const totalPenerima = await db.segmentPerson.count({ where: { segment_id: parsed.data.segment_id } })

    const campaign = await db.campaign.create({
      data: {
        tenant_slug:     params.slug,
        nama:            parsed.data.nama,
        channel:         parsed.data.channel as any,
        template_id:     parsed.data.template_id,
        template_params: parsed.data.template_params as any,
        segment_id:      parsed.data.segment_id,
        jadwal_kirim:    parsed.data.jadwal_kirim ? new Date(parsed.data.jadwal_kirim) : null,
        kirim_dua_nomor: parsed.data.kirim_dua_nomor,
        total_penerima:  totalPenerima,
        status:          parsed.data.jadwal_kirim ? 'SCHEDULED' : 'DRAFT',
        created_by:      session!.userId,
      },
    })

    return NextResponse.json({ success: true, data: campaign }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
