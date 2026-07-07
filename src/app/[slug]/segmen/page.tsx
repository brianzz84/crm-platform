import { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'

export const metadata: Metadata = { title: 'Segmentasi Pasien' }

function formatDate(d: Date) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d))
}

export default async function SegmenPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'manageSegments')) redirect(`/${params.slug}/dashboard`)

  const db     = await getTenantDb(params.slug)
  const segmen = await db.segment.findMany({
    where:   { tenant_slug: params.slug },
    orderBy: { updated_at: 'desc' },
    take:    50,
    include: { _count: { select: { segment_persons: true, campaigns: true } } },
  })

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--sp-4)', marginBottom: 'var(--sp-6)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
            Segmentasi Pasien
          </h1>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
            Kelompokkan pasien berdasarkan kondisi klinis atau riwayat kunjungan untuk broadcast yang terarah.
          </p>
        </div>
        <Link
          href={`/${params.slug}/segmen/baru`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '9px 16px', borderRadius: 'var(--r-md)',
            background: 'var(--c-secondary)', color: 'white',
            fontWeight: 600, fontSize: 'var(--font-size-sm)',
            textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          + Buat Segmen Baru
        </Link>
      </div>

      {/* Empty state */}
      {segmen.length === 0 && (
        <div style={{
          textAlign: 'center', padding: 'var(--sp-16)',
          background: 'var(--c-surface)', borderRadius: 'var(--r-lg)',
          border: '1px solid var(--c-border)',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
          <p style={{ fontWeight: 600, marginBottom: 6, color: 'var(--c-text)' }}>Belum ada segmen</p>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', marginBottom: 20 }}>
            Buat segmen pertama dengan mendeskripsikan target pasien dalam bahasa natural.
          </p>
          <Link
            href={`/${params.slug}/segmen/baru`}
            style={{
              display: 'inline-flex', padding: '8px 20px', borderRadius: 'var(--r-md)',
              background: 'var(--c-secondary)', color: 'white',
              fontWeight: 600, fontSize: 'var(--font-size-sm)', textDecoration: 'none',
            }}
          >
            Buat Segmen Baru
          </Link>
        </div>
      )}

      {/* Grid kartu segmen */}
      {segmen.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--sp-4)' }}>
          {segmen.map(s => (
            <div
              key={s.id}
              style={{
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                borderRadius: 'var(--r-lg)', padding: 'var(--sp-5)',
                display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ fontWeight: 700, fontSize: 'var(--font-size-md)', color: 'var(--c-text)', margin: 0 }}>
                  {s.nama}
                </h3>
                <span style={{
                  fontSize: 'var(--font-size-xs)', fontWeight: 600,
                  background: 'var(--c-primary-xlight)', color: 'var(--c-primary)',
                  padding: '2px 10px', borderRadius: 'var(--r-full)',
                }}>
                  {s._count.segment_persons} anggota
                </span>
              </div>

              {s.deskripsi && (
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', margin: 0 }}>
                  {s.deskripsi}
                </p>
              )}

              {s.nlp_query && (
                <div style={{
                  fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)',
                  background: 'var(--c-bg)', padding: '6px 10px',
                  borderRadius: 'var(--r-sm)', fontStyle: 'italic',
                  borderLeft: '3px solid var(--c-border)',
                }}>
                  "{s.nlp_query}"
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 'var(--sp-3)', borderTop: '1px solid var(--c-border)' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-faint)' }}>
                  {s.last_refresh_at ? `Diperbarui ${formatDate(s.last_refresh_at)}` : `Dibuat ${formatDate(s.created_at)}`}
                </span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {s._count.campaigns > 0 && (
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)' }}>
                      {s._count.campaigns} broadcast
                    </span>
                  )}
                  <Link
                    href={`/${params.slug}/segmen/${s.id}`}
                    style={{
                      fontSize: 'var(--font-size-xs)', fontWeight: 600,
                      color: 'var(--c-text-muted)', textDecoration: 'none',
                      padding: '4px 10px', borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--c-border)',
                    }}
                  >
                    Detail
                  </Link>
                  <Link
                    href={`/${params.slug}/broadcast/buat?segmenId=${s.id}`}
                    style={{
                      fontSize: 'var(--font-size-xs)', fontWeight: 600,
                      color: 'var(--c-secondary)', textDecoration: 'none',
                      padding: '4px 10px', borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--c-secondary)',
                    }}
                  >
                    Buat Broadcast
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
