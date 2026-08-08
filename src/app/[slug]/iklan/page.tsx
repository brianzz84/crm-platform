import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import IklanClient from './IklanClient'

export const metadata: Metadata = { title: 'Iklan' }

export default async function IklanPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'manageBroadcast')) redirect(`/${params.slug}/dashboard`)

  return <IklanClient slug={params.slug} />
}
