import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { handleIncomingMessage } from '@/lib/inbox-handler'
import { recomputeCampaignCounters } from '@/lib/campaign'
import { fetchMetaMediaInfo, downloadMetaMedia } from '@/lib/meta-client'
import { uploadPublic, isStorageConfigured } from '@/lib/storage'

const MEDIA_TYPES = ['image', 'document', 'video', 'audio', 'sticker']
function mimeExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'application/pdf': 'pdf', 'video/mp4': 'mp4', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
  }
  return map[mime] || (mime.split('/')[1] || 'bin')
}

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
        // Update status template (APPROVED / REJECTED / dll) dari Meta
        if (change.field === 'message_template_status_update') {
          await handleTemplateStatusUpdate(db, params.slug, change.value as any)
          continue
        }

        if (change.field !== 'messages') continue

        const value = change.value
        if (!value) continue

        // Proses pesan masuk (teks + media)
        for (const msg of value.messages ?? []) {
          const senderNumber = normalizePhone(msg.from)
          if (!senderNumber) continue

          let content = ''
          let mediaUrl: string | undefined
          let mediaType: string | undefined

          if (msg.type === 'text') {
            content = msg.text?.body ?? ''
          } else if (MEDIA_TYPES.includes(msg.type)) {
            const mediaObj = (msg as any)[msg.type]
            content = mediaObj?.caption ?? ''
            // Unduh media dari Meta lalu re-host ke storage publik agar bisa ditampilkan
            try {
              const metaCfg = await db.metaConfig.findUnique({ where: { tenant_slug: params.slug } })
              if (metaCfg?.access_token && mediaObj?.id && isStorageConfigured()) {
                const info = await fetchMetaMediaInfo(metaCfg, mediaObj.id)
                if (info) {
                  const bytes = await downloadMetaMedia(metaCfg, info.url)
                  mediaUrl  = await uploadPublic({ data: bytes, filename: `${msg.id}.${mimeExt(info.mime)}`, contentType: info.mime, tenant: params.slug })
                  mediaType = msg.type === 'sticker' ? 'image' : msg.type
                }
              }
            } catch (e) {
              console.error(`[webhook/meta/${params.slug}] media download failed:`, e)
            }
          } else {
            continue // location/contacts/dll — skip
          }

          if (!content && !mediaUrl) continue
          console.log(`[webhook/meta/${params.slug}] incoming ${msg.type} from ${senderNumber}`)

          await handleIncomingMessage(db, params.slug, {
            senderNumber,
            content,
            externalId: msg.id,
            timestamp:  msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : undefined,
            mediaUrl,
            mediaType,
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
  const map: Record<string, string> = { sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' }
  const mapped = map[status.status]
  if (!mapped) return

  const failMeta = () => {
    const err = status.errors?.[0]
    if (!err) return { error_code: 'meta_delivery' as string, error_detail: undefined as string | undefined }
    return {
      error_code:   String(err.code ?? 'meta_delivery'),
      error_detail: [err.title, err.error_data?.details || err.message].filter(Boolean).join(' — ').slice(0, 300),
    }
  }

  // 1) Pesan broadcast (campaign)
  const recipient = await db.campaignRecipient.findFirst({
    where:   { wappin_message_id: status.id },
    orderBy: { sent_at: 'desc' },
  })
  if (recipient) {
    const data: any = { status: mapped }
    if (mapped === 'DELIVERED') data.delivered_at = new Date()
    if (mapped === 'READ')      data.read_at       = new Date()
    if (mapped === 'FAILED')    Object.assign(data, failMeta())
    await db.campaignRecipient.update({ where: { id: recipient.id }, data })
    await recomputeCampaignCounters(db, recipient.campaign_id)
  }

  // 2) Pesan chat inbox (centang delivered/read)
  const message = await db.message.findFirst({ where: { wappin_message_id: status.id } })
  if (message) {
    const mdata: any = { status: mapped }
    if (mapped === 'SENT'      && !message.sent_at)      mdata.sent_at      = new Date()
    if (mapped === 'DELIVERED' && !message.delivered_at) mdata.delivered_at = new Date()
    if (mapped === 'READ') {
      mdata.read_at = new Date()
      if (!message.delivered_at) mdata.delivered_at = new Date()
    }
    await db.message.update({ where: { id: message.id }, data: mdata })
  }
}

// ─── Update status template ─────────────────────────────────────────────────────

async function handleTemplateStatusUpdate(db: any, slug: string, value: MetaTemplateStatusValue) {
  const event = value?.event // APPROVED | REJECTED | PENDING | PAUSED | DISABLED | FLAGGED
  if (!event) return

  const metaId = value.message_template_id != null ? String(value.message_template_id) : null
  const name   = value.message_template_name

  const tmpl = await db.broadcastTemplate.findFirst({
    where: metaId
      ? { tenant_slug: slug, meta_template_id: metaId }
      : { tenant_slug: slug, template_name: name },
  })
  if (!tmpl) return

  await db.broadcastTemplate.update({
    where: { id: tmpl.id },
    data:  { meta_status: event, aktif: event === 'APPROVED' },
  })
  console.log(`[webhook/meta/${slug}] template ${tmpl.template_name} → ${event}`)
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

interface MetaTemplateStatusValue {
  event?:                     string  // APPROVED | REJECTED | PENDING | PAUSED | DISABLED | FLAGGED
  message_template_id?:       number | string
  message_template_name?:     string
  message_template_language?: string
  reason?:                    string
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
  errors?: Array<{
    code?:       number | string
    title?:      string
    message?:    string
    error_data?: { details?: string }
  }>
}
