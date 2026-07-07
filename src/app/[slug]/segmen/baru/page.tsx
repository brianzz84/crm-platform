import { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import BuatSegmenClient from './BuatSegmenClient'

export const metadata: Metadata = { title: 'Buat Segmen Baru' }

export default function BuatSegmenPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'manageSegments')) redirect(`/${params.slug}/dashboard`)

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-6)' }}>
        <Link
          href={`/${params.slug}/segmen`}
          style={{ color: 'var(--c-text-muted)', textDecoration: 'none', fontSize: 'var(--font-size-sm)' }}
        >
          ← Kembali ke Daftar Segmen
        </Link>
      </div>
      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
          Buat Segmen Baru
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
          Deskripsikan pasien yang ingin dikelompokkan. AI akan membantu menerjemahkan ke parameter pencarian.
        </p>
      </div>
      <BuatSegmenClient slug={params.slug} />
    </div>
  )
}
