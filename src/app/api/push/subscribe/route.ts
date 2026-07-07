import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { endpoint, keys } = await req.json()
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  const db = await getTenantDb(session.tenantSlug)
  await db.pushSubscription.upsert({
    where:  { endpoint },
    create: {
      user_id:     session.userId,
      tenant_slug: session.tenantSlug,
      endpoint,
      p256dh: keys.p256dh,
      auth:   keys.auth,
    },
    update: {
      p256dh: keys.p256dh,
      auth:   keys.auth,
      user_id: session.userId,
    },
  })

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { endpoint } = await req.json()
  const db = await getTenantDb(session.tenantSlug)
  await db.pushSubscription.deleteMany({ where: { endpoint, tenant_slug: session.tenantSlug } })

  return NextResponse.json({ success: true })
}
