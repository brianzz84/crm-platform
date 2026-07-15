import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { masterDb, getTenantDb } from '@/lib/tenant'
import AiConfigForm from './AiConfigForm'
import AiRulesManager from './AiRulesManager'

export const metadata: Metadata = { title: 'Pengaturan AI' }

export default async function AiSettingsPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'configSystem')) redirect(`/${params.slug}/dashboard`)

  const [tenant, db] = await Promise.all([
    masterDb.tenant.findUnique({
      where:  { slug: params.slug },
      select: { config: { select: { ai_enabled: true, ai_provider: true, ai_model: true, ai_api_key: true } } },
    }),
    getTenantDb(params.slug),
  ])

  const cfg = tenant?.config
  const initialData = {
    ai_enabled:  cfg?.ai_enabled ?? false,
    ai_provider: cfg?.ai_provider ?? 'CLAUDE',
    ai_model:    cfg?.ai_model ?? '',
    has_api_key: !!(cfg?.ai_api_key),
  }

  const rules = await db.aiPartnerRule.findMany({
    where:   { tenant_slug: params.slug },
    orderBy: [{ kategori: 'asc' }, { created_at: 'asc' }],
  })
  const initialRules = rules.map((r: any) => ({
    id: r.id, kategori: r.kategori, teks: r.teks, aktif: r.aktif,
    created_at: r.created_at.toISOString(),
  }))

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1 }}>
      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
          Kecerdasan Buatan (AI)
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
          Pilih provider AI dan API key yang dipakai untuk fitur pencarian & segmentasi pasien berbasis AI.
        </p>
      </div>

      <AiConfigForm slug={params.slug} initialData={initialData} />
      <AiRulesManager slug={params.slug} initialRules={initialRules} />
    </div>
  )
}
