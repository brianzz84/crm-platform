import webpush from 'web-push'
import { getTenantDb } from './tenant'

function initVapid() {
  const mailto  = process.env.VAPID_MAILTO
  const pubKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privKey = process.env.VAPID_PRIVATE_KEY
  if (mailto && pubKey && privKey) {
    webpush.setVapidDetails(mailto, pubKey, privKey)
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
