import { NextRequest, NextResponse } from 'next/server'
import { masterDb, getTenantDb } from '@/lib/tenant'
import { handleIncomingMessage } from '@/lib/inbox-handler'

/**
 * SaaS unified Meta webhook — satu URL untuk semua tenant.
 *
 * Meta mengirim semua event ke satu URL per App.
 * Routing dilakukan berdasarkan metadata.phone_number_id yang ada di setiap event.
 * Lookup: masterDb.tenantConfig.meta_phone_number_id → tenant_slug
 *
 * URL didaftarkan di Meta Developers sekali saja:
 *   https://<domain>/api/webhook/meta
 */

// ─── GET: Verifikasi webhook dari Meta ────────────────────────────────────────

export async function GET(req: NextRequest) {
  const search      = req.nextUrl.searchParams
  const mode        = search.get('hub.mode')
  const token       = search.get('hub.verify_token')
  const challenge   = search.get('hub.challenge')
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[webhook/meta] Webhook verified')
    return new Response(challenge ?? '', { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ─── POST: Terima event dari Meta ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body: MetaWebhookPayload = await req.json()

    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ success: true })
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue

        const value = change.value
        if (!value) continue

        const phoneNumberId = value.metadata?.phone_number_id
        if (!phoneNumberId) continue

        // Cari tenant berdasarkan phone_number_id di master DB
        const tenantCfg = await masterDb.tenantConfig.findFirst({
          where:   { meta_phone_number_id: phoneNumberId },
          include: { tenant: { select: { slug: true } } },
        })

        if (!tenantCfg) {
          console.warn(`[webhook/meta] Tidak ada tenant untuk phone_number_id=${phoneNumberId}`)
          continue
        }

        const slug = tenantCfg.tenant.slug
        const db   = await getTenantDb(slug)

        // Proses pesan masuk
        for (const msg of value.messages ?? []) {
          if (msg.type !== 'text') continue

          const senderNumber = normalizePhone(msg.from)
          const content      = msg.text?.body ?? ''
          if (!senderNumber || !content) continue

          console.log(`[webhook/meta/${slug}] incoming from ${senderNumber}`)

          await handleIncomingMessage(db, slug, {
            senderNumber,
            content,
            externalId: msg.id,
            timestamp:  msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : undefined,
          })
        }

        // Proses status update
        for (const status of value.statuses ?? []) {
          await handleStatusUpdate(db, status)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[webhook/meta]', e)
    return NextResponse.json({ success: false })
  }
}

// ─── Status update ────────────────────────────────────────────────────────────

async function handleStatusUpdate(db: any, status: MetaStatus) {
  const map: Record<string, string> = {
    sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED',
  }
  const mapped = map[status.status]
  if (!mapped) return

  const recipient = await db.campaignRecipient.findFirst({
    where:   { wappin_message_id: status.id },
    orderBy: { sent_at: 'desc' },
  })
  if (!recipient) return

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
  metadata?: { display_phone_number: string; phone_number_id: string }
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
  id:           string
  status:       string
  timestamp:    string
  recipient_id: string
}
