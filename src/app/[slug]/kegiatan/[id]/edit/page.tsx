import { redirect, notFound } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import KegiatanForm from '../../_components/KegiatanForm'

export const metadata = { title: 'Edit Kegiatan' }

export default async function EditKegiatanPage({ params }: { params: { slug: string; id: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'manageKegiatan')) redirect(`/${params.slug}/dashboard`)

  const db = await getTenantDb(params.slug)
  const k  = await db.kegiatan.findFirst({ where: { id: params.id, tenant_slug: params.slug } })
  if (!k) notFound()

  const fmt = (d: Date | null) => d ? d.toISOString().slice(0, 10) : ''

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1 }}>
      <div style={{ marginBottom: 'var(--sp-5)' }}>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-faint)', marginBottom: 4 }}>
          <a href={`/${params.slug}/kegiatan`} style={{ color: 'var(--c-secondary)', textDecoration: 'none' }}>Kegiatan</a>
          {' / '}
          <a href={`/${params.slug}/kegiatan/${params.id}`} style={{ color: 'var(--c-secondary)', textDecoration: 'none' }}>{k.nama}</a>
          {' / Edit'}
        </div>
        <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--c-text)' }}>Edit Kegiatan</h1>
      </div>
      <KegiatanForm
        slug={params.slug}
        id={params.id}
        initial={{
          nama:            k.nama,
          jenis:           k.jenis,
          tanggal_mulai:   fmt(k.tanggal_mulai),
          tanggal_selesai: fmt(k.tanggal_selesai),
          lokasi:          k.lokasi    || '',
          penyelenggara:   k.penyelenggara || '',
          keterangan:      k.keterangan    || '',
          poin_kegiatan:   k.poin_kegiatan,
          status:          k.status,
        }}
      />
    </div>
  )
}
