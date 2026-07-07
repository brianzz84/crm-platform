import { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import HapusSegmenBtn from './HapusSegmenBtn'

export const metadata: Metadata = { title: 'Detail Segmen' }

const PER_PAGE = 25

function maskHp(hp: string) {
  if (hp.length <= 6) return hp
  return hp.slice(0, 4) + '****' + hp.slice(-3)
}

function formatDate(d: Date | null) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d))
}

interface SimrsParams {
  units?: string[]
  icdCodes?: string[]
  periodeAwal?: string
  periodeAkhir?: string
  poli?: string
}

function ParamChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', background: 'var(--c-bg)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', padding: '4px 12px', minWidth: 80 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text)', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

export default async function SegmenDetailPage({
  params,
  searchParams,
}: {
  params: { slug: string; segmenId: string }
  searchParams: { page?: string }
}) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'manageSegments')) redirect(`/${params.slug}/dashboard`)

  const db   = await getTenantDb(params.slug)
  const page = Math.max(1, Number(searchParams.page || 1))

  const segmen = await db.segment.findFirst({
    where:   { id: params.segmenId, tenant_slug: params.slug },
    include: { _count: { select: { segment_persons: true, campaigns: true } } },
  })

  if (!segmen) notFound()

  const [segmentPersons, totalAnggota, campaignTerkait] = await Promise.all([
    db.segmentPerson.findMany({
      where:   { segment_id: params.segmenId },
      skip:    (page - 1) * PER_PAGE,
      take:    PER_PAGE,
      orderBy: { added_at: 'desc' },
    }),
    db.segmentPerson.count({ where: { segment_id: params.segmenId } }),
    db.campaign.findMany({
      where:   { segment_id: params.segmenId, tenant_slug: params.slug },
      orderBy: { created_at: 'desc' },
      take:    5,
      select:  { id: true, nama: true, status: true, total_penerima: true, total_terkirim: true, created_at: true },
    }),
  ])

  const personIds  = segmentPersons.map(sp => sp.person_id)
  const personData = personIds.length
    ? await db.person.findMany({
        where:  { id: { in: personIds } },
        select: { id: true, name: true, no_hp: true, no_rm: true, last_simrs_sync_at: true },
      })
    : []

  const personMap = new Map(personData.map(p => [p.id, p]))
  const totalPages = Math.ceil(totalAnggota / PER_PAGE)

  const simrsParams = segmen.simrs_params as SimrsParams | null

  const CAMPAIGN_STATUS: Record<string, { label: string; color: string }> = {
    DRAFT:     { label: 'Draft',     color: '#94A3B8' },
    SCHEDULED: { label: 'Terjadwal', color: '#F59E0B' },
    RUNNING:   { label: 'Berjalan',  color: '#22C55E' },
    DONE:      { label: 'Selesai',   color: '#64748B' },
    FAILED:    { label: 'Gagal',     color: '#EF4444' },
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--c-surface)',
    border: '1px solid var(--c-border)',
    borderRadius: 'var(--r-lg)',
    boxShadow: 'var(--shadow-sm)',
    overflow: 'hidden',
  }

  const thStyle: React.CSSProperties = {
    padding: '10px var(--sp-4)',
    fontSize: 'var(--font-size-xs)', fontWeight: 700,
    color: 'var(--c-text-muted)', textAlign: 'left',
    borderBottom: '2px solid var(--c-border)',
    whiteSpace: 'nowrap', background: 'var(--c-bg)',
  }

  const tdStyle: React.CSSProperties = {
    padding: '10px var(--sp-4)',
    fontSize: 'var(--font-size-sm)',
    borderBottom: '1px solid var(--c-border)',
    verticalAlign: 'middle',
    color: 'var(--c-text)',
  }

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1, maxWidth: 1100 }}>

      {/* Breadcrumb */}
      <div style={{ marginBottom: 'var(--sp-4)', fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
        <Link href={`/${params.slug}/segmen`} style={{ color: 'var(--c-secondary)', textDecoration: 'none', fontWeight: 600 }}>
          Segmentasi
        </Link>
        {' / '}
        <span>{segmen.nama}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--sp-4)', marginBottom: 'var(--sp-6)', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 6 }}>
            {segmen.nama}
          </h1>
          {segmen.deskripsi && (
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', maxWidth: 600 }}>
              {segmen.deskripsi}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', flexShrink: 0, flexWrap: 'wrap' }}>
          <Link
            href={`/${params.slug}/broadcast/buat?segmenId=${segmen.id}`}
            style={{
              padding: '9px 18px', borderRadius: 'var(--r-md)',
              background: 'var(--c-secondary)', color: 'white',
              fontWeight: 600, fontSize: 'var(--font-size-sm)', textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            📢 Buat Broadcast
          </Link>
          <HapusSegmenBtn slug={params.slug} segmenId={params.segmenId} nama={segmen.nama} />
        </div>
      </div>

      {/* Stat chips */}
      <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap', marginBottom: 'var(--sp-6)' }}>
        <div style={{ display: 'inline-flex', flexDirection: 'column', background: 'var(--c-primary-xlight)', border: '1px solid var(--c-primary)', borderRadius: 'var(--r-sm)', padding: '6px 16px' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Anggota</span>
          <span style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--c-primary)' }}>{totalAnggota.toLocaleString('id-ID')}</span>
        </div>
        <div style={{ display: 'inline-flex', flexDirection: 'column', background: 'var(--c-bg)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', padding: '6px 16px' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Campaign</span>
          <span style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--c-text)' }}>{segmen._count.campaigns}</span>
        </div>
        <div style={{ display: 'inline-flex', flexDirection: 'column', background: 'var(--c-bg)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', padding: '6px 16px' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Diperbarui</span>
          <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--c-text)' }}>{formatDate(segmen.last_refresh_at)}</span>
        </div>
        <div style={{ display: 'inline-flex', flexDirection: 'column', background: 'var(--c-bg)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', padding: '6px 16px' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dibuat</span>
          <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--c-text)' }}>{formatDate(segmen.created_at)}</span>
        </div>
      </div>

      {/* Baris 1: Parameter NLP (jika ada) */}
      {(segmen.nlp_query || simrsParams) && (
        <div style={{ ...cardStyle, marginBottom: 'var(--sp-5)', padding: 'var(--sp-5)' }}>
          <div style={{ fontWeight: 700, color: 'var(--c-primary)', marginBottom: 'var(--sp-4)', fontSize: 'var(--font-size-md)' }}>
            Parameter Segmen
          </div>

          {segmen.nlp_query && (
            <div style={{ marginBottom: 'var(--sp-4)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--c-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Query NLP
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', fontStyle: 'italic', background: 'var(--c-bg)', padding: '8px 12px', borderRadius: 'var(--r-sm)', borderLeft: '3px solid var(--c-secondary)' }}>
                "{segmen.nlp_query}"
              </div>
            </div>
          )}

          {simrsParams && (
            <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
              {simrsParams.units && simrsParams.units.length > 0 && (
                <ParamChip label="Unit" value={simrsParams.units.join(', ')} />
              )}
              {simrsParams.icdCodes && simrsParams.icdCodes.length > 0 && (
                <ParamChip label="Kode ICD" value={simrsParams.icdCodes.join(', ')} />
              )}
              {simrsParams.periodeAwal && (
                <ParamChip label="Dari" value={simrsParams.periodeAwal} />
              )}
              {simrsParams.periodeAkhir && (
                <ParamChip label="Sampai" value={simrsParams.periodeAkhir} />
              )}
              {simrsParams.poli && (
                <ParamChip label="Poli" value={simrsParams.poli} />
              )}
            </div>
          )}
        </div>
      )}

      {/* Baris 2: Dua kolom — Anggota + Campaign terkait */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 'var(--sp-5)', alignItems: 'start' }}>

        {/* Tabel anggota */}
        <div style={cardStyle}>
          <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700, color: 'var(--c-primary)', fontSize: 'var(--font-size-md)' }}>
              Anggota Segmen
            </div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)' }}>
              {totalAnggota} total • halaman {page} dari {totalPages || 1}
            </div>
          </div>

          {totalAnggota === 0 ? (
            <div style={{ padding: 'var(--sp-10)', textAlign: 'center', color: 'var(--c-text-faint)', fontSize: 'var(--font-size-sm)' }}>
              Tidak ada anggota dalam segmen ini.
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>Nama</th>
                      <th style={thStyle}>No. HP</th>
                      <th style={thStyle}>No. RM</th>
                      <th style={thStyle}>Sync Terakhir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {segmentPersons.map((sp, i) => {
                      const p = personMap.get(sp.person_id)
                      if (!p) return null
                      return (
                        <tr key={sp.person_id}>
                          <td style={{ ...tdStyle, color: 'var(--c-text-faint)', width: 40 }}>
                            {(page - 1) * PER_PAGE + i + 1}
                          </td>
                          <td style={tdStyle}>
                            <Link
                              href={`/${params.slug}/pasien?search=${encodeURIComponent(p.no_hp ?? '')}`}
                              style={{ color: 'var(--c-text)', textDecoration: 'none', fontWeight: 600 }}
                            >
                              {p.name}
                            </Link>
                          </td>
                          <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12, color: 'var(--c-text-muted)' }}>
                            {maskHp(p.no_hp ?? '')}
                          </td>
                          <td style={{ ...tdStyle, fontSize: 12, color: 'var(--c-text-muted)' }}>
                            {p.no_rm || '—'}
                          </td>
                          <td style={{ ...tdStyle, fontSize: 12, color: 'var(--c-text-faint)' }}>
                            {formatDate(p.last_simrs_sync_at)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ padding: 'var(--sp-3) var(--sp-5)', borderTop: '1px solid var(--c-border)', display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {page > 1 && (
                    <Link
                      href={`/${params.slug}/segmen/${params.segmenId}?page=${page - 1}`}
                      style={{ padding: '4px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)', fontSize: 'var(--font-size-sm)', color: 'var(--c-text)', textDecoration: 'none' }}
                    >
                      ← Prev
                    </Link>
                  )}
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    const p2 = i + 1
                    return (
                      <Link
                        key={p2}
                        href={`/${params.slug}/segmen/${params.segmenId}?page=${p2}`}
                        style={{
                          padding: '4px 12px', borderRadius: 'var(--r-sm)',
                          border: '1px solid ' + (p2 === page ? 'var(--c-secondary)' : 'var(--c-border)'),
                          background: p2 === page ? 'var(--c-secondary)' : 'transparent',
                          color: p2 === page ? 'white' : 'var(--c-text)',
                          fontSize: 'var(--font-size-sm)', textDecoration: 'none', fontWeight: p2 === page ? 700 : 400,
                        }}
                      >
                        {p2}
                      </Link>
                    )
                  })}
                  {page < totalPages && (
                    <Link
                      href={`/${params.slug}/segmen/${params.segmenId}?page=${page + 1}`}
                      style={{ padding: '4px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)', fontSize: 'var(--font-size-sm)', color: 'var(--c-text)', textDecoration: 'none' }}
                    >
                      Next →
                    </Link>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Campaign terkait */}
        <div style={cardStyle}>
          <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)' }}>
            <div style={{ fontWeight: 700, color: 'var(--c-primary)', fontSize: 'var(--font-size-md)' }}>
              Campaign Terkait
            </div>
          </div>

          {campaignTerkait.length === 0 ? (
            <div style={{ padding: 'var(--sp-6)', textAlign: 'center', color: 'var(--c-text-faint)', fontSize: 'var(--font-size-sm)' }}>
              Belum ada campaign menggunakan segmen ini.
            </div>
          ) : (
            <div>
              {campaignTerkait.map((c, i) => {
                const s = CAMPAIGN_STATUS[c.status] ?? { label: c.status, color: '#94A3B8' }
                const pct = c.total_penerima
                  ? Math.round(c.total_terkirim / c.total_penerima * 100)
                  : 0

                return (
                  <div
                    key={c.id}
                    style={{
                      padding: 'var(--sp-4) var(--sp-5)',
                      borderBottom: i < campaignTerkait.length - 1 ? '1px solid var(--c-border)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <Link
                        href={`/${params.slug}/broadcast/${c.id}`}
                        style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--c-text)', textDecoration: 'none' }}
                      >
                        {c.nama}
                      </Link>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: s.color + '22', color: s.color, whiteSpace: 'nowrap', marginLeft: 8 }}>
                        {s.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>
                      {c.total_penerima.toLocaleString('id-ID')} penerima
                      {c.total_terkirim > 0 && ` • ${pct}% terkirim`}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 2 }}>
                      {formatDate(c.created_at)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {segmen._count.campaigns > 5 && (
            <div style={{ padding: 'var(--sp-3) var(--sp-5)', borderTop: '1px solid var(--c-border)', textAlign: 'center' }}>
              <Link href={`/${params.slug}/broadcast`} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-secondary)', textDecoration: 'none', fontWeight: 600 }}>
                Lihat semua {segmen._count.campaigns} campaign →
              </Link>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
