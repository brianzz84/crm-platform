import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { handleIncomingMessage } from '@/lib/inbox-handler'

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
      await processIncomingMessage(db, params.slug, body)
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

async function processIncomingMessage(db: any, slug: string, body: WappinCallback) {
  const senderNumber = body.sender_number
  if (!senderNumber) return

  await handleIncomingMessage(db, slug, {
    senderNumber,
    content:    body.message_content || '',
    externalId: body.message_id || undefined,
    timestamp:  body.timestamp ? new Date(body.timestamp) : undefined,
  })
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
