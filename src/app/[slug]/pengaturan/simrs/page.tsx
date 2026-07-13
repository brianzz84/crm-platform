import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { masterDb } from '@/lib/tenant'
import SimrsConfigForm from './SimrsConfigForm'

export const metadata: Metadata = { title: 'Integrasi SIMRS' }

export default async function SimrsPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')

  const canConfig = canDo(session.roles, 'configSystem')
  const canSync   = canDo(session.roles, 'manageSegments')

  // Halaman ini dapat diakses oleh siapapun yang bisa config ATAU sync
  if (!canConfig && !canSync) redirect(`/${params.slug}/dashboard`)

  let initialData = null

  if (canConfig) {
    const tenant = await masterDb.tenant.findUnique({
      where:  { slug: params.slug },
      select: { config: { select: { simrs_base_url: true, simrs_jam_sync: true, simrs_api_key: true } } },
    })

    const cfg = tenant?.config
    initialData = {
      simrs_base_url: cfg?.simrs_base_url ?? '',
      simrs_jam_sync: cfg?.simrs_jam_sync ?? 0,
      has_api_key:    !!(cfg?.simrs_api_key),
    }
  }

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1 }}>
      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
          Integrasi SIMRS
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
          Konfigurasi sinkronisasi data kunjungan pasien dari Sistem Informasi Manajemen RS.
        </p>
      </div>

      {/* Info badge mock mode */}
      {process.env.SIMRS_MOCK === 'true' && (
        <div style={{
          background: '#FFFBEB', border: '1px solid #FDE68A', borderLeft: '3px solid #F59E0B',
          borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)', marginBottom: 'var(--sp-5)',
          fontSize: 'var(--font-size-sm)', color: '#92400E',
        }}>
          <strong>Mock Mode Aktif</strong> — Sync menggunakan data dummy. Atur <code>SIMRS_MOCK=false</code> setelah API SIMRS dari IT RKZ tersedia.
        </div>
      )}

      {/* Panduan alur singkat */}
      <div style={{
        background: 'var(--c-surface)', border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-lg)', marginBottom: 'var(--sp-6)', overflow: 'hidden',
      }}>
        <div style={{ padding: 'var(--sp-4) var(--sp-5)', background: 'var(--c-bg)', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>🔗</span>
          <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--c-primary)' }}>Cara Kerja Sinkronisasi</span>
        </div>
        <div style={{ padding: 'var(--sp-4) var(--sp-5)', display: 'flex', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap', fontSize: 11 }}>
          {[
            { icon: '🕛', label: 'Cron otomatis', sub: 'Setiap malam sesuai jam yang dikonfigurasi' },
            { arrow: true },
            { icon: '🏥', label: 'Query SIMRS API', sub: 'Ambil kunjungan delta kemarin' },
            { arrow: true },
            { icon: '💾', label: 'Upsert ke DB lokal', sub: 'Person + SimrsVisit diperbarui' },
            { arrow: true },
            { icon: '🔍', label: 'Siap disegmentasi', sub: 'Query segmen pakai data lokal' },
          ].map((s: any, i) =>
            s.arrow ? (
              <span key={i} style={{ color: 'var(--c-text-faint)', fontSize: 16, paddingTop: 8 }}>→</span>
            ) : (
              <div key={i} style={{ textAlign: 'center', minWidth: 110 }}>
                <div style={{ fontSize: 20, marginBottom: 2 }}>{s.icon}</div>
                <div style={{ fontWeight: 700, color: 'var(--c-text)', lineHeight: 1.3 }}>{s.label}</div>
                <div style={{ color: 'var(--c-text-faint)', marginTop: 2 }}>{s.sub}</div>
              </div>
            )
          )}
        </div>
      </div>

      <SimrsConfigForm
        slug={params.slug}
        canConfig={canConfig}
        canSync={canSync}
        initialData={initialData}
      />
    </div>
  )
}
