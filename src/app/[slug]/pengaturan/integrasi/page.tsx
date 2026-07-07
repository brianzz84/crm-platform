import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import WappinConfigForm from './WappinConfigForm'

export const metadata: Metadata = { title: 'Integrasi Wappin' }

export default async function IntegrasiPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'configSystem')) redirect(`/${params.slug}/dashboard`)

  const db  = await getTenantDb(params.slug)
  const cfg = await db.wappinConfig.findUnique({ where: { tenant_slug: params.slug } })

  const webhookUrl = cfg
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/wappin/${params.slug}/${cfg.webhook_secret}`
    : null

  const setupStatus = {
    hasConfig:  !!cfg,
    isAktif:    !!cfg?.aktif,
    hasTested:  !!cfg?.tested_at,
    hasWebhook: !!webhookUrl,
  }

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1 }}>
      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
          Integrasi Wappin
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
          Konfigurasi akun Wappin untuk mengirim broadcast WhatsApp dan menerima pesan masuk dari pasien.
        </p>
      </div>

      {/* ── Panduan Setup ── */}
      <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', marginBottom: 'var(--sp-6)', overflow: 'hidden' }}>
        <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)', background: 'var(--c-bg)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>📋</span>
          <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--c-primary)' }}>Panduan Setup Integrasi</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--c-text-faint)' }}>Ikuti urutan langkah berikut</span>
        </div>

        <div style={{ padding: 'var(--sp-5)' }}>
          {/* Diagram alur */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 'var(--sp-5)', flexWrap: 'wrap' }}>
            {[
              { n: '1', label: 'Isi Kredensial', done: setupStatus.hasConfig },
              { n: '→', label: '', done: false, arrow: true },
              { n: '2', label: 'Test Koneksi', done: setupStatus.hasTested },
              { n: '→', label: '', done: false, arrow: true },
              { n: '3', label: 'Copy Webhook URL', done: setupStatus.hasWebhook },
              { n: '→', label: '', done: false, arrow: true },
              { n: '4', label: 'Daftar ke Wappin', done: false, manual: true },
            ].map((s, i) =>
              s.arrow ? (
                <span key={i} style={{ color: 'var(--c-text-faint)', fontSize: 18, flexShrink: 0 }}>→</span>
              ) : (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800, flexShrink: 0,
                    background: s.done ? '#22C55E' : s.manual ? '#F1F5F9' : 'var(--c-border)',
                    color:      s.done ? 'white'   : 'var(--c-text-faint)',
                  }}>
                    {s.done ? '✓' : s.n}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: s.done ? 700 : 400, color: s.done ? '#15803D' : 'var(--c-text-muted)' }}>
                    {s.label}
                  </span>
                </div>
              )
            )}
          </div>

          {/* Langkah detail */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
            {[
              {
                n: '1', title: 'Isi Kredensial Wappin',
                done: setupStatus.hasConfig,
                items: [
                  'Pilih versi API: V2 (rekomendasi) atau V1 (legacy)',
                  'V2: isi Username + Password dari akun Wappin',
                  'V1: isi Client ID, Project ID, dan Secret Key',
                  'Klik Simpan Konfigurasi',
                ],
              },
              {
                n: '2', title: 'Test Koneksi',
                done: setupStatus.hasTested,
                items: [
                  'Klik tombol "Test Koneksi" di bawah form',
                  'Sistem akan mencoba login ke Wappin API',
                  'Pastikan muncul pesan "Koneksi berhasil"',
                  'Jika gagal: cek username/password atau IP whitelist',
                ],
              },
              {
                n: '3', title: 'Salin Webhook URL',
                done: setupStatus.hasWebhook,
                items: [
                  'Setelah konfigurasi disimpan, URL webhook muncul di bawah ini',
                  'URL bersifat unik dan rahasia — jangan dibagikan sembarangan',
                  'Salin URL tersebut untuk digunakan di langkah berikutnya',
                ],
              },
              {
                n: '4', title: 'Daftarkan ke Dashboard Wappin',
                done: false,
                manual: true,
                items: [
                  'Login ke dashboard.wappin.id',
                  'Buka menu Pengaturan › Webhook / Callback URL',
                  'Paste URL webhook dari langkah 3',
                  'Aktifkan event: Message Status + Incoming Message',
                  'Simpan — integrasi siap digunakan',
                ],
              },
            ].map(step => (
              <div key={step.n} style={{
                background: step.done ? '#F0FDF4' : 'var(--c-bg)',
                border: `1px solid ${step.done ? '#BBF7D0' : 'var(--c-border)'}`,
                borderRadius: 'var(--r-md)', padding: 'var(--sp-4)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    background: step.done ? '#22C55E' : step.manual ? '#E2E8F0' : '#CBD5E1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, color: step.done ? 'white' : '#64748B',
                  }}>
                    {step.done ? '✓' : step.n}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)', color: step.done ? '#15803D' : 'var(--c-text)' }}>
                    {step.title}
                    {step.manual && <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--c-text-faint)', marginLeft: 4 }}>(manual di Wappin)</span>}
                  </span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, listStyle: 'disc' }}>
                  {step.items.map((item, i) => (
                    <li key={i} style={{ fontSize: 11, color: 'var(--c-text-muted)', lineHeight: 1.6 }}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Diagram alur sistem */}
          <div style={{ marginTop: 'var(--sp-5)', padding: 'var(--sp-4)', background: 'var(--c-bg)', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Alur Sistem Setelah Terintegrasi
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, flexWrap: 'wrap', fontSize: 11 }}>
              {[
                { icon: '👤', label: 'Admin buat Campaign', sub: 'pilih template + segmen' },
                { arrow: true },
                { icon: '⚙️', label: 'Sistem kirim batch', sub: 'POST ke Wappin API' },
                { arrow: true },
                { icon: '📱', label: 'WA terkirim ke pasien', sub: 'via nomor Wappin' },
                { arrow: true },
                { icon: '🔔', label: 'Wappin callback', sub: 'delivery report ke webhook' },
                { arrow: true },
                { icon: '📊', label: 'Statistik update', sub: 'terkirim/dibaca/dibalas' },
              ].map((s: any, i) =>
                s.arrow ? (
                  <span key={i} style={{ color: 'var(--c-text-faint)', fontSize: 16, paddingTop: 6 }}>→</span>
                ) : (
                  <div key={i} style={{ textAlign: 'center', minWidth: 90 }}>
                    <div style={{ fontSize: 20, marginBottom: 2 }}>{s.icon}</div>
                    <div style={{ fontWeight: 700, color: 'var(--c-text)', lineHeight: 1.3 }}>{s.label}</div>
                    <div style={{ color: 'var(--c-text-faint)', marginTop: 2 }}>{s.sub}</div>
                  </div>
                )
              )}
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--c-border)', display: 'flex', alignItems: 'flex-start', gap: 4, flexWrap: 'wrap', fontSize: 11 }}>
              {[
                { icon: '💬', label: 'Pasien membalas WA', sub: 'incoming message' },
                { arrow: true },
                { icon: '🔔', label: 'Wappin callback', sub: 'incoming_message event' },
                { arrow: true },
                { icon: '📥', label: 'Masuk ke Inbox', sub: 'percakapan baru/existing' },
                { arrow: true },
                { icon: '🧑‍💼', label: 'Agen merespons', sub: 'dari halaman Inbox' },
              ].map((s: any, i) =>
                s.arrow ? (
                  <span key={i} style={{ color: 'var(--c-text-faint)', fontSize: 16, paddingTop: 6 }}>→</span>
                ) : (
                  <div key={i} style={{ textAlign: 'center', minWidth: 90 }}>
                    <div style={{ fontSize: 20, marginBottom: 2 }}>{s.icon}</div>
                    <div style={{ fontWeight: 700, color: 'var(--c-text)', lineHeight: 1.3 }}>{s.label}</div>
                    <div style={{ color: 'var(--c-text-faint)', marginTop: 2 }}>{s.sub}</div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Webhook URL ── */}
      {webhookUrl ? (
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 'var(--r-lg)', padding: 'var(--sp-4) var(--sp-5)', marginBottom: 'var(--sp-6)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#15803D', marginBottom: 8 }}>
            WEBHOOK URL — Salin & daftarkan ke Dashboard Wappin
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <code style={{ flex: 1, fontSize: 12, wordBreak: 'break-all', color: '#166534', background: '#DCFCE7', padding: '8px 12px', borderRadius: 6, display: 'block' }}>
              {webhookUrl}
            </code>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: '#15803D', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span>✓ Event yang didukung: <strong>Message Status</strong> (delivery report) + <strong>Incoming Message</strong> (pesan masuk)</span>
            <span>✓ URL ini unik per tenant — jangan dibagikan ke pihak lain</span>
          </div>
        </div>
      ) : (
        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 'var(--r-lg)', padding: 'var(--sp-4) var(--sp-5)', marginBottom: 'var(--sp-6)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 4 }}>WEBHOOK URL</div>
          <p style={{ fontSize: 12, color: '#92400E', margin: 0 }}>
            Webhook URL akan muncul setelah konfigurasi Wappin disimpan pertama kali.
          </p>
        </div>
      )}

      <WappinConfigForm
        slug={params.slug}
        initialData={cfg ? {
          api_version:     cfg.api_version,
          username:        cfg.username ?? '',
          base_url:        cfg.base_url,
          login_url:       cfg.login_url,
          messages_url:    cfg.messages_url,
          namespace:       cfg.namespace ?? '',
          aktif:           cfg.aktif,
          tested_at:       cfg.tested_at?.toISOString() ?? null,
          has_password:    !!cfg.password,
          client_id:       cfg.client_id ?? '',
          project_id:      cfg.project_id ?? '',
          has_secret_key:  !!cfg.secret_key,
        } : null}
      />
    </div>
  )
}
