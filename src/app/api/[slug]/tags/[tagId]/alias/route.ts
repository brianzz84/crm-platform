import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { z } from 'zod'

type Ctx = { params: { slug: string; tagId: string } }

const Schema = z.object({ alias: z.string().min(1).max(60) })

// POST /api/[slug]/tags/[tagId]/alias — tambah alias/sinonim baru
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageTagRules')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Alias tidak valid' }, { status: 400 })

    const db  = await getTenantDb(params.slug)
    const tag = await db.tag.findFirst({ where: { id: params.tagId, tenant_slug: params.slug } })
    if (!tag) return NextResponse.json({ error: 'Tag tidak ditemukan' }, { status: 404 })

    const aliasText = parsed.data.alias.trim()

    // Jangan izinkan alias yang sama dengan nama tag itu sendiri
    if (aliasText.toLowerCase() === tag.name.toLowerCase()) {
      return NextResponse.json({ error: 'Alias tidak boleh sama dengan nama tag' }, { status: 400 })
    }

    const existing = await db.tagAlias.findFirst({
      where: { tag_id: params.tagId, alias: { equals: aliasText, mode: 'insensitive' } },
    })
    if (existing) return NextResponse.json({ error: 'Alias ini sudah ada' }, { status: 409 })

    const created = await db.tagAlias.create({
      data: { tag_id: params.tagId, alias: aliasText },
    })
    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (e) {
    console.error('[POST /api/[slug]/tags/[tagId]/alias]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
