import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import AiPartnerShell from './AiPartnerShell'

export const metadata: Metadata = { title: 'AI Partner' }

export default async function AiPartnerPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'manageSegments')) redirect(`/${params.slug}/dashboard`)

  const db       = await getTenantDb(params.slug)
  const sessions = await db.aiPartnerSession.findMany({
    where:   { tenant_slug: params.slug, created_by: session.userId },
    orderBy: { updated_at: 'desc' },
    select:  { id: true, judul: true, created_at: true, updated_at: true },
  })

  const initialSessions = sessions.map((s: any) => ({
    id: s.id, judul: s.judul,
    created_at: s.created_at.toISOString(),
    updated_at: s.updated_at.toISOString(),
  }))

  return (
    // Tinggi terkunci ke viewport (pola sama dengan Inbox) supaya HANYA area
    // percakapan yang scroll — header & input bar tetap di tempat.
    <div className="ai-partner-page">
      <div style={{ padding: 'var(--sp-5) var(--sp-6) var(--sp-3)', flexShrink: 0 }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
          🤖 AI Partner
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
          Diskusi & cari target pasien untuk kegiatan marketing — AI memverifikasi kode ICD/layanan lewat pencarian nyata, bukan menebak.
        </p>
      </div>

      <AiPartnerShell slug={params.slug} initialSessions={initialSessions} />
    </div>
  )
}
