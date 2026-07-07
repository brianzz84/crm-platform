import { redirect, notFound } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import KegiatanDetailClient from '../_components/KegiatanDetailClient'

const PAGE_SIZE = 15

export default async function DetailKegiatanPage({
  params, searchParams,
}: {
  params: { slug: string; id: string }
  searchParams: { p?: string }
}) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'manageKegiatan')) redirect(`/${params.slug}/dashboard`)

  const db = await getTenantDb(params.slug)
  const k  = await db.kegiatan.findFirst({
    where:   { id: params.id, tenant_slug: params.slug },
    include: { _count: { select: { peserta: true } } },
  })
  if (!k) notFound()

  const page   = Math.max(1, parseInt(searchParams.p || '1'))
  const offset = (page - 1) * PAGE_SIZE
  const total  = k._count.peserta
  const pages  = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const peserta = await db.kegiatanPeserta.findMany({
    where:   { kegiatan_id: params.id },
    orderBy: { created_at: 'desc' },
    skip:    offset,
    take:    PAGE_SIZE,
    include: {
      person: {
        include: {
          contacts: { where: { is_primary: true }, take: 1 },
          _count:   { select: { kegiatan_diikuti: true } },
        },
      },
    },
  })

  const canEdit = canDo(session.roles, 'manageKegiatan')

  return (
    <KegiatanDetailClient
      slug={params.slug}
      kegiatan={{
        id:              k.id,
        kode:            k.kode,
        nama:            k.nama,
        jenis:           k.jenis,
        tanggal_mulai:   k.tanggal_mulai.toISOString(),
        tanggal_selesai: k.tanggal_selesai?.toISOString() ?? null,
        lokasi:          k.lokasi,
        penyelenggara:   k.penyelenggara,
        poin_kegiatan:   k.poin_kegiatan,
        keterangan:      k.keterangan,
        status:          k.status,
        totalPeserta:    total,
      }}
      peserta={peserta.map(row => ({
        id:         row.id,
        hadir:      row.hadir,
        sumber:     row.sumber,
        created_at: row.created_at.toISOString(),
        person: {
          id:            row.person.id,
          name:          row.person.name,
          no_hp:         row.person.no_hp,
          kegiatanCount: row.person._count.kegiatan_diikuti,
          contactNilai:  row.person.contacts[0]?.nilai ?? null,
        },
      }))}
      page={page}
      pages={pages}
      canEdit={canEdit}
    />
  )
}
