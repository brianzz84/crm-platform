import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getTenantDb } from '@/lib/tenant'

export async function POST(req: NextRequest) {
  const session = await getSession()
  console.log('[push/subscribe] session:', session?.userId, session?.tenantSlug)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { endpoint, keys } = await req.json()
  console.log('[push/subscribe] endpoint:', endpoint?.slice(0, 60))
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    console.log('[push/subscribe] invalid payload')
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
      p256dh:  keys.p256dh,
      auth:    keys.auth,
      user_id: session.userId,
    },
  })

  console.log('[push/subscribe] saved OK for', session.tenantSlug)
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { endpoint } = await req.json()
  const db = await getTenantDb(session.tenantSlug)
  await db.pushSubscription.deleteMany({ where: { endpoint, tenant_slug: session.tenantSlug } })

  return NextResponse.json({ success: true })
}
