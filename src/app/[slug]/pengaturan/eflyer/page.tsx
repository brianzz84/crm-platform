import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import EflyerConfigForm from './EflyerConfigForm'

export const metadata: Metadata = { title: 'Integrasi E-Flyer' }

export default async function EflyerConfigPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'configSystem')) redirect(`/${params.slug}/dashboard`)

  const db  = await getTenantDb(params.slug)
  const cfg = await db.eflyerConfig.findUnique({ where: { tenant_slug: params.slug } })

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1 }}>
      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
          Integrasi E-Flyer
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
          Aktifkan fitur E-Flyer agar staf dapat memilih dan mengirim flyer langsung dari halaman chat.
        </p>
      </div>

      <EflyerConfigForm
        slug={params.slug}
        initialCfg={cfg ? {
          aktif:       cfg.aktif,
          api_url:     cfg.api_url ?? '',
          has_api_key: !!(cfg as any).api_key,
        } : null}
      />
    </div>
  )
}
