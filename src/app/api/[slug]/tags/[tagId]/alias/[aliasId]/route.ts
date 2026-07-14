import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'

type Ctx = { params: { slug: string; tagId: string; aliasId: string } }

// DELETE /api/[slug]/tags/[tagId]/alias/[aliasId]
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageTagRules')
  if (error) return error

  try {
    const db    = await getTenantDb(params.slug)
    const alias = await db.tagAlias.findFirst({
      where: { id: params.aliasId, tag_id: params.tagId, tag: { tenant_slug: params.slug } },
    })
    if (!alias) return NextResponse.json({ error: 'Alias tidak ditemukan' }, { status: 404 })

    await db.tagAlias.delete({ where: { id: params.aliasId } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[DELETE /api/[slug]/tags/[tagId]/alias/[aliasId]]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
