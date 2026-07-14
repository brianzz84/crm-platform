import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import SapaanClient from './SapaanClient'

export const metadata: Metadata = { title: 'Sapaan Terjadwal' }

export default async function SapaanPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'manageSapaan')) redirect(`/${params.slug}/dashboard`)

  const db = await getTenantDb(params.slug)

  const [configs, wappinCfg, metaCfg] = await Promise.all([
    db.sapaanConfig.findMany({ where: { tenant_slug: params.slug } }),
    db.wappinConfig.findUnique({ where: { tenant_slug: params.slug } }),
    db.metaConfig.findUnique({ where: { tenant_slug: params.slug } }),
  ])

  // Statistik 30 hari terakhir per jenis
  const logStats = await db.sapaanLog.groupBy({
    by:     ['jenis', 'status'],
    where:  { tenant_slug: params.slug, sent_at: { gte: new Date(Date.now() - 30 * 86400_000) } },
    _count: { _all: true },
  })

  // Bangun map: { ULTAH: { SENT: 12, FAILED: 1 }, ... }
  const statsMap: Record<string, Record<string, number>> = {}
  for (const s of logStats) {
    if (!statsMap[s.jenis]) statsMap[s.jenis] = {}
    statsMap[s.jenis][s.status] = s._count._all
  }

  const configMap = Object.fromEntries(configs.map(c => [c.jenis, c])) as Record<string, any>

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--sp-6)', flexWrap: 'wrap', gap: 'var(--sp-4)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
            Sapaan Terjadwal
          </h1>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
            Kirim pesan WhatsApp otomatis pada momen penting pasien — ulang tahun, hari raya, dan pengingat kontrol.
          </p>
        </div>
        {!metaCfg?.aktif && (
          <a href={`/${params.slug}/pengaturan/meta`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px',
            borderRadius: 'var(--r-sm)', background: '#FEF3C7', border: '1px solid #F59E0B',
            color: '#92400E', fontSize: 'var(--font-size-sm)', fontWeight: 600, textDecoration: 'none',
          }}>
            ⚠ Konfigurasi Meta WhatsApp belum diatur
          </a>
        )}
      </div>

      <SapaanClient
        slug={params.slug}
        wappinAktif={!!wappinCfg?.aktif}
        metaAktif={!!metaCfg?.aktif}
        initialConfigs={{
          ULTAH: configMap['ULTAH'] ? {
            aktif:           configMap['ULTAH'].aktif,
            jam_kirim:       configMap['ULTAH'].jam_kirim,
            template_id:     configMap['ULTAH'].template_id,
            template_params: configMap['ULTAH'].template_params,
            filter_groups:   configMap['ULTAH'].filter_groups,
          } : null,
          HARI_RAYA: configMap['HARI_RAYA'] ? {
            aktif:     configMap['HARI_RAYA'].aktif,
            template:  configMap['HARI_RAYA'].template,
            jam_kirim: configMap['HARI_RAYA'].jam_kirim,
          } : null,
          KONTROL_REMINDER: configMap['KONTROL_REMINDER'] ? {
            aktif:     configMap['KONTROL_REMINDER'].aktif,
            template:  configMap['KONTROL_REMINDER'].template,
            jam_kirim: configMap['KONTROL_REMINDER'].jam_kirim,
          } : null,
        }}
        statsMap={statsMap}
      />
    </div>
  )
}
