import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import { masterDb } from '@/lib/tenant'
import PengaturanClient from './PengaturanClient'

export const metadata: Metadata = { title: 'Pengaturan' }

export default async function PengaturanPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'configSystem')) redirect(`/${params.slug}/dashboard`)

  const db = await getTenantDb(params.slug)

  const [profile, wappinCfg, eflyerCfg, users, tenant] = await Promise.all([
    db.tenantProfile.findUnique({ where: { tenant_slug: params.slug } }),
    db.wappinConfig.findUnique({ where: { tenant_slug: params.slug } }),
    db.eflyerConfig.findUnique({ where: { tenant_slug: params.slug } }),
    db.appUser.count({ where: { tenant_slug: params.slug, aktif: true } }),
    masterDb.tenant.findUnique({ where: { slug: params.slug }, select: { name: true, plan: true, created_at: true } }),
  ])

  return (
    <div className="pengaturan-page" style={{ padding: 'var(--sp-6)', flex: 1 }}>
      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
          Pengaturan
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
          Konfigurasi profil klinik, pengguna, dan integrasi sistem.
        </p>
      </div>

      <PengaturanClient
        slug={params.slug}
        userRoles={session.roles}
        initialProfile={profile ? {
          nama_klinik: profile.nama_klinik,
          nama_rs:     profile.nama_rs,
          logo_url:    profile.logo_url ?? '',
          alamat:      profile.alamat   ?? '',
          telp:        profile.telp     ?? '',
          email:       profile.email    ?? '',
          website:     profile.website  ?? '',
        } : null}
        meta={{
          wappinAktif:  !!wappinCfg?.aktif,
          wappinTested: !!wappinCfg?.tested_at,
          eflyerAktif:  !!eflyerCfg?.aktif,
          userCount:    users,
          tenantName:   tenant?.name ?? params.slug,
          plan:         tenant?.plan ?? 'TRIAL',
          joinedAt:     tenant?.created_at.toISOString() ?? '',
        }}
      />
    </div>
  )
}
