import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import LibraryClient from './LibraryClient'

interface Props { params: { slug: string } }

export default async function LibraryPage({ params }: Props) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'icdLibrary')) redirect(`/${params.slug}/dashboard`)

  const db = await getTenantDb(params.slug)

  const [icdTotal, layananTotal] = await Promise.all([
    db.icdLibrary.count({ where: { aktif: true } }),
    db.simrsLayananLibrary.count({ where: { aktif: true } }),
  ])

  // Hitung kode dengan terjemahan Indonesia (nama_id != nama)
  // Tidak bisa filter di Prisma tanpa raw query — gunakan count manual
  const icdVersi = await db.icdLibrary.groupBy({
    by: ['versi'],
    _count: { _all: true },
    where: { aktif: true },
  })

  const layananKelompok = await db.simrsLayananLibrary.groupBy({
    by: ['kelompok'],
    _count: { _all: true },
    where: { aktif: true },
  })

  const byKelompok = Object.fromEntries(layananKelompok.map(k => [k.kelompok, k._count._all]))

  const stats = {
    icdTotal,
    icd10:       icdVersi.find(v => v.versi === 'ICD10')?._count._all ?? 0,
    icd11:       icdVersi.find(v => v.versi === 'ICD11')?._count._all ?? 0,
    layananTotal,
    rawatJalan:  byKelompok['Rawat Jalan']  ?? 0,
    penunjang:   byKelompok['Penunjang']    ?? 0,
    pondokSehat: byKelompok['Pondok Sehat'] ?? 0,
  }

  return (
    <LibraryClient
      slug={params.slug}
      stats={stats}
    />
  )
}
