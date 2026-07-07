import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { requireTenantPermission } from "@/lib/auth"

export async function GET(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageBroadcast')
  if (error) return error

  try {
    const db  = await getTenantDb(params.slug)
    const row = await db.campaign.findFirst({
      where: { id: params.id, tenant_slug: params.slug },
      include: {
        template: { select: { nama: true, template_name: true, preview_text: true, components_schema: true } },
        segment:  { select: { id: true, nama: true } },
        creator:  { select: { name: true } },
        recipients: {
          take: 50,
          orderBy: { sent_at: 'desc' },
          select: {
            id: true, no_hp: true, nama: true, status: true,
            sent_at: true, delivered_at: true, read_at: true,
            error_code: true, error_detail: true,
          },
        },
      },
    })
    if (!row) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageBroadcast')
  if (error) return error

  try {
    const body = await req.json()
    const db   = await getTenantDb(params.slug)

    const campaign = await db.campaign.findFirst({ where: { id: params.id, tenant_slug: params.slug } })
    if (!campaign) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    if (['RUNNING', 'DONE'].includes(campaign.status)) {
      return NextResponse.json({ success: false, error: 'Campaign tidak dapat diubah' }, { status: 409 })
    }

    const updated = await db.campaign.update({
      where: { id: params.id },
      data: {
        ...(body.nama         !== undefined ? { nama: body.nama }                                     : {}),
        ...(body.pesan        !== undefined ? { pesan: body.pesan }                                   : {}),
        ...(body.status       !== undefined ? { status: body.status }                                 : {}),
        ...(body.jadwal_kirim !== undefined ? { jadwal_kirim: body.jadwal_kirim ? new Date(body.jadwal_kirim) : null } : {}),
        ...(body.template_id  !== undefined ? { template_id: body.template_id }                       : {}),
      },
    })
    return NextResponse.json({ success: true, data: updated })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageBroadcast')
  if (error) return error

  try {
    const db = await getTenantDb(params.slug)
    const campaign = await db.campaign.findFirst({ where: { id: params.id, tenant_slug: params.slug } })
    if (!campaign) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    if (['RUNNING', 'DONE'].includes(campaign.status)) {
      return NextResponse.json({ success: false, error: 'Campaign aktif tidak dapat dihapus' }, { status: 409 })
    }
    await db.campaign.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
