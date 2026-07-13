import { Metadata } from 'next'
import Link from 'next/link'
import { getTenantDb } from '@/lib/tenant'
import { notFound } from 'next/navigation'
import CampaignActions from './CampaignActions'
import CampaignAutoRefresh from './CampaignAutoRefresh'

interface Props { params: { slug: string; id: string } }

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:     { label: 'Draft',     color: '#6B7B8D', bg: '#F1F3F6' },
  SCHEDULED: { label: 'Terjadwal', color: '#7B5EA7', bg: '#F3EEF9' },
  RUNNING:   { label: 'Berjalan',  color: '#9A6C00', bg: '#FDF3DC' },
  DONE:      { label: 'Selesai',   color: '#278B58', bg: '#E8F5E9' },
  FAILED:    { label: 'Gagal',     color: '#C0392B', bg: '#FDECEA' },
}
const MSG_STATUS_CFG: Record<string, { label: string; color: string }> = {
  PENDING:   { label: 'Antrian',  color: '#6B7B8D' },
  SENT:      { label: 'Terkirim', color: '#0089A8' },
  DELIVERED: { label: 'Diterima', color: '#7B5EA7' },
  READ:      { label: 'Dibaca',   color: '#278B58' },
  REPLIED:   { label: 'Dibalas',  color: '#E8A800' },
  FAILED:    { label: 'Gagal',    color: '#C0392B' },
}
const CH_ICON: Record<string, string> = { WA: '📱', IG: '📸', FB: '📘' }

function fmtDate(d: Date) { return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) }
function fmtDateTime(d: Date) { return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }

function pct(num: number, den: number) {
  if (!den) return '—'
  return Math.round((num / den) * 100) + '%'
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const db = await getTenantDb(params.slug)
    const c  = await db.campaign.findFirst({ where: { id: params.id, tenant_slug: params.slug }, select: { nama: true } })
    return { title: c?.nama ?? 'Detail Campaign' }
  } catch { return { title: 'Detail Campaign' } }
}

export default async function CampaignDetailPage({ params }: Props) {
  let db
  try { db = await getTenantDb(params.slug) } catch { notFound() }

  const campaign = await db.campaign.findFirst({
    where: { id: params.id, tenant_slug: params.slug },
    include: {
      template: { select: { nama: true, template_name: true } },
      segment:  { select: { id: true, nama: true } },
      creator:  { select: { name: true } },
      recipients: {
        take: 100, orderBy: { sent_at: 'desc' },
        select: {
          id: true, no_hp: true, nama: true, status: true,
          sent_at: true, delivered_at: true, read_at: true,
          replied_at: true, error_code: true, error_detail: true,
        },
      },
    },
  })
  if (!campaign) notFound()

  const sc = STATUS_CFG[campaign.status] ?? STATUS_CFG.DRAFT

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1 }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', marginBottom: 'var(--sp-5)' }}>
        <Link href={`/${params.slug}/broadcast`} style={{ color: 'var(--c-secondary)' }}>Broadcast</Link>
        <span>›</span>
        <span style={{ color: 'var(--c-text)' }}>{campaign.nama}</span>
      </div>

      {/* Header */}
      <div style={{
        background: 'white', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)',
        padding: 'var(--sp-6)', marginBottom: 'var(--sp-5)', boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--sp-4)', marginBottom: 'var(--sp-5)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 22 }}>{CH_ICON[campaign.channel] ?? '📢'}</span>
              <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--c-primary)', margin: 0 }}>{campaign.nama}</h1>
              <span style={{ padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700, color: sc.color, background: sc.bg }}>{sc.label}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--c-text-muted)', display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
              {campaign.segment  && <span>Segmen: <strong>{campaign.segment.nama}</strong></span>}
              {campaign.template && <span>Template: <strong>{campaign.template.nama}</strong></span>}
              {campaign.jadwal_kirim
                ? <span>Jadwal: <strong>{fmtDateTime(campaign.jadwal_kirim)}</strong></span>
                : <span style={{ color: 'var(--c-text-faint)' }}>Tidak terjadwal</span>}
              {'creator' in campaign && <span>Oleh: {(campaign as any).creator?.name}</span>}
              <span>Dibuat: {fmtDate(campaign.created_at)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <CampaignActions slug={params.slug} campaignId={campaign.id} status={campaign.status} />
            <CampaignAutoRefresh status={campaign.status} />
          </div>
        </div>

        {/* Stats row */}
        {campaign.total_penerima > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 'var(--sp-3)' }}>
            {[
              { label: 'Penerima',  val: campaign.total_penerima, sub: null,                                     color: 'var(--c-primary)' },
              { label: 'Terkirim',  val: campaign.total_terkirim, sub: pct(campaign.total_terkirim, campaign.total_penerima), color: 'var(--c-secondary)' },
              { label: 'Diterima',  val: campaign.total_diterima, sub: pct(campaign.total_diterima, campaign.total_terkirim), color: '#7B5EA7' },
              { label: 'Dibaca',    val: campaign.total_dibaca,   sub: pct(campaign.total_dibaca,   campaign.total_terkirim), color: '#278B58' },
              { label: 'Dibalas',   val: campaign.total_dibalas,  sub: pct(campaign.total_dibalas,  campaign.total_terkirim), color: '#E8A800' },
              { label: 'Gagal',     val: (campaign as any).total_gagal || 0, sub: pct((campaign as any).total_gagal || 0, campaign.total_penerima), color: '#EF4444' },
            ].map(s => (
              <div key={s.label} style={{
                background: 'var(--c-bg)', borderRadius: 'var(--r-md)',
                padding: 'var(--sp-4)', textAlign: 'center',
              }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.val.toLocaleString('id-ID')}</div>
                {s.sub && <div style={{ fontSize: 12, color: s.color, fontWeight: 600 }}>{s.sub}</div>}
                <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Template Info */}
      {campaign.template && (
        <div style={{
          background: 'white', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)',
          padding: 'var(--sp-5)', marginBottom: 'var(--sp-5)', boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--sp-3)' }}>
            Template Pesan
            <span style={{ marginLeft: 8, color: 'var(--c-secondary)', fontWeight: 400, textTransform: 'none', fontFamily: 'monospace' }}>
              {campaign.template.template_name}
            </span>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--c-text)', whiteSpace: 'pre-wrap', background: 'var(--c-bg)', padding: 'var(--sp-4)', borderRadius: 'var(--r-md)' }}>
            {(campaign.template as any).preview_text || '(tidak ada preview)'}
          </div>
        </div>
      )}

      {/* Recipients table */}
      {campaign.recipients.length > 0 && (
        <div style={{ background: 'white', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-primary)' }}>Daftar Penerima</div>
            <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>Menampilkan {campaign.recipients.length} dari {campaign.total_penerima}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
              <thead>
                <tr>
                  {['Nama', 'No HP', 'Status', 'Dikirim', 'Dibaca', 'Dibalas', 'Error'].map(h => (
                    <th key={h} style={{
                      padding: '8px 16px', textAlign: 'left', background: 'var(--c-bg)',
                      fontSize: 11, fontWeight: 700, color: 'var(--c-text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.5px',
                      borderBottom: '2px solid var(--c-border)', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaign.recipients.map(r => {
                  const ms = MSG_STATUS_CFG[r.status] ?? { label: r.status, color: '#6B7B8D' }
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--c-border)' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--c-text)' }}>
                        {(r as any).nama || '—'}
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--c-text-muted)', fontSize: 12 }}>{r.no_hp}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ padding: '3px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: ms.color + '18', color: ms.color }}>
                          {ms.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--c-text-muted)', whiteSpace: 'nowrap' }}>
                        {r.sent_at ? fmtDateTime(r.sent_at) : '—'}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--c-text-muted)', whiteSpace: 'nowrap' }}>
                        {r.read_at ? fmtDateTime(r.read_at) : '—'}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--c-text-muted)', whiteSpace: 'nowrap' }}>
                        {r.replied_at ? fmtDateTime(r.replied_at) : '—'}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 11 }}>
                        {(r as any).error_code
                          ? <span style={{ color: '#EF4444' }}>{(r as any).error_code}: {(r as any).error_detail || ''}</span>
                          : <span style={{ color: 'var(--c-text-faint)' }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
