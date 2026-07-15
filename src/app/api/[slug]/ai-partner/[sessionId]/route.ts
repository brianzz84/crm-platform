import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'

type Ctx = { params: { slug: string; sessionId: string } }

// GET — detail sesi + histori pesan lengkap
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error, session } = await requireTenantPermission(req, params.slug, 'manageSegments')
  if (error) return error

  const db        = await getTenantDb(params.slug)
  const aiSession = await db.aiPartnerSession.findUnique({
    where:   { id: params.sessionId },
    include: { messages: { orderBy: { created_at: 'asc' } } },
  })

  if (!aiSession || aiSession.tenant_slug !== params.slug) {
    return NextResponse.json({ error: 'Sesi tidak ditemukan' }, { status: 404 })
  }
  if (aiSession.created_by !== session!.userId && !session!.roles.includes('SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ success: true, data: aiSession })
}

// DELETE — hapus sesi + histori pesannya
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { error, session } = await requireTenantPermission(req, params.slug, 'manageSegments')
  if (error) return error

  const db        = await getTenantDb(params.slug)
  const aiSession = await db.aiPartnerSession.findUnique({ where: { id: params.sessionId } })

  if (!aiSession || aiSession.tenant_slug !== params.slug) {
    return NextResponse.json({ error: 'Sesi tidak ditemukan' }, { status: 404 })
  }
  if (aiSession.created_by !== session!.userId && !session!.roles.includes('SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db.aiPartnerMessage.deleteMany({ where: { session_id: params.sessionId } })
  await db.aiPartnerSession.delete({ where: { id: params.sessionId } })

  return NextResponse.json({ success: true })
}
