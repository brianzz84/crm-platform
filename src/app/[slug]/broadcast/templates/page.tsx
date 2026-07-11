import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import TemplatesClient from './TemplatesClient'

export const metadata: Metadata = { title: 'Kelola Template Broadcast' }

export default async function TemplatesPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'manageBroadcast')) redirect(`/${params.slug}/broadcast`)

  const db        = await getTenantDb(params.slug)
  const templates = await db.broadcastTemplate.findMany({
    where:   { tenant_slug: params.slug },
    orderBy: { created_at: 'desc' },
    include: { campaigns: { select: { id: true }, take: 1 } },
  })

  const data = templates.map(t => ({
    id:                 t.id,
    nama:               t.nama,
    template_name:      t.template_name,
    template_language:  t.template_language,
    meta_category:      (t as any).meta_category ?? null,
    meta_status:        (t as any).meta_status ?? null,
    meta_template_id:   (t as any).meta_template_id ?? null,
    components_schema:  t.components_schema as any[],
    preview_text:       t.preview_text ?? '',
    aktif:              t.aktif,
    created_at:         t.created_at.toISOString(),
    campaign_count:     t.campaigns.length,
  }))

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1 }}>
      <div style={{ marginBottom: 'var(--sp-6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <a href={`/${params.slug}/broadcast`} style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', textDecoration: 'none' }}>
              ← Broadcast
            </a>
          </div>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', margin: 0 }}>
            Template Broadcast
          </h1>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', marginTop: 4 }}>
            Buat dan kelola template pesan WhatsApp untuk campaign broadcast.
          </p>
        </div>
      </div>

      <TemplatesClient slug={params.slug} initialTemplates={data} />
    </div>
  )
}
