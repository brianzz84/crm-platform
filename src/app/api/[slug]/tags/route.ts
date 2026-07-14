import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { z } from 'zod'

type Ctx = { params: { slug: string } }

// GET: daftar semua tag + stats + alias
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageTagRules')
  if (error) return error

  try {
    const db   = await getTenantDb(params.slug)
    const tags = await db.tag.findMany({
      where:   { tenant_slug: params.slug },
      orderBy: [{ aktif: 'desc' }, { kategori: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            person_tags: { where: { aktif: true } },
            tag_rules:   { where: { aktif: true } },
          },
        },
        tag_rules: {
          where:  { aktif: true },
          select: { id: true },
          take:   1,
        },
        aliases: {
          orderBy: { alias: 'asc' },
          select:  { id: true, alias: true },
        },
      },
    })

    // Hitung breakdown manual vs AI per tag dalam satu query
    const tagIds = tags.map(t => t.id)
    const breakdown = tagIds.length
      ? await db.personTag.groupBy({
          by:     ['tag_id', 'sumber'],
          where:  { tag_id: { in: tagIds }, aktif: true },
          _count: { _all: true },
        })
      : []

    const breakdownMap: Record<string, Record<string, number>> = {}
    for (const b of breakdown) {
      if (!breakdownMap[b.tag_id]) breakdownMap[b.tag_id] = {}
      breakdownMap[b.tag_id][b.sumber] = b._count._all
    }

    const result = tags.map(t => ({
      id:          t.id,
      name:        t.name,
      kategori:    t.kategori,
      warna:       t.warna,
      keterangan:  t.keterangan,
      aktif:       t.aktif,
      created_at:  t.created_at,
      total_pasien: t._count.person_tags,
      has_rule:    t._count.tag_rules > 0,
      breakdown:   breakdownMap[t.id] ?? {},
      aliases:     t.aliases,
    }))

    return NextResponse.json({ success: true, data: result })
  } catch (e) {
    console.error('[GET /api/[slug]/tags]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

const CreateSchema = z.object({
  name:       z.string().min(1, 'Nama tag wajib diisi').max(60),
  kategori:   z.string().max(50).nullable().optional(),
  warna:      z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#0089A8'),
  keterangan: z.string().max(200).nullable().optional(),
})

// POST: buat tag baru
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error, session } = await requireTenantPermission(req, params.slug, 'manageTagRules')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = CreateSchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.message || 'Data tidak valid'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const { name, kategori, warna, keterangan } = parsed.data
    const db = await getTenantDb(params.slug)

    // Cek duplikat exact (case-insensitive)
    const existing = await db.tag.findFirst({
      where: { tenant_slug: params.slug, name: { equals: name, mode: 'insensitive' } },
    })
    if (existing) {
      return NextResponse.json({ error: 'Tag dengan nama ini sudah ada' }, { status: 409 })
    }

    const tag = await db.tag.create({
      data: { tenant_slug: params.slug, name, kategori: kategori || null, warna, keterangan, aktif: true },
    })

    return NextResponse.json({ success: true, data: { ...tag, aliases: [] } }, { status: 201 })
  } catch (e) {
    console.error('[POST /api/[slug]/tags]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
