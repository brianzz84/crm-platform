import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { requireTenantPermission } from "@/lib/auth"
import { z } from 'zod'
import { getWappinToken, sendWaMessage, sendWaMedia } from '@/lib/wappin-client'

const SendSchema = z.object({
  content:          z.string().default(''),
  is_internal_note: z.boolean().default(false),
  media_url:        z.string().url().optional(),
  media_type:       z.enum(['image','document','video']).optional(),
  media_filename:   z.string().optional(),
})

type Ctx = { params: { slug: string; id: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'replyChat')
  if (error) return error

  try {
    const db     = await getTenantDb(params.slug)
    const before = req.nextUrl.searchParams.get('before')
    const limit  = Math.min(50, Number(req.nextUrl.searchParams.get('limit') ?? 50))

    const msgs = await db.message.findMany({
      where: {
        conversation_id: params.id,
        ...(before ? { created_at: { lt: new Date(before) } } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: limit,
      select: {
        id: true, direction: true, content: true,
        media_url: true, media_type: true,
        is_internal_note: true, status: true,
        ai_generated: true, created_at: true,
        sent_at: true, delivered_at: true, read_at: true,
        sender: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({ success: true, data: msgs.reverse() })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { session, error } = await requireTenantPermission(req, params.slug, 'replyChat')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = SendSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 })

    const db   = await getTenantDb(params.slug)
    const conv = await db.conversation.findFirst({
      where:   { id: params.id, tenant_slug: params.slug },
      include: { person: { select: { no_hp: true } } },
    })
    if (!conv) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

    const { content, is_internal_note, media_url, media_type, media_filename } = parsed.data

    if (!is_internal_note && !content && !media_url) {
      return NextResponse.json({ success: false, error: 'Pesan tidak boleh kosong' }, { status: 400 })
    }

    // ── Kirim ke Wappin jika bukan internal note ──────────────────
    let wappinMsgId: string | null = null

    if (!is_internal_note) {
      const wCfg = await db.wappinConfig.findUnique({ where: { tenant_slug: params.slug } })
      if (wCfg?.aktif) {
        const noHp = conv.person?.no_hp ?? null
        if (noHp) {
          const token = await getWappinToken(wCfg as any)
          if (token) {
            const result = media_url && media_type
              ? await sendWaMedia(wCfg as any, token, noHp, media_type, media_url, content || undefined, media_filename)
              : await sendWaMessage(wCfg as any, token, noHp, content)
            wappinMsgId = result.message_id
          }
        }
      }
    }

    const msg = await db.message.create({
      data: {
        conversation_id:  params.id,
        direction:        'outgoing',
        content:          content || (media_filename ?? ''),
        media_url,
        media_type,
        is_internal_note,
        status:           'SENT',
        sent_by:          session!.userId,
        sent_at:          new Date(),
        ...(wappinMsgId ? { wappin_message_id: wappinMsgId } : {}),
      },
      select: {
        id: true, direction: true, content: true,
        media_url: true, media_type: true, is_internal_note: true, status: true,
        ai_generated: true, created_at: true, sent_at: true,
        sender: { select: { id: true, name: true } },
      },
    })

    await db.conversation.update({
      where: { id: params.id },
      data: { last_message_at: new Date(), status: 'OPEN' },
    })

    return NextResponse.json({ success: true, data: msg }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
