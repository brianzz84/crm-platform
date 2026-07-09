import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { requireTenantPermission } from '@/lib/auth'
import { canDo } from '@/constants'

type Ctx = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { session, error } = await requireTenantPermission(req, params.slug, 'replyChat')
  if (error) return error

  try {
    const db = await getTenantDb(params.slug)
    const canViewAll = canDo(session!.roles, 'viewAllInbox')

    const where: any = {
      tenant_slug: params.slug,
      unread_count: { gt: 0 },
    }
    if (!canViewAll) where.assigned_to = session!.userId

    const rows = await db.conversation.groupBy({
      by: ['status'],
      where,
      _count: { id: true },
    })

    const summary: Record<string, number> = { OPEN: 0, PENDING: 0, RESOLVED: 0 }
    rows.forEach(r => { summary[r.status] = r._count.id })

    return NextResponse.json({ success: true, data: summary })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
