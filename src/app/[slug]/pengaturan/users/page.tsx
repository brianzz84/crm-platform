import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import UsersClient from './UsersClient'

export const metadata: Metadata = { title: 'Manajemen Pengguna' }

export default async function PengaturanUsersPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'manageUsers')) redirect(`/${params.slug}/dashboard`)

  const db = await getTenantDb(params.slug)
  const users = await db.appUser.findMany({
    where:   { tenant_slug: params.slug },
    orderBy: { created_at: 'desc' },
    select: {
      id: true, name: true, email: true, roles: true,
      aktif: true, last_login_at: true, created_at: true,
      invite_token: true,
    },
  })

  const activeAdminItCount = users.filter(u =>
    u.aktif && u.roles.includes('ADMIN_IT' as any)
  ).length

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1 }}>
      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
          Manajemen Pengguna
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
          Undang anggota tim dan atur hak akses mereka. Link aktivasi dikirim via email.
        </p>
      </div>

      <UsersClient
        slug={params.slug}
        initialUsers={users as any}
        activeAdminItCount={activeAdminItCount}
        currentUserId={session.userId}
      />
    </div>
  )
}
