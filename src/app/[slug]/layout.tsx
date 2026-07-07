import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import PwaProvider from '@/components/PwaProvider'
import { getSessionFromHeaders } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

interface TenantLayoutProps {
  children: React.ReactNode
  params: { slug: string }
}

export default async function TenantLayout({ children, params }: TenantLayoutProps) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')

  // Pastikan user hanya bisa akses tenant miliknya
  // (SUPER_ADMIN boleh akses semua tenant)
  const isSuperAdmin = session.roles.includes('SUPER_ADMIN')
  if (!isSuperAdmin && session.tenantSlug !== params.slug) {
    redirect(`/${session.tenantSlug}/dashboard`)
  }

  const db         = await getTenantDb(params.slug)
  const profile    = await db.tenantProfile.findUnique({
    where:  { tenant_slug: params.slug },
    select: { nama_klinik: true, logo_url: true },
  })
  const tenantName = profile?.nama_klinik || params.slug.toUpperCase()
  const logoUrl    = profile?.logo_url    || null

  return (
    <>
      {/* Manifest dinamis per tenant */}
      <link rel="manifest" href={`/api/${params.slug}/manifest`} />
      {logoUrl && <link rel="apple-touch-icon" href={logoUrl} />}

      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--c-bg)' }}>
        <Sidebar
          tenantSlug={params.slug}
          tenantName={tenantName}
          userName={session.name}
          userRoles={session.roles}
        />
        {/* paddingTop hanya aktif di mobile (56px = tinggi top bar) via CSS variable */}
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}
          className="tenant-main">
          {children}
        </main>
        <PwaProvider slug={params.slug} logoUrl={logoUrl} />
      </div>
    </>
  )
}
