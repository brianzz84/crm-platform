import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import KanalPublikClient from './KanalPublikClient'

export const metadata: Metadata = { title: 'Kanal Publik' }

export default async function KanalPublikPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'manageBroadcast')) redirect(`/${params.slug}/dashboard`)

  const db  = await getTenantDb(params.slug)
  const cfg = await db.googleConfig.findUnique({ where: { tenant_slug: params.slug } })

  return (
    <KanalPublikClient
      slug={params.slug}
      status={{
        tersambung:  !!(cfg?.aktif && cfg.refresh_token),
        akun:        cfg?.connected_email ?? null,
        punyaGa4:    !!cfg?.ga4_property_id,
        punyaYoutube: true,   // channel diambil dari akun tersambung bila ID tidak diisi
      }}
    />
  )
}
