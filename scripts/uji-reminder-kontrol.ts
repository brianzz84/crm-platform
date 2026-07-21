/**
 * Uji alur KONTROL_REMINDER end-to-end di DB lokal, DRY-RUN (tidak kirim WA).
 * Sejak sapaan pindah ke template Meta: worker butuh template_id approved + config Meta.
 * Membuktikan: worker ambil rencana H-3/H-1, stempel reminder_hX_at, idempotent,
 * dan buildTemplateComponents mengisi variabel dari person + jadwal kontrol.
 *
 * Jalankan:
 *   SAPAAN_DRY_RUN=true DATABASE_URL="postgresql://atc_user:atc_dev_password@localhost:5432/crm_master" npx tsx scripts/uji-reminder-kontrol.ts
 */
import { processSapaanJob } from '../src/workers/sapaan.worker'
import { buildTemplateComponents } from '../src/lib/template-fields'
import { getTenantDb } from '../src/lib/tenant'

const SLUG = 'rkz'
const SIMRS_ID = 'UJI-REMINDER-PERSON'   // non 'DUMMY-' → tidak tersaring BUKAN_PERSON_UJI
const RK_H3 = 'UJI-RK-H3', RK_H1 = 'UJI-RK-H1'
const TMPL_NAME = 'uji_reminder_kontrol_tmpl'

let lolos = 0, gagal = 0
function periksa(nama: string, syarat: boolean, detail = '') {
  if (syarat) { console.log(`  ✓ ${nama}`); lolos++ }
  else        { console.log(`  ✗ ${nama} ${detail}`); gagal++ }
}

function fakeJob(horizon: 'H-3' | 'H-1'): any {
  return { data: { type: 'KONTROL_REMINDER', tenantSlug: SLUG, horizon }, log: async () => {}, updateProgress: async () => {} }
}

const TMPL_SCHEMA = [
  { type: 'body', text: 'Halo {{1}}, kontrol {{2}} di {{3}}.', parameters: [
    { param_key: 'nama',    source: 'field', field: 'nama',            example: 'Budi' },
    { param_key: 'tanggal', source: 'field', field: 'tanggal_kontrol', example: '20 Apr' },
    { param_key: 'poli',    source: 'field', field: 'poli_kontrol',    example: 'Poli Umum' },
  ] },
]

async function bersihkan(db: any) {
  const orang = await db.person.findMany({ where: { tenant_slug: SLUG, simrs_patient_id: SIMRS_ID }, select: { id: true } })
  const ids = orang.map((o: any) => o.id)
  await db.simrsRencanaKontrol.deleteMany({ where: { tenant_slug: SLUG, rencana_id_sumber: { in: [RK_H3, RK_H1] } } })
  if (ids.length) await db.sapaanLog.deleteMany({ where: { tenant_slug: SLUG, person_id: { in: ids } } })
  await db.person.deleteMany({ where: { tenant_slug: SLUG, simrs_patient_id: SIMRS_ID } })
}

async function main() {
  if (process.env.SAPAAN_DRY_RUN !== 'true') throw new Error('BATAL: jalankan dengan SAPAAN_DRY_RUN=true')
  if (!process.env.DATABASE_URL?.includes('localhost')) throw new Error('BATAL: hanya untuk DB lokal')

  const db: any = await getTenantDb(SLUG)
  await bersihkan(db)

  // ── Unit: buildTemplateComponents mengisi variabel dari person + extra ──
  const komp = buildTemplateComponents(
    { components_schema: TMPL_SCHEMA },
    { name: 'Pak Uji Reminder' },
    {},
    { tanggal_kontrol: 'Senin, 20 April 2026', poli_kontrol: 'Pondok Sehat' },
  )
  const teks = komp[0].parameters.map((p: any) => p.text)
  periksa('komponen: {{1}} = nama person', teks[0] === 'Pak Uji Reminder', `(dapat ${teks[0]})`)
  periksa('komponen: {{2}} = tanggal_kontrol dari jadwal', teks[1] === 'Senin, 20 April 2026', `(dapat ${teks[1]})`)
  periksa('komponen: {{3}} = poli_kontrol dari jadwal', teks[2] === 'Pondok Sehat', `(dapat ${teks[2]})`)

  // Template approved + config KONTROL menunjuk ke situ
  const tmpl = await db.broadcastTemplate.upsert({
    where:  { tenant_slug_template_name: { tenant_slug: SLUG, template_name: TMPL_NAME } },
    update: { meta_status: 'APPROVED', aktif: true, components_schema: TMPL_SCHEMA },
    create: { tenant_slug: SLUG, nama: '[UJI] Reminder Kontrol', template_name: TMPL_NAME, template_language: 'id', meta_status: 'APPROVED', meta_category: 'UTILITY', aktif: true, components_schema: TMPL_SCHEMA },
  })
  const cfgLama = await db.sapaanConfig.findUnique({ where: { tenant_slug_jenis: { tenant_slug: SLUG, jenis: 'KONTROL_REMINDER' } } })
  await db.sapaanConfig.upsert({
    where:  { tenant_slug_jenis: { tenant_slug: SLUG, jenis: 'KONTROL_REMINDER' } },
    update: { aktif: true, template_id: tmpl.id, template: null },
    create: { tenant_slug: SLUG, jenis: 'KONTROL_REMINDER', aktif: true, template_id: tmpl.id, jam_kirim: 8 },
  })

  const person = await db.person.create({
    data: { tenant_slug: SLUG, name: 'Pak Uji Reminder', no_hp: '081200000009', simrs_patient_id: SIMRS_ID, aktif: true },
  })

  const now = new Date()
  const h3 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 9, 0, 0)
  const h1 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0)
  await db.simrsRencanaKontrol.createMany({
    data: [
      { tenant_slug: SLUG, person_id: person.id, no_rm_sumber: 'RMUJI', rencana_id_sumber: RK_H3, tanggal_rencana: h3, sumber: 'pondok_sehat', status: 'terjadwal' },
      { tenant_slug: SLUG, person_id: person.id, no_rm_sumber: 'RMUJI', rencana_id_sumber: RK_H1, tanggal_rencana: h1, sumber: 'pondok_sehat', status: 'terjadwal' },
    ],
  })

  console.log('→ Run KONTROL_REMINDER H-3 (dry-run)...')
  const r3 = await processSapaanJob(fakeJob('H-3'))
  periksa('H-3: 1 terkirim', r3.sent === 1, `(dapat ${r3.sent})`)
  let rowH3 = await db.simrsRencanaKontrol.findFirst({ where: { tenant_slug: SLUG, rencana_id_sumber: RK_H3 } })
  let rowH1 = await db.simrsRencanaKontrol.findFirst({ where: { tenant_slug: SLUG, rencana_id_sumber: RK_H1 } })
  periksa('H-3: rencana H-3 terstempel reminder_h3_at', !!rowH3.reminder_h3_at)
  periksa('H-3: rencana H-3 BELUM terstempel reminder_h1_at', !rowH3.reminder_h1_at)
  periksa('H-3: rencana H-1 tidak tersentuh', !rowH1.reminder_h3_at && !rowH1.reminder_h1_at)

  console.log('→ Run KONTROL_REMINDER H-1 (dry-run)...')
  const r1 = await processSapaanJob(fakeJob('H-1'))
  periksa('H-1: 1 terkirim', r1.sent === 1, `(dapat ${r1.sent})`)
  rowH1 = await db.simrsRencanaKontrol.findFirst({ where: { tenant_slug: SLUG, rencana_id_sumber: RK_H1 } })
  periksa('H-1: rencana H-1 terstempel reminder_h1_at', !!rowH1.reminder_h1_at)

  console.log('→ Run KONTROL_REMINDER H-3 lagi (idempotent)...')
  const r3b = await processSapaanJob(fakeJob('H-3'))
  periksa('H-3 ulang: 0 terkirim (sudah distempel)', r3b.sent === 0, `(dapat ${r3b.sent})`)

  console.log('→ Config tanpa template_id → skip (tidak kirim)...')
  await db.sapaanConfig.update({ where: { tenant_slug_jenis: { tenant_slug: SLUG, jenis: 'KONTROL_REMINDER' } }, data: { template_id: null } })
  await db.simrsRencanaKontrol.updateMany({ where: { tenant_slug: SLUG, rencana_id_sumber: RK_H3 }, data: { reminder_h3_at: null } })
  const rNoTmpl = await processSapaanJob(fakeJob('H-3'))
  periksa('tanpa template: 0 terkirim (skip)', rNoTmpl.sent === 0, `(dapat ${rNoTmpl.sent})`)

  // Bersihkan & pulihkan
  await bersihkan(db)
  await db.broadcastTemplate.deleteMany({ where: { tenant_slug: SLUG, template_name: TMPL_NAME } })
  if (cfgLama) {
    await db.sapaanConfig.update({ where: { tenant_slug_jenis: { tenant_slug: SLUG, jenis: 'KONTROL_REMINDER' } }, data: { aktif: cfgLama.aktif, template_id: cfgLama.template_id, template: cfgLama.template } })
  } else {
    await db.sapaanConfig.delete({ where: { tenant_slug_jenis: { tenant_slug: SLUG, jenis: 'KONTROL_REMINDER' } } }).catch(() => {})
  }

  console.log(`\n${gagal === 0 ? '✅ SEMUA LOLOS' : '❌ ADA YANG GAGAL'} — lolos ${lolos}, gagal ${gagal}`)
  process.exit(gagal > 0 ? 1 : 0)
}

main().catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
