import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { z } from 'zod'

type Ctx = { params: { slug: string; ruleId: string } }

const PatchSchema = z.object({ aktif: z.boolean() })

// PATCH — toggle aktif/nonaktif
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Input tidak valid' }, { status: 400 })
    }

    const db   = await getTenantDb(params.slug)
    const rule = await db.aiPartnerRule.findUnique({ where: { id: params.ruleId } })
    if (!rule || rule.tenant_slug !== params.slug) {
      return NextResponse.json({ error: 'Rule tidak ditemukan' }, { status: 404 })
    }

    await db.aiPartnerRule.update({ where: { id: params.ruleId }, data: { aktif: parsed.data.aktif } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE — hapus rule
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  const db   = await getTenantDb(params.slug)
  const rule = await db.aiPartnerRule.findUnique({ where: { id: params.ruleId } })
  if (!rule || rule.tenant_slug !== params.slug) {
    return NextResponse.json({ error: 'Rule tidak ditemukan' }, { status: 404 })
  }

  await db.aiPartnerRule.delete({ where: { id: params.ruleId } })
  return NextResponse.json({ success: true })
}
