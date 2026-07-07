import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import InboxShell from './InboxShell'

export const metadata: Metadata = { title: 'Inbox' }

export default async function InboxPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'replyChat')) redirect(`/${params.slug}/dashboard`)

  const db        = await getTenantDb(params.slug)
  const eflyerCfg = await db.eflyerConfig.findUnique({ where: { tenant_slug: params.slug } })

  return (
    <InboxShell
      slug={params.slug}
      userId={session.userId}
      canViewAll={canDo(session.roles, 'viewAllInbox')}
      canAssign={canDo(session.roles, 'assignConversation')}
      eflyerEnabled={!!(eflyerCfg?.aktif && eflyerCfg?.api_url && (eflyerCfg as any).api_key)}
    />
  )
}
