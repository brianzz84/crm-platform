import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import MetaConfigForm from './MetaConfigForm'

export const metadata: Metadata = { title: 'Integrasi Meta Cloud API' }

export default async function MetaConfigPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'configSystem')) redirect(`/${params.slug}/dashboard`)

  const db  = await getTenantDb(params.slug)
  const cfg = await db.metaConfig.findUnique({ where: { tenant_slug: params.slug } })

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/meta/${params.slug}`

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1 }}>
      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
          Integrasi Meta Cloud API
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
          Konfigurasi WhatsApp Business langsung via Meta Cloud API — tanpa pihak ketiga.
        </p>
      </div>

      {/* Webhook URL */}
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 'var(--r-lg)', padding: 'var(--sp-4) var(--sp-5)', marginBottom: 'var(--sp-6)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', marginBottom: 8 }}>
          WEBHOOK URL — Daftarkan di Meta Developers
        </div>
        <code style={{ display: 'block', fontSize: 12, wordBreak: 'break-all', color: '#1E40AF', background: '#DBEAFE', padding: '8px 12px', borderRadius: 6 }}>
          {webhookUrl}
        </code>
        <div style={{ marginTop: 10, fontSize: 11, color: '#1D4ED8', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span>→ Meta Developers → App → WhatsApp → Configuration → Webhook</span>
          <span>→ Callback URL: paste URL di atas</span>
          <span>→ Verify Token: isi dengan nilai <code style={{ background: '#DBEAFE', padding: '1px 6px', borderRadius: 4 }}>META_WEBHOOK_VERIFY_TOKEN</code> di Railway Variables</span>
          <span>→ Subscribe fields: <strong>messages</strong>, <strong>messaging_handovers</strong></span>
        </div>
      </div>

      {/* Panduan setup singkat */}
      <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', marginBottom: 'var(--sp-6)', overflow: 'hidden' }}>
        <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)', background: 'var(--c-bg)' }}>
          <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--c-primary)' }}>📋 Cara Mendapatkan Credentials</span>
        </div>
        <div style={{ padding: 'var(--sp-5)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
          {[
            {
              title: 'Phone Number ID',
              steps: [
                'Buka Meta Developers (developers.facebook.com)',
                'Pilih App → WhatsApp → API Setup',
                'Salin "Phone number ID" (bukan nomor HP)',
              ],
            },
            {
              title: 'Permanent Access Token',
              steps: [
                'Meta Business Suite → Pengaturan → System Users',
                'Buat/pilih System User → Assign Assets (App + WABA)',
                'Generate Token → pilih izin: whatsapp_business_messaging',
                'Pilih "Never expire" → salin token',
              ],
            },
          ].map(s => (
            <div key={s.title} style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)' }}>
              <div style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text)', marginBottom: 8 }}>{s.title}</div>
              <ol style={{ margin: 0, paddingLeft: 16 }}>
                {s.steps.map((step, i) => (
                  <li key={i} style={{ fontSize: 11, color: 'var(--c-text-muted)', lineHeight: 1.7 }}>{step}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>

      <MetaConfigForm
        slug={params.slug}
        initialData={cfg ? {
          id:              cfg.id,
          phone_number_id: cfg.phone_number_id,
          waba_id:         cfg.waba_id,
          aktif:           cfg.aktif,
          has_token:       !!cfg.access_token,
          tested_at:       cfg.tested_at?.toISOString() ?? null,
        } : null}
      />
    </div>
  )
}
