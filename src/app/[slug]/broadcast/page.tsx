import { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import BroadcastClient from './BroadcastClient'

export const metadata: Metadata = { title: 'Broadcast' }

export default async function BroadcastPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'manageBroadcast')) redirect(`/${params.slug}/dashboard`)

  const db = await getTenantDb(params.slug)

  const [campaigns, wappinCfg, templates, segments] = await Promise.all([
    db.campaign.findMany({
      where:   { tenant_slug: params.slug },
      orderBy: { created_at: 'desc' },
      take:    50,
      include: {
        template: { select: { nama: true } },
        segment:  { select: { nama: true } },
        creator:  { select: { name: true } },
      },
    }),
    db.wappinConfig.findUnique({ where: { tenant_slug: params.slug } }),
    db.broadcastTemplate.findMany({ where: { tenant_slug: params.slug, aktif: true }, orderBy: { nama: 'asc' } }),
    db.segment.findMany({
      where:   { tenant_slug: params.slug },
      orderBy: { nama: 'asc' },
      select:  { id: true, nama: true, _count: { select: { segment_persons: true } } },
    }),
  ])

  return (
    <div className="broadcast-page" style={{ padding: 'var(--sp-6)', flex: 1 }}>
      <div className="broadcast-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--sp-6)', flexWrap: 'wrap', gap: 'var(--sp-4)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
            Broadcast
          </h1>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
            Kirim pesan WhatsApp massal ke segmen pasien via Wappin.
          </p>
        </div>
        {!wappinCfg?.aktif && (
          <Link href={`/${params.slug}/pengaturan/integrasi`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px',
            borderRadius: 'var(--r-sm)', background: '#FEF3C7', border: '1px solid #F59E0B',
            color: '#92400E', fontSize: 'var(--font-size-sm)', fontWeight: 600, textDecoration: 'none',
          }}>
            ⚠ Konfigurasi Wappin belum diatur
          </Link>
        )}
      </div>

      <BroadcastClient
        slug={params.slug}
        initialCampaigns={campaigns.map(c => ({
          id:             c.id,
          nama:           c.nama,
          status:         c.status,
          jadwal_kirim:   c.jadwal_kirim?.toISOString() ?? null,
          started_at:     c.started_at?.toISOString() ?? null,
          finished_at:    c.finished_at?.toISOString() ?? null,
          total_penerima: c.total_penerima,
          total_terkirim: c.total_terkirim,
          total_diterima: c.total_diterima,
          total_dibaca:   c.total_dibaca,
          total_dibalas:  c.total_dibalas,
          total_gagal:    c.total_gagal,
          template_nama:  c.template?.nama ?? null,
          segment_nama:   c.segment?.nama ?? null,
          creator_name:   c.creator.name,
          created_at:     c.created_at.toISOString(),
        }))}
        templates={templates.map(t => ({
          id: t.id, nama: t.nama,
          template_name: t.template_name,
          preview_text:  t.preview_text ?? '',
        }))}
        segments={segments.map(s => ({ id: s.id, nama: s.nama, total: s._count.segment_persons }))}
        wappinAktif={!!wappinCfg?.aktif}
      />
    </div>
  )
}
