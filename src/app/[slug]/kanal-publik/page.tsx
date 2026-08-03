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

  const db = await getTenantDb(params.slug)
  const [cfg, meta] = await Promise.all([
    db.googleConfig.findUnique({ where: { tenant_slug: params.slug } }),
    db.metaConfig.findUnique({ where: { tenant_slug: params.slug } }),
  ])

  // Token Insights tidak pernah dikirim ke klien — cukup keterangan ADA/TIDAK.
  const punyaTokenMeta = !!(meta?.insights_token || meta?.access_token)

  return (
    <KanalPublikClient
      slug={params.slug}
      status={{
        tersambung:  !!(cfg?.aktif && cfg.refresh_token),
        akun:        cfg?.connected_email ?? null,
        punyaGa4:    !!cfg?.ga4_property_id,
        punyaYoutube: true,   // channel diambil dari akun tersambung bila ID tidak diisi
        punyaIg:      punyaTokenMeta && !!meta?.ig_business_id,
        punyaFb:      punyaTokenMeta && !!meta?.page_id,
      }}
    />
  )
}
