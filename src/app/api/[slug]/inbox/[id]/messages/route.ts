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
        is_internal_note: true, status: true, error_detail: true,
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
      // `channel` menentukan jalur kirim — WhatsApp lewat nomor HP, Messenger
      // lewat PSID yang tersimpan di channel_user_id.
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
    if (!is_internal_note && conv.channel === 'FB') {
      // Messenger: tujuannya PSID, bukan nomor HP. Percakapan FB kerap belum
      // tertaut ke Person sama sekali — Instagram/Facebook hanya memberi ID acak,
      // jadi menuntut nomor HP di sini akan memblokir balasan tanpa alasan.
      const { kirimPesanMessenger } = await import('@/lib/meta-dm')
      const metaCfg = await db.metaConfig.findUnique({ where: { tenant_slug: params.slug } })
      const token   = metaCfg?.insights_token || metaCfg?.access_token

      if (metaCfg?.page_id && token) {
        kirimPesanMessenger(metaCfg.page_id, token, conv.channel_user_id, content)
          .then(async hasil => {
            await db.message.update({
              where: { id: msg.id },
              data: hasil.ok
                ? { status: 'SENT', sent_at: new Date(), external_id: hasil.messageId || null }
                : { status: 'FAILED', error_detail: hasil.galat?.slice(0, 300) ?? 'Gagal mengirim' },
            }).catch(() => null)
          })
      } else {
        await db.message.update({
          where: { id: msg.id },
          data:  { status: 'FAILED', error_detail: 'Facebook Page belum dikonfigurasi di Pengaturan → Integrasi Meta.' },
        })
        msg.status = 'FAILED'
      }
    } else if (!is_internal_note) {
      const noHp = conv.person?.no_hp ?? null
      if (noHp) {
        sendToChannel(db, params.slug, noHp, msg.id, content, media_url, media_type, media_filename).catch(async e => {
          console.error(`[inbox/messages] send failed conv=${params.id}:`, e)
          await db.message.update({
            where: { id: msg.id },
            data:  { status: 'FAILED', error_detail: friendlyMetaError(e) },
          }).catch(() => null)
        })
      } else {
        // Tak ada nomor tujuan → tandai gagal, jangan biarkan PENDING selamanya
        await db.message.update({
          where: { id: msg.id },
          data:  { status: 'FAILED', error_detail: 'Pasien belum punya nomor WhatsApp di data.' },
        })
        msg.status = 'FAILED'
      }
    }

    return NextResponse.json({ success: true, data: msg }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}

// Kirim via Meta jika ada MetaConfig aktif, fallback ke Wappin.
// Melempar Error saat gagal (dengan .metaCode bila dari Meta) agar pemanggil
// bisa menyimpan alasan yang jelas ke Message.error_detail.
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
    if (!extMsgId) throw new Error('Meta tidak mengembalikan ID pesan.')

    await db.message.update({
      where: { id: msgId },
      data:  { status: 'SENT', sent_at: new Date(), wappin_message_id: extMsgId },
    })
    return
  }

  // Fallback: Wappin
  const wCfg = await db.wappinConfig.findUnique({ where: { tenant_slug: slug } })
  if (!wCfg?.aktif) throw new Error('Tidak ada channel WhatsApp aktif (Meta/Wappin).')

  const token = await getWappinToken(wCfg)
  if (!token) throw new Error('Gagal memperoleh token Wappin.')

  const result = media_url && media_type
    ? await sendWaMedia(wCfg, token, noHp, media_type as any, media_url, content || undefined, media_filename)
    : await sendWaMessage(wCfg, token, noHp, content)
  if (!result?.message_id) throw new Error('Wappin gagal mengirim pesan.')

  await db.message.update({
    where: { id: msgId },
    data:  { status: 'SENT', sent_at: new Date(), wappin_message_id: result.message_id },
  })
}

// Terjemahkan error pengiriman → pesan singkat berbahasa Indonesia untuk staf.
function friendlyMetaError(e: any): string {
  const code: number | undefined = e?.metaCode
  const map: Record<number, string> = {
    131047: 'Di luar jendela 24 jam — pasien belum membalas dalam 24 jam terakhir. Untuk menjangkau di luar 24 jam, kirim lewat template broadcast yang disetujui Meta.',
    131051: 'Tipe pesan tidak didukung WhatsApp.',
    131053: 'Media gagal diakses/diunggah oleh Meta.',
    131026: 'Pesan tak terkirim — nomor tujuan tidak dapat menerima (mungkin bukan WhatsApp aktif).',
    130472: 'Nomor tujuan sedang dibatasi Meta untuk pesan pemasaran.',
    100:    'Parameter pengiriman tidak valid.',
  }
  if (code && map[code]) return map[code]
  const base = String(e?.message || 'Pengiriman gagal.').slice(0, 300)
  return code ? `${base} (kode ${code})` : base
}
