import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import KegiatanList from './_components/KegiatanList'

interface Props { params: { slug: string } }

export default async function KegiatanPage({ params }: Props) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'manageKegiatan')) redirect(`/${params.slug}/dashboard`)

  const db = await getTenantDb(params.slug)
  const kegiatan = await db.kegiatan.findMany({
    where:   { tenant_slug: params.slug },
    orderBy: { tanggal_mulai: 'desc' },
    include: { _count: { select: { peserta: true } } },
  })

  return (
    <div className="kegiatan-page" style={{ padding: 'var(--sp-6)', flex: 1 }}>
      <div className="kegiatan-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-5)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--c-text)', marginBottom: 4 }}>
            Kegiatan
          </h1>
          <p className="kegiatan-page-subtitle" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-faint)' }}>
            {kegiatan.length} kegiatan tercatat
          </p>
        </div>
        <a
          href={`/${params.slug}/kegiatan/baru`}
          style={{
            background: 'var(--c-secondary)', color: 'white',
            padding: '10px 20px', borderRadius: 'var(--r-md)',
            textDecoration: 'none', fontSize: 'var(--font-size-sm)', fontWeight: 600,
            flexShrink: 0,
          }}
        >
          + Tambah
        </a>
      </div>

      <KegiatanList
        slug={params.slug}
        kegiatan={kegiatan.map(k => ({
          id:              k.id,
          kode:            k.kode,
          nama:            k.nama,
          jenis:           k.jenis,
          lokasi:          k.lokasi,
          tanggal_mulai:   k.tanggal_mulai.toISOString(),
          tanggal_selesai: k.tanggal_selesai?.toISOString() ?? null,
          status:          k.status,
          pesertaCount:    k._count.peserta,
        }))}
      />
    </div>
  )
}
