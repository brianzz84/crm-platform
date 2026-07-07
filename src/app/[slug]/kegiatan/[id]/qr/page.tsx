import { redirect, notFound } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import QrDisplayClient from './_QrDisplayClient'

type Props = { params: { slug: string; id: string } }

export default async function QrDisplayPage({ params }: Props) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'manageKegiatan')) redirect(`/${params.slug}/dashboard`)

  const db = await getTenantDb(params.slug)

  const [kegiatan, profile] = await Promise.all([
    db.kegiatan.findFirst({
      where: { id: params.id, tenant_slug: params.slug },
      include: { _count: { select: { peserta: true } } },
    }),
    db.tenantProfile.findUnique({ where: { tenant_slug: params.slug } }),
  ])

  if (!kegiatan) notFound()

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const checkinUrl = `${baseUrl}/kegiatan/${kegiatan.qr_token}`

  return (
    <QrDisplayClient
      kegiatan={{
        id:              kegiatan.id,
        nama:            kegiatan.nama,
        jenis:           kegiatan.jenis,
        tanggal_mulai:   kegiatan.tanggal_mulai.toISOString(),
        tanggal_selesai: kegiatan.tanggal_selesai?.toISOString() ?? null,
        lokasi:          kegiatan.lokasi ?? null,
        penyelenggara:   kegiatan.penyelenggara ?? null,
        keterangan:      kegiatan.keterangan ?? null,
        status:          kegiatan.status,
        totalPeserta:    kegiatan._count.peserta,
      }}
      tenant={{
        slug:        params.slug,
        nama_klinik: profile?.nama_klinik ?? params.slug,
        nama_rs:     profile?.nama_rs ?? params.slug,
        logo_url:    profile?.logo_url ?? null,
      }}
      checkinUrl={checkinUrl}
      backUrl={`/${params.slug}/kegiatan/${params.id}`}
    />
  )
}
