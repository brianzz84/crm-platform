import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'

export const metadata: Metadata = { title: 'Dashboard' }

// ─── sub-components ────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  badge?: { text: string; color: string }
  accentColor?: string
  href?: string
}

function StatCard({ label, value, sub, badge, accentColor = 'var(--c-secondary)', href }: StatCardProps) {
  const inner = (
    <div style={{
      background: 'var(--c-surface)',
      borderRadius: 'var(--r-lg)',
      border: '1px solid var(--c-border)',
      borderTop: `3px solid ${accentColor}`,
      padding: 'var(--sp-5)',
      boxShadow: 'var(--shadow-sm)',
      height: '100%',
    }}>
      <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', fontWeight: 500, marginBottom: 'var(--sp-2)' }}>
        {label}
      </div>
      <div style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, color: 'var(--c-primary)', lineHeight: 1, marginBottom: 'var(--sp-1)' }}>
        {value}
      </div>
      <div style={{ marginTop: 'var(--sp-1)' }}>
        {sub && <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', marginBottom: badge ? 6 : 0 }}>{sub}</div>}
        {badge && (
          <span style={{
            display: 'inline-block',
            fontSize: 11, fontWeight: 700, padding: '2px 9px',
            borderRadius: 99, background: badge.color + '22', color: badge.color,
          }}>
            {badge.text}
          </span>
        )}
      </div>
    </div>
  )

  if (href) {
    return <a href={href} style={{ display: 'block', textDecoration: 'none' }}>{inner}</a>
  }
  return inner
}

function EmptyRow({ text }: { text: string }) {
  return (
    <tr>
      <td colSpan={99} style={{ padding: 'var(--sp-5)', textAlign: 'center', color: 'var(--c-text-faint)', fontSize: 'var(--font-size-sm)' }}>
        {text}
      </td>
    </tr>
  )
}

// ─── Status badge helpers ───────────────────────────────────────────────────

const CAMPAIGN_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  DRAFT:     { label: 'Draft',     color: '#94A3B8' },
  SCHEDULED: { label: 'Terjadwal', color: '#F59E0B' },
  RUNNING:   { label: 'Berjalan',  color: '#22C55E' },
  DONE:      { label: 'Selesai',   color: '#64748B' },
  FAILED:    { label: 'Gagal',     color: '#EF4444' },
}

const CONV_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  OPEN:     { label: 'Terbuka',   color: '#3B82F6' },
  PENDING:  { label: 'Menunggu',  color: '#F59E0B' },
  RESOLVED: { label: 'Selesai',   color: '#64748B' },
}

function StatusBadge({ status, map }: { status: string; map: Record<string, { label: string; color: string }> }) {
  const s = map[status] ?? { label: status, color: '#94A3B8' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 700,
      padding: '2px 8px', borderRadius: 99,
      background: s.color + '22', color: s.color,
    }}>
      {s.label}
    </span>
  )
}

function formatTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'baru saja'
  if (mins < 60) return `${mins} mnt lalu`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} jam lalu`
  const days = Math.floor(hours / 24)
  return `${days} hari lalu`
}

function pct(a: number, b: number): string {
  if (!b) return '—'
  return (a / b * 100).toFixed(1) + '%'
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function DashboardPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')

  const slug = params.slug
  const canViewAll = canDo(session.roles, 'viewAllInbox')

  let db: Awaited<ReturnType<typeof getTenantDb>> | null = null
  try { db = await getTenantDb(slug) } catch { /* DB belum diinisialisasi */ }

  // ── Queries paralel ──────────────────────────────────────────────────────

  const [totalPasien, pasienBaru30d, totalSegmen, campaignAktif,
         inboxTerbuka, inboxUnassigned, campaignTerbaru, percakapanBelumDitangani] =
    db
      ? await Promise.all([
          // 1. Total pasien
          db.person.count({ where: { tenant_slug: slug } }),

          // 2. Pasien baru 30 hari
          db.person.count({
            where: { tenant_slug: slug, created_at: { gte: new Date(Date.now() - 30 * 86400000) } },
          }),

          // 3. Total segmen aktif
          db.segment.count({ where: { tenant_slug: slug } }),

          // 4. Campaign berjalan/terjadwal
          db.campaign.count({ where: { tenant_slug: slug, status: { in: ['RUNNING', 'SCHEDULED'] } } }),

          // 5. Inbox terbuka
          db.conversation.count({
            where: {
              tenant_slug: slug,
              status: { in: ['OPEN', 'PENDING'] },
              ...(canViewAll ? {} : { assigned_to: session.userId }),
            },
          }),

          // 6. Inbox belum di-assign (hanya untuk yang bisa lihat semua)
          canViewAll
            ? db.conversation.count({ where: { tenant_slug: slug, status: { in: ['OPEN', 'PENDING'] }, assigned_to: null } })
            : 0,

          // 7. Campaign terbaru (5)
          db.campaign.findMany({
            where:   { tenant_slug: slug },
            orderBy: { created_at: 'desc' },
            take:    5,
            select: {
              id: true, nama: true, status: true, channel: true,
              total_penerima: true, total_terkirim: true, total_dibaca: true, total_dibalas: true,
              jadwal_kirim: true, created_at: true,
            },
          }),

          // 8. Percakapan belum ditangani (5 terlama)
          db.conversation.findMany({
            where: {
              tenant_slug: slug,
              status: { in: ['OPEN', 'PENDING'] },
              ...(canViewAll ? {} : { assigned_to: session.userId }),
            },
            orderBy: { last_message_at: 'asc' },
            take:    5,
            select: {
              id: true, status: true, channel: true, assigned_to: true,
              last_message_at: true, unread_count: true,
              person: { select: { name: true, no_hp: true } },
              assigned_user: { select: { name: true } },
            },
          }),
        ])
      : [0, 0, 0, 0, 0, 0, [], []]

  const thStyle: React.CSSProperties = {
    padding: '10px var(--sp-4)',
    fontSize: 'var(--font-size-xs)', fontWeight: 700,
    color: 'var(--c-text-muted)', textAlign: 'left',
    borderBottom: '2px solid var(--c-border)',
    whiteSpace: 'nowrap',
  }
  const tdStyle: React.CSSProperties = {
    padding: '10px var(--sp-4)',
    fontSize: 'var(--font-size-sm)', color: 'var(--c-text)',
    borderBottom: '1px solid var(--c-border)',
    verticalAlign: 'middle',
  }
  const tableStyle: React.CSSProperties = {
    width: '100%', borderCollapse: 'collapse',
  }

  return (
    <div className="dashboard-page" style={{ padding: 'var(--sp-6)', flex: 1 }}>

      {/* Header */}
      <div style={{ marginBottom: 'var(--sp-5)' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
          Dashboard
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
          Selamat datang, <strong>{session.name}</strong>
          {!db && <span style={{ color: '#EF4444', marginLeft: 8 }}>⚠ Database belum terhubung</span>}
        </p>
      </div>

      {/* Stat cards */}
      <div className="dashboard-stat-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 'var(--sp-4)',
        marginBottom: 'var(--sp-6)',
      }}>
        <StatCard
          label="Total Pasien Tersync"
          value={(totalPasien as number).toLocaleString('id-ID')}
          sub="dari SIMRS"
          badge={pasienBaru30d ? { text: `+${pasienBaru30d} (30 hari)`, color: '#22C55E' } : undefined}
          accentColor="var(--c-primary)"
          href={`/${slug}/pasien`}
        />
        <StatCard
          label="Segmen Pasien"
          value={totalSegmen as number}
          sub="kelompok tersimpan"
          accentColor="#8B5CF6"
          href={`/${slug}/segmen`}
        />
        <StatCard
          label="Campaign Aktif"
          value={campaignAktif as number}
          sub="berjalan / terjadwal"
          accentColor="var(--c-secondary)"
          href={`/${slug}/broadcast`}
        />
        <StatCard
          label={canViewAll ? 'Inbox Terbuka' : 'Inbox Saya'}
          value={inboxTerbuka as number}
          sub={canViewAll && (inboxUnassigned as number) > 0 ? `${inboxUnassigned} belum di-assign` : 'percakapan aktif'}
          badge={canViewAll && (inboxUnassigned as number) > 0
            ? { text: `${inboxUnassigned} unassigned`, color: '#EF4444' }
            : undefined}
          accentColor="var(--c-accent)"
          href={`/${slug}/inbox`}
        />
      </div>

      {/* Aksi cepat */}
      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--c-text-faint)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 'var(--sp-3)' }}>
          Aksi Cepat
        </div>
        <div className="dashboard-quick-actions" style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          {[
            { href: `/${slug}/segmen/baru`, label: '🎯 Buat Segmen', show: canDo(session.roles, 'manageSegments') },
            { href: `/${slug}/broadcast/buat`, label: '📢 Buat Broadcast', show: canDo(session.roles, 'manageBroadcast') },
            { href: `/${slug}/inbox`, label: '💬 Buka Inbox', show: canDo(session.roles, 'replyChat') },
            { href: `/${slug}/pasien`, label: '👥 Data Pasien', show: canDo(session.roles, 'viewPatients') },
          ].filter(a => a.show).map(action => (
            <a
              key={action.href}
              href={action.href}
              style={{
                padding: '9px var(--sp-4)',
                borderRadius: 'var(--r-md)',
                background: 'var(--c-surface)',
                border: '1.5px solid var(--c-border)',
                fontSize: 'var(--font-size-sm)', fontWeight: 600,
                color: 'var(--c-text)',
                display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)',
                boxShadow: 'var(--shadow-xs)',
                textDecoration: 'none',
              }}
            >
              {action.label}
            </a>
          ))}
        </div>
      </div>

      {/* Dua kolom: Campaign terbaru + Inbox belum ditangani */}
      <div className="dashboard-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-6)' }}>

        {/* Campaign terbaru */}
        <div style={{ background: 'var(--c-surface)', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700, color: 'var(--c-primary)', fontSize: 'var(--font-size-md)' }}>
              Campaign Terbaru
            </div>
            <a href={`/${slug}/broadcast`} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-secondary)', textDecoration: 'none', fontWeight: 600 }}>
              Lihat semua →
            </a>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="mobile-card-table" style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Nama</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Terkirim</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Dibaca</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Dibalas</th>
                </tr>
              </thead>
              <tbody>
                {(campaignTerbaru as any[]).length === 0
                  ? <EmptyRow text="Belum ada campaign" />
                  : (campaignTerbaru as any[]).map(c => (
                    <tr key={c.id}>
                      <td style={tdStyle}>
                        <a href={`/${slug}/broadcast/${c.id}`} style={{ color: 'var(--c-text)', textDecoration: 'none', fontWeight: 600 }}>
                          {c.nama}
                        </a>
                        <div style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>
                          {c.total_penerima.toLocaleString('id-ID')} penerima
                        </div>
                      </td>
                      <td style={tdStyle} data-label="Status">
                        <StatusBadge status={c.status} map={CAMPAIGN_STATUS_LABEL} />
                      </td>
                      <td className="td-right" style={{ ...tdStyle, textAlign: 'right' }} data-label="Terkirim">
                        <span style={{ fontWeight: 600 }}>{pct(c.total_terkirim, c.total_penerima)}</span>
                        <span style={{ fontSize: 11, color: 'var(--c-text-faint)', marginLeft: 4 }}>{c.total_terkirim.toLocaleString('id-ID')}</span>
                      </td>
                      <td className="td-right" style={{ ...tdStyle, textAlign: 'right' }} data-label="Dibaca">
                        <span style={{ fontWeight: 600 }}>{pct(c.total_dibaca, c.total_penerima)}</span>
                      </td>
                      <td className="td-right" style={{ ...tdStyle, textAlign: 'right' }} data-label="Dibalas">
                        <span style={{ fontWeight: 600 }}>{pct(c.total_dibalas, c.total_penerima)}</span>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* Inbox belum ditangani */}
        <div style={{ background: 'var(--c-surface)', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700, color: 'var(--c-primary)', fontSize: 'var(--font-size-md)' }}>
              {canViewAll ? 'Inbox Belum Ditangani' : 'Inbox Saya'}
            </div>
            <a href={`/${slug}/inbox`} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-secondary)', textDecoration: 'none', fontWeight: 600 }}>
              Buka inbox →
            </a>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="mobile-card-table" style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Pasien</th>
                  <th style={thStyle}>Status</th>
                  {canViewAll && <th style={thStyle}>Agen</th>}
                  <th style={{ ...thStyle, textAlign: 'right' }}>Terakhir</th>
                </tr>
              </thead>
              <tbody>
                {(percakapanBelumDitangani as any[]).length === 0
                  ? <EmptyRow text="Tidak ada percakapan aktif" />
                  : (percakapanBelumDitangani as any[]).map(c => (
                    <tr key={c.id}>
                      <td style={tdStyle}>
                        <a href={`/${slug}/inbox?id=${c.id}`} style={{ color: 'var(--c-text)', textDecoration: 'none', fontWeight: 600 }}>
                          {c.person?.name || c.channel_user_id || 'Tidak dikenal'}
                        </a>
                        <div style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>
                          {c.channel}
                          {c.unread_count > 0 && (
                            <span style={{ marginLeft: 6, fontWeight: 700, color: '#EF4444' }}>
                              {c.unread_count} belum dibaca
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={tdStyle} data-label="Status">
                        <StatusBadge status={c.status} map={CONV_STATUS_LABEL} />
                      </td>
                      {canViewAll && (
                        <td style={tdStyle} data-label="Agen">
                          {c.assigned_user
                            ? <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)' }}>{c.assigned_user.name}</span>
                            : <span style={{ fontSize: 'var(--font-size-xs)', color: '#EF4444', fontWeight: 600 }}>Unassigned</span>
                          }
                        </td>
                      )}
                      <td className="td-right" style={{ ...tdStyle, textAlign: 'right', fontSize: 'var(--font-size-xs)', color: 'var(--c-text-faint)' }} data-label="Terakhir">
                        {formatTime(new Date(c.last_message_at))}
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
