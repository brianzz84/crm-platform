import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { z } from 'zod'

type Ctx = { params: { slug: string; tagId: string } }

// GET: ambil rule tag ini (jika ada)
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageTagRules')
  if (error) return error

  try {
    const db   = await getTenantDb(params.slug)
    const rule = await db.tagRule.findFirst({
      where: { tag_id: params.tagId, tenant_slug: params.slug },
    })
    return NextResponse.json({ success: true, data: rule ?? null })
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

const RuleSchema = z.object({
  aktif:           z.boolean().default(true),
  icd_codes:       z.array(z.string()).default([]),
  icd_exclude:     z.array(z.string()).default([]),
  keyword_include: z.array(z.string()).default([]),
  keyword_exclude: z.array(z.string()).default([]),
  instruksi_ai:    z.string().min(1, 'Instruksi AI wajib diisi'),
  contoh_positif:  z.array(z.string()).default([]),
  contoh_negatif:  z.array(z.string()).default([]),
  confidence_min:  z.number().min(0.5).max(1.0).default(0.8),
})

// PUT: upsert rule (1 rule per tag)
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { error, session } = await requireTenantPermission(req, params.slug, 'manageTagRules')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = RuleSchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.message || 'Data tidak valid'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const db = await getTenantDb(params.slug)

    // Verifikasi tag milik tenant
    const tag = await db.tag.findFirst({ where: { id: params.tagId, tenant_slug: params.slug } })
    if (!tag) return NextResponse.json({ error: 'Tag tidak ditemukan' }, { status: 404 })

    const data = {
      ...parsed.data,
      tenant_slug: params.slug,
      tag_id:      params.tagId,
      created_by:  session!.userId,
    }

    const existing = await db.tagRule.findFirst({ where: { tag_id: params.tagId, tenant_slug: params.slug } })

    const rule = existing
      ? await db.tagRule.update({ where: { id: existing.id }, data })
      : await db.tagRule.create({ data })

    return NextResponse.json({ success: true, data: rule })
  } catch (e) {
    console.error('[PUT /api/[slug]/tags/[tagId]/rule]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE: hapus rule (nonaktifkan)
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageTagRules')
  if (error) return error

  try {
    const db = await getTenantDb(params.slug)
    await db.tagRule.updateMany({
      where: { tag_id: params.tagId, tenant_slug: params.slug },
      data:  { aktif: false },
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
