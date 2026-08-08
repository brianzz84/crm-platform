import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import IklanClient from './IklanClient'

export const metadata: Metadata = { title: 'Iklan' }

export default async function IklanPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'manageBroadcast')) redirect(`/${params.slug}/dashboard`)

  // Jejak iklan HANYA tiba lewat webhook Meta Cloud API langsung. Callback Wappin
  // tidak membawa objek `referral` sama sekali, jadi klik yang masuk ke sana
  // hilang tanpa jejak — dan tidak bisa ditarik ulang belakangan.
  //
  // Diperiksa di sini supaya kegagalannya terlihat SEBELUM anggaran iklan
  // dibelanjakan. Tanpa ini, gejalanya hanya tabel kosong, yang mudah dikira
  // "iklannya belum menghasilkan apa-apa" padahal sebenarnya tidak pernah
  // terekam sejak awal.
  const db   = await getTenantDb(params.slug)
  const meta = await db.metaConfig.findUnique({
    where:  { tenant_slug: params.slug },
    select: { aktif: true, phone_number_id: true },
  })

  return (
    <IklanClient
      slug={params.slug}
      jalurLangsung={!!(meta?.aktif && meta.phone_number_id)}
    />
  )
}
