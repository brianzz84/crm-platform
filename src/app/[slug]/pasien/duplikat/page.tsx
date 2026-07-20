import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import DuplikatClient from './DuplikatClient'

export const metadata: Metadata = { title: 'Duplikat Pasien' }

export default function DuplikatPasienPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'mergePatients')) redirect(`/${params.slug}/dashboard`)

  return <DuplikatClient slug={params.slug} />
}
