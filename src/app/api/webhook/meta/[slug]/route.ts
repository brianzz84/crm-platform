import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { handleIncomingMessage } from '@/lib/inbox-handler'

type Ctx = { params: { slug: string } }

/**
 * GET — verifikasi webhook dari Meta Developers
 * Meta mengirim: hub.mode, hub.verify_token, hub.challenge
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const search      = req.nextUrl.searchParams
  const mode        = search.get('hub.mode')
  const token       = search.get('hub.verify_token')
  const challenge   = search.get('hub.challenge')
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN

  if (mode === 'subscribe' && token === verifyToken) {
    console.log(`[webhook/meta/${params.slug}] Webhook verified`)
    return new Response(challenge ?? '', { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

/**
 * POST — terima event dari Meta (pesan masuk, status update)
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const body: MetaWebhookPayload = await req.json()

    // Hanya proses WhatsApp
    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ success: true })
    }

    const db = await getTenantDb(params.slug)

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue

        const value = change.value
        if (!value) continue

        // Proses pesan masuk
        for (const msg of value.messages ?? []) {
          if (msg.type !== 'text') continue // skip non-text untuk sekarang

          const senderNumber = normalizePhone(msg.from)
          const content      = msg.text?.body ?? ''
          if (!senderNumber || !content) continue

          console.log(`[webhook/meta/${params.slug}] incoming from ${senderNumber}`)

          await handleIncomingMessage(db, params.slug, {
            senderNumber,
            content,
            externalId: msg.id,
            timestamp:  msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : undefined,
          })
        }

        // Proses status update (terkirim, dibaca)
        for (const status of value.statuses ?? []) {
          await handleStatusUpdate(db, status)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(`[webhook/meta/${params.slug}]`, e)
    // Selalu 200 agar Meta tidak retry terus-menerus
    return NextResponse.json({ success: false })
  }
}

// ─── Status update ────────────────────────────────────────────────────────────

async function handleStatusUpdate(db: any, status: MetaStatus) {
  const metaStatus = status.status // sent | delivered | read | failed

  const recipient = await db.campaignRecipient.findFirst({
    where:   { wappin_message_id: status.id },
    orderBy: { sent_at: 'desc' },
  })
  if (!recipient) return

  const map: Record<string, string> = {
    sent:      'SENT',
    delivered: 'DELIVERED',
    read:      'READ',
    failed:    'FAILED',
  }
  const mapped = map[metaStatus]
  if (!mapped) return

  const data: any = { status: mapped }
  if (mapped === 'DELIVERED') data.delivered_at = new Date()
  if (mapped === 'READ')      data.read_at       = new Date()

  await db.campaignRecipient.update({ where: { id: recipient.id }, data })

  if (mapped === 'DELIVERED') {
    await db.campaign.update({ where: { id: recipient.campaign_id }, data: { total_diterima: { increment: 1 } } })
  } else if (mapped === 'READ') {
    await db.campaign.update({ where: { id: recipient.campaign_id }, data: { total_dibaca: { increment: 1 } } })
  } else if (mapped === 'FAILED') {
    await db.campaign.update({ where: { id: recipient.campaign_id }, data: { total_gagal: { increment: 1 } } })
  }
}

// ─── Normalisasi nomor ────────────────────────────────────────────────────────

function normalizePhone(phone: string): string {
  // Meta mengirim format internasional tanpa '+': 628xxxxxxxxx
  // Kita simpan format lokal: 08xxxxxxxxx
  if (phone.startsWith('62')) return '0' + phone.slice(2)
  return phone
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetaWebhookPayload {
  object: string
  entry:  MetaEntry[]
}

interface MetaEntry {
  id:      string
  changes: MetaChange[]
}

interface MetaChange {
  field: string
  value: MetaChangeValue
}

interface MetaChangeValue {
  messages?: MetaMessage[]
  statuses?: MetaStatus[]
}

interface MetaMessage {
  id:        string
  from:      string
  type:      string
  timestamp: string
  text?:     { body: string }
}

interface MetaStatus {
  id:         string
  status:     string
  timestamp:  string
  recipient_id: string
}
