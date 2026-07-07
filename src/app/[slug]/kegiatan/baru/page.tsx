import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import KegiatanForm from '../_components/KegiatanForm'

export const metadata = { title: 'Tambah Kegiatan' }

export default async function TambahKegiatanPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'manageKegiatan')) redirect(`/${params.slug}/dashboard`)

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1 }}>
      <div style={{ marginBottom: 'var(--sp-5)' }}>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-faint)', marginBottom: 4 }}>
          <a href={`/${params.slug}/kegiatan`} style={{ color: 'var(--c-secondary)', textDecoration: 'none' }}>Kegiatan</a>
          {' / Tambah Baru'}
        </div>
        <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--c-text)' }}>Tambah Kegiatan</h1>
      </div>
      <KegiatanForm slug={params.slug} />
    </div>
  )
}
