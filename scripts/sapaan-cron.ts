/**
 * Sapaan Cron — dipicu Railway Cron Schedule setiap jam (bukan proses persisten).
 * Cek semua tenant aktif; kalau jam_kirim SapaanConfig(ULTAH) == jam sekarang (WIB),
 * kirim ucapan ulang tahun via Meta Cloud API ke pasien yang lolos filter, lalu keluar.
 *
 * Jalankan manual: npx tsx --tsconfig tsconfig.json scripts/sapaan-cron.ts
 */

import { getTenantDb, masterDb } from '@/lib/tenant'
import { sendMetaTemplateMessage } from '@/lib/meta-client'
import { resolveTemplateField, type PersonForTemplate } from '@/lib/template-fields'
import { filterPersonsBySapaanRules, type FilterGroup } from '@/lib/sapaan-filter'

function buildComponents(template: any, person: PersonForTemplate, staticParams: Record<string, string>) {
  return (template.components_schema || []).map((comp: any) => ({
    type:       comp.type,
    sub_type:   comp.sub_type,
    index:      comp.index,
    parameters: (comp.parameters || []).map((p: any) => {
      const text = p.source === 'field' && p.field
        ? (resolveTemplateField(person, p.field) || p.example || '')
        : (staticParams[p.param_key] ?? p.example ?? '')
      return { type: 'text', text }
    }),
  }))
}

async function processTenantUltah(slug: string, cfg: any) {
  const db  = await getTenantDb(slug)
  const now = new Date()
  const todayMd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  if (!cfg.template_id) {
    console.log(`[${slug}] ULTAH aktif tapi template belum dipilih — skip`)
    return
  }
  const template = await db.broadcastTemplate.findFirst({
    where: { id: cfg.template_id, tenant_slug: slug, aktif: true, meta_status: 'APPROVED' },
  })
  if (!template) {
    console.log(`[${slug}] Template ULTAH tidak ditemukan/belum approved — skip`)
    return
  }

  const metaCfg = await db.metaConfig.findUnique({ where: { tenant_slug: slug } })
  if (!metaCfg?.aktif) {
    console.log(`[${slug}] Meta belum aktif — skip`)
    return
  }

  const persons = await db.person.findMany({
    where:   { tenant_slug: slug, aktif: true, tanggal_lahir: { not: null } },
    include: { contacts: { where: { is_wa_aktif: true, is_primary: true } } },
  })
  const bornToday = persons.filter((p: any) => {
    if (p.contacts.length === 0 && !p.no_hp) return false
    const d  = new Date(p.tanggal_lahir)
    const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return md === todayMd
  })
  if (bornToday.length === 0) {
    console.log(`[${slug}] Tidak ada yang ulang tahun hari ini`)
    return
  }

  const filterGroups = (cfg.filter_groups as FilterGroup[] | null) ?? null
  const lolosIds = await filterPersonsBySapaanRules(db, bornToday.map((p: any) => p.id), filterGroups)
  const targets  = bornToday.filter((p: any) => lolosIds.has(p.id))
  console.log(`[${slug}] ${bornToday.length} lahir hari ini, ${targets.length} lolos filter`)

  const staticParams = (cfg.template_params as Record<string, string> | null) ?? {}
  const startOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  for (const p of targets) {
    const already = await db.sapaanLog.findFirst({
      where: { tenant_slug: slug, person_id: p.id, jenis: 'ULTAH', sent_at: { gte: startOfDay } },
    })
    if (already) continue

    const noHp = p.no_hp ?? p.contacts[0]?.nilai
    if (!noHp) continue

    const personForTemplate: PersonForTemplate = {
      name: p.name, no_rm: p.no_rm, no_hp: noHp, agama: p.agama,
      jenis_pembayaran: p.jenis_pembayaran, nama_instansi: p.nama_instansi, no_bpjs: p.no_bpjs,
    }
    const components = buildComponents(template, personForTemplate, staticParams)

    try {
      const msgId = await sendMetaTemplateMessage(
        { phone_number_id: metaCfg.phone_number_id, access_token: metaCfg.access_token },
        noHp, template.template_name, template.template_language || 'id', components,
      )
      await db.sapaanLog.create({
        data: {
          tenant_slug: slug, person_id: p.id, jenis: 'ULTAH',
          status: msgId ? 'SENT' : 'FAILED', message_id: msgId ?? undefined, sent_at: now,
        },
      })
    } catch (e: any) {
      await db.sapaanLog.create({
        data: {
          tenant_slug: slug, person_id: p.id, jenis: 'ULTAH',
          status: 'FAILED', error_msg: String(e?.message || e).slice(0, 300), sent_at: now,
        },
      })
    }

    await new Promise(r => setTimeout(r, 250)) // jeda ringan antar pesan
  }

  console.log(`[${slug}] Selesai kirim ULTAH`)
}

async function main() {
  const nowWib  = new Date(Date.now() + 7 * 3600_000)
  const hourWib = nowWib.getUTCHours()
  console.log(`[sapaan-cron] Mulai — jam WIB: ${hourWib}:00`)

  const tenants = await masterDb.tenant.findMany({ where: { aktif: true }, select: { slug: true } })

  for (const t of tenants) {
    try {
      const db  = await getTenantDb(t.slug)
      const cfg = await db.sapaanConfig.findUnique({
        where: { tenant_slug_jenis: { tenant_slug: t.slug, jenis: 'ULTAH' } },
      })
      if (!cfg?.aktif) continue
      if (cfg.jam_kirim !== hourWib) continue
      await processTenantUltah(t.slug, cfg)
    } catch (e: any) {
      console.error(`[sapaan-cron] Error tenant ${t.slug}:`, e.message)
    }
  }

  console.log('[sapaan-cron] Selesai semua tenant')
  process.exit(0)
}

main().catch(e => { console.error('[sapaan-cron] Fatal:', e); process.exit(1) })
