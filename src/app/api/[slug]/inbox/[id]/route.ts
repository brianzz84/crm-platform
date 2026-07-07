import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { requireTenantPermission } from "@/lib/auth"

type Ctx = { params: { slug: string; id: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'replyChat')
  if (error) return error

  try {
    const db   = await getTenantDb(params.slug)
    const conv = await db.conversation.findFirst({
      where: { id: params.id, tenant_slug: params.slug },
      include: {
        person: {
          select: {
            id: true, name: true, no_hp: true, no_rm: true, email: true, tanggal_lahir: true,
            tags: { where: { aktif: true }, include: { tag: { select: { name: true, warna: true } } }, take: 10 },
            visits: { where: { aktif: true }, orderBy: { tanggal: 'desc' }, take: 10, select: { tanggal: true, poli: true, unit: true, dokter: true, diagnosa_nama: true, diagnosa_icd: true } },
          },
        },
        assigned_user: { select: { id: true, name: true } },
      },
    })
    if (!conv) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

    if (conv.unread_count > 0) {
      await db.conversation.update({ where: { id: params.id }, data: { unread_count: 0 } })
    }

    return NextResponse.json({ success: true, data: conv })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'replyChat')
  if (error) return error

  try {
    const body = await req.json()
    const db   = await getTenantDb(params.slug)
    const updated = await db.conversation.update({
      where: { id: params.id },
      data: {
        ...(body.status      !== undefined ? { status: body.status }           : {}),
        ...(body.assigned_to !== undefined ? { assigned_to: body.assigned_to } : {}),
      },
    })
    return NextResponse.json({ success: true, data: updated })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
