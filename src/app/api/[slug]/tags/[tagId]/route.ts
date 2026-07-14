import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { z } from 'zod'

type Ctx = { params: { slug: string; tagId: string } }

// GET: detail tag + similar check
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageTagRules')
  if (error) return error

  // ?similar=kata → fuzzy similar check (untuk warning saat buat/edit)
  const similar = req.nextUrl.searchParams.get('similar')
  if (similar && similar.length >= 2) {
    try {
      const db    = await getTenantDb(params.slug)
      const words = similar.toLowerCase().split(/\s+/).filter(w => w.length >= 2)
      const found = new Map<string, any>()

      for (const w of words.slice(0, 3)) {
        const rows = await db.tag.findMany({
          where: {
            tenant_slug: params.slug,
            aktif:       true,
            NOT:         { id: params.tagId === 'new' ? undefined : params.tagId },
            OR: [
              { name: { contains: w, mode: 'insensitive' } },
              { aliases: { some: { alias: { contains: w, mode: 'insensitive' } } } },
            ],
          },
          take:    5,
          include: { _count: { select: { person_tags: { where: { aktif: true } } } } },
        })
        for (const r of rows) {
          if (!found.has(r.id)) found.set(r.id, { id: r.id, name: r.name, warna: r.warna, total: r._count.person_tags })
        }
      }

      return NextResponse.json({ success: true, data: Array.from(found.values()).slice(0, 6) })
    } catch {
      return NextResponse.json({ success: true, data: [] })
    }
  }

  // Detail biasa
  try {
    const db  = await getTenantDb(params.slug)
    const tag = await db.tag.findFirst({
      where:   { id: params.tagId, tenant_slug: params.slug },
      include: {
        tag_rules:  true,
        aliases:    { orderBy: { alias: 'asc' } },
        _count: { select: { person_tags: { where: { aktif: true } } } },
      },
    })
    if (!tag) return NextResponse.json({ error: 'Tag tidak ditemukan' }, { status: 404 })
    return NextResponse.json({ success: true, data: tag })
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

const PatchSchema = z.object({
  name:       z.string().min(1).max(60).optional(),
  kategori:   z.string().max(50).nullable().optional(),
  warna:      z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  keterangan: z.string().max(200).nullable().optional(),
  aktif:      z.boolean().optional(),
})

// PATCH: edit nama/warna/keterangan atau toggle aktif
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageTagRules')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Data tidak valid' }, { status: 400 })

    const db  = await getTenantDb(params.slug)
    const tag = await db.tag.findFirst({ where: { id: params.tagId, tenant_slug: params.slug } })
    if (!tag) return NextResponse.json({ error: 'Tag tidak ditemukan' }, { status: 404 })

    // Cek nama duplikat jika nama berubah
    if (parsed.data.name && parsed.data.name.toLowerCase() !== tag.name.toLowerCase()) {
      const dup = await db.tag.findFirst({
        where: { tenant_slug: params.slug, name: { equals: parsed.data.name, mode: 'insensitive' }, NOT: { id: params.tagId } },
      })
      if (dup) return NextResponse.json({ error: 'Nama tag sudah digunakan' }, { status: 409 })
    }

    const updated = await db.tag.update({
      where: { id: params.tagId },
      data:  parsed.data,
    })
    return NextResponse.json({ success: true, data: updated })
  } catch (e) {
    console.error('[PATCH /api/[slug]/tags/[tagId]]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
