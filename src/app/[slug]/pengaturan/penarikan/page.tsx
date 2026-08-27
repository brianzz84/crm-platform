import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import PenarikanClient from './PenarikanClient'

export const metadata: Metadata = { title: 'Penarikan Data' }

export default async function PenarikanPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'configSystem')) redirect(`/${params.slug}/dashboard`)

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1 }}>
      <div style={{ marginBottom: 'var(--sp-2)' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
          Penarikan Data
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', maxWidth: 680, lineHeight: 1.6 }}>
          Rekaman harian yang menopang laporan triwulan. Dasbor membaca langsung dari API;
          yang direkam di sini hanya yang akan hilang bila tidak disimpan hari itu juga.
        </p>
      </div>

      <PenarikanClient slug={params.slug} />
    </div>
  )
}
