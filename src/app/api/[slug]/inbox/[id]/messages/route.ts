import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { requireTenantPermission } from "@/lib/auth"
import { z } from 'zod'
import { getWappinToken, sendWaMessage, sendWaMedia } from '@/lib/wappin-client'
import { sendMetaTextMessage, sendMetaMediaMessage } from '@/lib/meta-client'

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
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
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

    // ── Simpan pesan ke DB dulu ──────────────────────────────────
    const msg = await db.message.create({
      data: {
        conversation_id:  params.id,
        direction:        'outgoing',
        content:          content || (media_filename ?? ''),
        media_url,
        media_type,
        is_internal_note,
        status:           is_internal_note ? 'SENT' : 'PENDING',
        sent_by:          session!.userId,
        sent_at:          new Date(),
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

    // ── Kirim ke channel (best-effort, tidak gagalkan response) ──
    if (!is_internal_note) {
      const noHp = conv.person?.no_hp ?? null
      if (noHp) {
        sendToChannel(db, params.slug, noHp, msg.id, content, media_url, media_type, media_filename).catch(async e => {
          console.error(`[inbox/messages] send failed conv=${params.id}:`, e)
          await db.message.update({ where: { id: msg.id }, data: { status: 'FAILED' } }).catch(() => null)
        })
      } else {
        // Tak ada nomor tujuan → tandai gagal, jangan biarkan PENDING selamanya
        await db.message.update({ where: { id: msg.id }, data: { status: 'FAILED' } })
        msg.status = 'FAILED'
      }
    }

    return NextResponse.json({ success: true, data: msg }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}

// Kirim via Meta jika ada MetaConfig aktif, fallback ke Wappin
async function sendToChannel(
  db:           any,
  slug:         string,
  noHp:         string,
  msgId:        string,
  content:      string,
  media_url?:   string,
  media_type?:  string,
  media_filename?: string,
) {
  // Coba Meta dulu
  const metaCfg = await db.metaConfig.findUnique({ where: { tenant_slug: slug } })
  if (metaCfg?.aktif) {
    const extMsgId = media_url && media_type
      ? await sendMetaMediaMessage(metaCfg, noHp, media_type as any, media_url, content || undefined, media_filename)
      : await sendMetaTextMessage(metaCfg, noHp, content)

    await db.message.update({
      where: { id: msgId },
      data: extMsgId
        ? { status: 'SENT', sent_at: new Date(), wappin_message_id: extMsgId }
        : { status: 'FAILED' },
    })
    return
  }

  // Fallback: Wappin
  const wCfg = await db.wappinConfig.findUnique({ where: { tenant_slug: slug } })
  if (!wCfg?.aktif) return

  const token = await getWappinToken(wCfg)
  if (!token) return

  const result = media_url && media_type
    ? await sendWaMedia(wCfg, token, noHp, media_type as any, media_url, content || undefined, media_filename)
    : await sendWaMessage(wCfg, token, noHp, content)

  await db.message.update({
    where: { id: msgId },
    data: result?.message_id
      ? { status: 'SENT', sent_at: new Date(), wappin_message_id: result.message_id }
      : { status: 'FAILED' },
  })
}
