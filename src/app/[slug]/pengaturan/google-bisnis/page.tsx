import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import GoogleBisnisConfigForm from './GoogleBisnisConfigForm'
import GoogleBisnisDiagnostik from './GoogleBisnisDiagnostik'

export const metadata: Metadata = { title: 'Integrasi Google Business Profile' }

export default async function GoogleBisnisPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'configSystem')) redirect(`/${params.slug}/dashboard`)

  const db  = await getTenantDb(params.slug)
  const cfg = await db.googleConfig.findUnique({ where: { tenant_slug: params.slug } })

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1 }}>
      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
          Integrasi Google Business Profile
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
          Menarik ulasan, performa lokasi, dan status listing Google ke dalam CRM.
        </p>
      </div>

      {/* Ekspektasi jujur di depan: akses API-nya ditinjau Google */}
      <div style={{
        background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 'var(--r-lg)',
        padding: 'var(--sp-4) var(--sp-5)', marginBottom: 'var(--sp-6)',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 6 }}>
          TAHAP PERSIAPAN — AKSES API MASIH PERLU DISETUJUI GOOGLE
        </div>
        <p style={{ fontSize: 13, color: '#92400E', margin: 0, lineHeight: 1.7 }}>
          Punya akun Google Bisnis korporat belum cukup. Setiap API harus diaktifkan di project Google Cloud, dan
          project itu sendiri harus lolos peninjauan Google sebelum bisa membaca data listing Anda. Halaman ini
          adalah alat untuk mengetahui <strong>persisnya sejauh mana akses sudah terbuka</strong> — isi kredensial,
          jalankan probe, dan setiap cek akan memberi tahu apa yang masih kurang. Fitur ulasan, dashboard performa,
          dan monitor listing dibangun setelah probe hijau.
        </p>
      </div>

      {/* Apa yang akan dibuka tiap API */}
      <div style={{
        background: 'var(--c-surface)', border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-lg)', marginBottom: 'var(--sp-6)', overflow: 'hidden',
      }}>
        <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)', background: 'var(--c-bg)' }}>
          <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--c-primary)' }}>
            Yang akan dibuka tiap API
          </span>
        </div>
        <div style={{ padding: 'var(--sp-5)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 'var(--sp-3)' }}>
          {[
            { judul: 'Account Management', isi: 'Membaca akun bisnis yang Anda kelola — dasar bagi semua pemanggilan lain.' },
            { judul: 'Business Information', isi: 'Daftar seluruh lokasi beserta statusnya. Ini yang menopang halaman monitor listing.' },
            { judul: 'Business Performance', isi: 'Tayangan di Search & Maps, klik telepon, permintaan rute, klik website — bahan dashboard performa.' },
            { judul: 'Ulasan (API v4)', isi: 'Membaca dan membalas ulasan pasien. Paling ketat izinnya, jadi wajar paling terakhir hijau.' },
          ].map(k => (
            <div key={k.judul} style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)' }}>
              <div style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text)', marginBottom: 6 }}>{k.judul}</div>
              <p style={{ fontSize: 11, color: 'var(--c-text-muted)', lineHeight: 1.7, margin: 0 }}>{k.isi}</p>
            </div>
          ))}
        </div>
      </div>

      <GoogleBisnisConfigForm
        slug={params.slug}
        initialData={cfg ? {
          id:                 cfg.id,
          client_id:          cfg.client_id,
          account_id:         cfg.account_id,
          location_utama:     cfg.location_utama,
          ga4_property_id:    cfg.ga4_property_id,
          youtube_channel_id: cfg.youtube_channel_id,
          aktif:              cfg.aktif,
          has_client_secret:  !!cfg.client_secret,
          has_refresh_token:  !!cfg.refresh_token,
          scopes:             cfg.scopes,
          connected_at:       cfg.connected_at?.toISOString() ?? null,
          connected_email:    cfg.connected_email,
          tested_at:          cfg.tested_at?.toISOString() ?? null,
        } : null}
      />

      <GoogleBisnisDiagnostik slug={params.slug} />
    </div>
  )
}
