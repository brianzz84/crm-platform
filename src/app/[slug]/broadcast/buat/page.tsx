import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import BroadcastWizard from './BroadcastWizard'

export const metadata: Metadata = { title: 'Buat Campaign Broadcast' }

export default function BuatBroadcastPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { segmenId?: string }
}) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'manageBroadcast')) redirect(`/${params.slug}/dashboard`)
  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1, maxWidth: 780 }}>
      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <a href={`/${params.slug}/broadcast`}
          style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-secondary)', textDecoration: 'none' }}>
          ← Kembali ke Broadcast
        </a>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginTop: 'var(--sp-3)', marginBottom: 4 }}>
          Buat Campaign Broadcast
        </h1>
      </div>
      <BroadcastWizard slug={params.slug} defaultSegmentId={searchParams.segmenId} />
    </div>
  )
}
