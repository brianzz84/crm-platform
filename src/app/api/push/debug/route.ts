import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getTenantDb } from '@/lib/tenant'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Tidak login', session: null })

  const db   = await getTenantDb(session.tenantSlug)
  const subs = await db.pushSubscription.findMany({ where: { tenant_slug: session.tenantSlug } })

  return NextResponse.json({
    session: { userId: session.userId, tenant: session.tenantSlug, name: session.name },
    subscriptions: subs.length,
    endpoints: subs.map(s => s.endpoint.slice(0, 80)),
  })
}
