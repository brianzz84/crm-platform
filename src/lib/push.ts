import webpush from 'web-push'
import { getTenantDb } from './tenant'

const VAPID_PUBLIC  = 'BGQKiAIcCA4kEst0IIOLCACmMOiEz2rcFeVOE04I9PBCddTJfJWeZvmbunHqR9GO6UrbZZbh9gmQzbjZONSCfP8'
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:brianzz84@gmail.com'

function initVapid() {
  const privKey = process.env.VAPID_PRIVATE_KEY
  if (privKey) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, privKey)
  }
}

interface PushPayload {
  title: string
  body:  string
  url?:  string
  tag?:  string
}

export async function sendPushToTenant(tenantSlug: string, payload: PushPayload) {
  initVapid()
  const db      = await getTenantDb(tenantSlug)
  const profile = await db.tenantProfile.findUnique({ where: { tenant_slug: tenantSlug }, select: { logo_url: true } })
  const icon    = profile?.logo_url || '/icons/icon-192x192.png'
  const subs    = await db.pushSubscription.findMany({ where: { tenant_slug: tenantSlug } })

  console.log(`[push] ${tenantSlug}: ${subs.length} subscription(s), payload="${payload.title}"`)

  if (subs.length === 0) return { sent: 0, failed: 0 }

  const fullPayload = { ...payload, icon, badge: icon }

  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(fullPayload),
        { TTL: 60 }
      )
    )
  )

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[push] failed sub[${i}]:`, (r.reason as any)?.statusCode, (r.reason as any)?.body?.slice?.(0, 100))
    }
  })

  // Hapus subscription yang sudah expired/invalid (410 Gone)
  const expired = subs.filter((_, i) => {
    const r = results[i]
    return r.status === 'rejected' && (r.reason as any)?.statusCode === 410
  })
  if (expired.length) {
    await db.pushSubscription.deleteMany({
      where: { endpoint: { in: expired.map(s => s.endpoint) } },
    })
  }

  return { sent: results.filter(r => r.status === 'fulfilled').length, failed: expired.length }
}
