import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { sendPushToTenant } from '@/lib/push'

type Ctx = { params: { slug: string; secret: string } }

/**
 * Webhook endpoint Wappin → CRM Platform
 * URL format: /api/webhook/wappin/{tenant_slug}/{webhook_secret}
 *
 * Wappin mengirim 2 jenis callback (callback_type):
 *   - "delivery_report" / "message_status" → update status CampaignRecipient
 *   - "incoming_message" → buat/update Conversation + Message di Inbox
 *
 * Security: webhook_secret di-generate per-tenant saat setup, disimpan di WappinConfig.
 * Tidak ada HMAC dari Wappin → kita pakai URL secret sebagai pengganti.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const db  = await getTenantDb(params.slug)
    const cfg = await db.wappinConfig.findUnique({ where: { tenant_slug: params.slug } })

    // Validasi secret URL
    if (!cfg || cfg.webhook_secret !== params.secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: WappinCallback = await req.json()
    console.log(`[webhook/wappin/${params.slug}] callback_type=${body.callback_type} message_id=${body.message_id}`)

    const callbackType = (body.callback_type || '').toLowerCase()

    if (callbackType === 'incoming_message' || callbackType === 'inbound') {
      await handleIncomingMessage(db, params.slug, body)
    } else {
      // delivery report / message status update
      await handleDeliveryReport(db, params.slug, body)
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(`[webhook/wappin/${params.slug}]`, e)
    // Selalu 200 agar Wappin tidak retry terus-menerus
    return NextResponse.json({ success: false, error: String(e) })
  }
}

// Wappin kadang kirim GET untuk verifikasi URL
export async function GET(req: NextRequest, { params }: Ctx) {
  const challenge = req.nextUrl.searchParams.get('hub.challenge')
  if (challenge) return new Response(challenge, { status: 200 })
  return NextResponse.json({ ok: true })
}

// ─────────────────────────────────────────────
// Handler: Delivery Report
// ─────────────────────────────────────────────

async function handleDeliveryReport(db: any, slug: string, body: WappinCallback) {
  if (!body.message_id) return

  const recipient = await db.campaignRecipient.findUnique({
    where: { wappin_message_id: body.message_id },
  })
  if (!recipient) return

  const status = mapWappinStatus(body.status_messages)
  const now    = new Date()

  const data: any = { status }
  if (status === 'DELIVERED' && !recipient.delivered_at) data.delivered_at = now
  if (status === 'READ'      && !recipient.read_at)      data.read_at      = now

  await db.campaignRecipient.update({ where: { id: recipient.id }, data })

  // Update counter campaign
  const campaign = await db.campaign.findUnique({ where: { id: recipient.campaign_id } })
  if (!campaign) return

  if (status === 'DELIVERED') {
    await db.campaign.update({
      where: { id: recipient.campaign_id },
      data:  { total_diterima: { increment: 1 } },
    })
  } else if (status === 'READ') {
    await db.campaign.update({
      where: { id: recipient.campaign_id },
      data:  { total_dibaca: { increment: 1 } },
    })
  } else if (status === 'FAILED') {
    await db.campaign.update({
      where: { id: recipient.campaign_id },
      data:  { total_gagal: { increment: 1 } },
    })
  }
}

// ─────────────────────────────────────────────
// Handler: Incoming Message (balasan dari pasien)
// ─────────────────────────────────────────────

async function handleIncomingMessage(db: any, slug: string, body: WappinCallback) {
  const senderNumber = body.sender_number
  if (!senderNumber) return

  // Cari pasien berdasarkan nomor HP
  const person = await db.person.findFirst({
    where: { tenant_slug: slug, no_hp: senderNumber },
  })

  // Cari atau buat Conversation
  let conversation = await db.conversation.findUnique({
    where: {
      tenant_slug_channel_channel_user_id: {
        tenant_slug:     slug,
        channel:         'WA',
        channel_user_id: senderNumber,
      },
    },
  })

  if (!conversation) {
    conversation = await db.conversation.create({
      data: {
        tenant_slug:     slug,
        person_id:       person?.id ?? null,
        channel:         'WA',
        channel_user_id: senderNumber,
        status:          'OPEN',
        last_message_at: new Date(),
        unread_count:    1,
      },
    })
  } else {
    await db.conversation.update({
      where: { id: conversation.id },
      data:  {
        status:          'OPEN',
        last_message_at: new Date(),
        unread_count:    { increment: 1 },
        ...(person && !conversation.person_id ? { person_id: person.id } : {}),
      },
    })
  }

  // Simpan pesan masuk
  await db.message.create({
    data: {
      conversation_id:   conversation.id,
      direction:         'incoming',
      content:           body.message_content || '',
      status:            'DELIVERED',
      wappin_message_id: body.message_id || null,
      sent_at:           body.timestamp ? new Date(body.timestamp) : new Date(),
    },
  })

  // Kirim push notification ke semua agent/supervisor
  sendPushToTenant(slug, {
    title: `Pesan dari ${senderNumber}`,
    body:  body.message_content?.slice(0, 100) || 'Pesan baru masuk',
    url:   `/${slug}/inbox`,
    tag:   `inbox-${conversation.id}`,
  }).catch(() => null)

  // Jika ini balasan dari campaign — update replied_at
  if (body.message_id) {
    const recipient = await db.campaignRecipient.findFirst({
      where: { no_hp: senderNumber, status: { in: ['SENT', 'DELIVERED', 'READ'] } },
      orderBy: { sent_at: 'desc' },
    })
    if (recipient) {
      await db.campaignRecipient.update({
        where: { id: recipient.id },
        data:  { replied_at: new Date() },
      })
      await db.campaign.update({
        where: { id: recipient.campaign_id },
        data:  { total_dibalas: { increment: 1 } },
      })
    }
  }
}

function mapWappinStatus(statusMessages?: string): 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' {
  switch ((statusMessages || '').toLowerCase()) {
    case 'sent':       return 'SENT'
    case 'delivered':  return 'DELIVERED'
    case 'read':       return 'READ'
    case 'failed':
    case 'undelivered':
    case 'rejected':   return 'FAILED'
    default:           return 'SENT'
  }
}

interface WappinCallback {
  message_id?:      string
  client_id?:       string
  client_name?:     string
  project_id?:      string
  project_name?:    string
  status_messages?: string
  message_content?: string
  environment?:     string
  timestamp?:       string
  sender_number?:   string
  callback_type?:   string
}
