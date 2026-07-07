import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { requireTenantPermission } from "@/lib/auth"
import { canDo } from '@/constants'

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const { session, error } = await requireTenantPermission(req, params.slug, 'replyChat')
  if (error) return error

  try {
    const db     = await getTenantDb(params.slug)
    const search = req.nextUrl.searchParams
    const status = search.get('status') ?? undefined
    const channel= search.get('channel') ?? undefined
    const q      = search.get('q') ?? ''

    const canViewAll = canDo(session!.roles, 'viewAllInbox')

    const where: any = { tenant_slug: params.slug }
    if (status)  where.status  = status
    if (channel) where.channel = channel

    // AGEN hanya lihat conversation yang di-assign ke mereka
    if (!canViewAll) {
      where.assigned_to = session!.userId
    }

    if (q) {
      where.person = {
        OR: [
          { name:  { contains: q, mode: 'insensitive' } },
          { no_hp: { contains: q } },
        ],
      }
    }

    const convs = await db.conversation.findMany({
      where,
      orderBy: { last_message_at: 'desc' },
      take: 50,
      select: {
        id: true, channel: true, channel_user_id: true,
        status: true, unread_count: true, last_message_at: true,
        assigned_to: true,
        person: { select: { id: true, name: true, no_hp: true } },
        messages: {
          orderBy: { created_at: 'desc' },
          take: 1,
          select: { content: true, direction: true, created_at: true, is_internal_note: true },
        },
      },
    })

    return NextResponse.json({ success: true, data: convs })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
