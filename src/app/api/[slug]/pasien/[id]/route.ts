import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const db = await getTenantDb(params.slug)

    const person = await db.person.findFirst({
      where: { id: params.id, tenant_slug: params.slug, aktif: true },
      include: {
        tags: {
          where: { aktif: true },
          include: { tag: true },
          orderBy: { assigned_at: 'desc' },
        },
        visits: {
          where: { aktif: true },
          orderBy: { tanggal: 'desc' },
          take: 20,
        },
        conversations: {
          orderBy: { last_message_at: 'desc' },
          take: 5,
          select: {
            id: true, channel: true, status: true,
            last_message_at: true, unread_count: true,
          },
        },
        campaign_recipients: {
          orderBy: { sent_at: 'desc' },
          take: 10,
          include: {
            campaign: { select: { id: true, nama: true, status: true } },
          },
        },
      },
    })

    if (!person) {
      return NextResponse.json({ error: 'Pasien tidak ditemukan' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: person })
  } catch (err) {
    console.error('[GET /api/[slug]/pasien/[id]]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const db   = await getTenantDb(params.slug)
    const body = await req.json()

    // Hanya field yang boleh diedit manual oleh admin
    const allowed = ['name', 'email', 'tanggal_lahir', 'no_hp']
    const data: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) data[key] = body[key]
    }

    const person = await db.person.update({
      where: { id: params.id },
      data: { ...data, updated_at: new Date() },
    })

    return NextResponse.json({ success: true, data: person })
  } catch (err) {
    console.error('[PATCH /api/[slug]/pasien/[id]]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
