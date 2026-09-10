import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import SebutanClient from './SebutanClient'

export const metadata: Metadata = { title: 'Sebutan Publik' }

export default async function SebutanPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  // Izin yang sama dengan Kanal Publik — subjeknya berbeda, tetapi orang yang
  // berkepentingan sama persis, termasuk ADMIN_MEDSOS.
  if (!canDo(session.roles, 'viewKanalPublik')) redirect(`/${params.slug}/dashboard`)

  return <SebutanClient slug={params.slug} />
}
