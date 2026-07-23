/**
 * Uji Pengingat Vaksin (DRY-RUN, DB lokal). Membuktikan:
 *  - pemisahan sumber: VAKSIN ambil sumber='vaksin', KONTROL abaikan baris vaksin;
 *  - horizon H-7 (stempel reminder_h7_at);
 *  - variabel jenis_vaksin & catatan_dokter terisi dari data jadwal.
 * Membersihkan diri sendiri.
 *
 * Jalankan:
 *   SAPAAN_DRY_RUN=true DATABASE_URL="postgresql://atc_user:atc_dev_password@localhost:5432/crm_master" npx tsx scripts/uji-vaksin-reminder.ts
 */
import { processSapaanJob } from '../src/workers/sapaan.worker'
import { buildTemplateComponents } from '../src/lib/template-fields'
import { getTenantDb } from '../src/lib/tenant'

const SLUG = 'rkz'
const SIMRS_ID = 'UJI-VAKSIN-PERSON'
const RK = { vaksinH3: 'UJI-VK-H3', kontrolH3: 'UJI-KT-H3', vaksinH7: 'UJI-VK-H7' }
const TMPL = 'uji_vaksin_tmpl'

let lolos = 0, gagal = 0
function periksa(n: string, ok: boolean, d = '') { if (ok) { console.log(`  ✓ ${n}`); lolos++ } else { console.log(`  ✗ ${n} ${d}`); gagal++ } }
function fakeJob(type: string, horizon: string): any { return { data: { type, tenantSlug: SLUG, horizon }, log: async () => {}, updateProgress: async () => {} } }

const SCHEMA = [{ type: 'body', text: 'Halo {{1}}, vaksin {{2}} tgl {{3}}. {{4}}', parameters: [
  { param_key: 'nama',    source: 'field', field: 'nama',            example: 'Budi' },
  { param_key: 'vaksin',  source: 'field', field: 'jenis_vaksin',    example: 'Influenza' },
  { param_key: 'tanggal', source: 'field', field: 'tanggal_kontrol', example: '20 Apr' },
  { param_key: 'catatan', source: 'field', field: 'catatan_dokter',  example: 'bawa kartu' },
] }]

async function bersih(db: any) {
  const orang = await db.person.findMany({ where: { tenant_slug: SLUG, simrs_patient_id: SIMRS_ID }, select: { id: true } })
  const ids = orang.map((o: any) => o.id)
  await db.simrsRencanaKontrol.deleteMany({ where: { tenant_slug: SLUG, rencana_id_sumber: { in: Object.values(RK) } } })
  if (ids.length) await db.sapaanLog.deleteMany({ where: { tenant_slug: SLUG, person_id: { in: ids } } })
  await db.person.deleteMany({ where: { tenant_slug: SLUG, simrs_patient_id: SIMRS_ID } })
}

async function main() {
  if (process.env.SAPAAN_DRY_RUN !== 'true') throw new Error('BATAL: butuh SAPAAN_DRY_RUN=true')
  if (!process.env.DATABASE_URL?.includes('localhost')) throw new Error('BATAL: hanya DB lokal')
  const db: any = await getTenantDb(SLUG)
  await bersih(db)

  // Unit: variabel vaksin terisi dari extra
  const komp = buildTemplateComponents({ components_schema: SCHEMA }, { name: 'Pak Uji Vaksin' }, {},
    { tanggal_kontrol: 'Senin, 20 April 2026', poli_kontrol: 'Imunisasi', jenis_vaksin: 'Influenza', catatan_dokter: 'Dosis ke-2' })
  const teks = komp[0].parameters.map((p: any) => p.text)
  periksa('komponen {{1}}=nama', teks[0] === 'Pak Uji Vaksin')
  periksa('komponen {{2}}=jenis_vaksin', teks[1] === 'Influenza', `(${teks[1]})`)
  periksa('komponen {{4}}=catatan_dokter', teks[3] === 'Dosis ke-2', `(${teks[3]})`)

  const tmpl = await db.broadcastTemplate.upsert({
    where:  { tenant_slug_template_name: { tenant_slug: SLUG, template_name: TMPL } },
    update: { meta_status: 'APPROVED', aktif: true, components_schema: SCHEMA },
    create: { tenant_slug: SLUG, nama: '[UJI] Vaksin', template_name: TMPL, template_language: 'id', meta_status: 'APPROVED', meta_category: 'UTILITY', aktif: true, components_schema: SCHEMA },
  })
  // Config VAKSIN + KONTROL (keduanya arahkan ke template uji ini)
  const cfgVLama = await db.sapaanConfig.findUnique({ where: { tenant_slug_jenis: { tenant_slug: SLUG, jenis: 'VAKSIN_REMINDER' } } })
  const cfgKLama = await db.sapaanConfig.findUnique({ where: { tenant_slug_jenis: { tenant_slug: SLUG, jenis: 'KONTROL_REMINDER' } } })
  for (const jenis of ['VAKSIN_REMINDER', 'KONTROL_REMINDER']) {
    await db.sapaanConfig.upsert({
      where:  { tenant_slug_jenis: { tenant_slug: SLUG, jenis } },
      update: { aktif: true, template_id: tmpl.id, template: null },
      create: { tenant_slug: SLUG, jenis, aktif: true, template_id: tmpl.id, jam_kirim: 8 },
    })
  }

  const person = await db.person.create({ data: { tenant_slug: SLUG, name: 'Pak Uji Vaksin', no_hp: '081200000008', simrs_patient_id: SIMRS_ID, aktif: true } })
  const now = new Date()
  const d = (n: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n, 9, 0, 0)
  await db.simrsRencanaKontrol.createMany({ data: [
    { tenant_slug: SLUG, person_id: person.id, no_rm_sumber: 'RMV', rencana_id_sumber: RK.vaksinH3,  tanggal_rencana: d(3), sumber: 'vaksin',       jenis_vaksin: 'Influenza', keterangan: 'Dosis ke-2', status: 'terjadwal' },
    { tenant_slug: SLUG, person_id: person.id, no_rm_sumber: 'RMV', rencana_id_sumber: RK.kontrolH3, tanggal_rencana: d(3), sumber: 'pondok_sehat', status: 'terjadwal' },
    { tenant_slug: SLUG, person_id: person.id, no_rm_sumber: 'RMV', rencana_id_sumber: RK.vaksinH7,  tanggal_rencana: d(7), sumber: 'vaksin',       jenis_vaksin: 'HPV', keterangan: 'Dosis pertama', status: 'terjadwal' },
  ] })

  console.log('→ VAKSIN H-3 (harus ambil hanya baris vaksin H-3)...')
  const v3 = await processSapaanJob(fakeJob('VAKSIN_REMINDER', 'H-3'))
  periksa('VAKSIN H-3: 1 terkirim (bukan baris kontrol)', v3.sent === 1, `(${v3.sent})`)
  const rowVaksinH3 = await db.simrsRencanaKontrol.findFirst({ where: { tenant_slug: SLUG, rencana_id_sumber: RK.vaksinH3 } })
  const rowKontrolH3 = await db.simrsRencanaKontrol.findFirst({ where: { tenant_slug: SLUG, rencana_id_sumber: RK.kontrolH3 } })
  periksa('VAKSIN H-3: baris vaksin H-3 terstempel reminder_h3_at', !!rowVaksinH3.reminder_h3_at)
  periksa('VAKSIN H-3: baris KONTROL tidak tersentuh', !rowKontrolH3.reminder_h3_at)

  console.log('→ KONTROL H-3 (harus ambil hanya baris kontrol, abaikan vaksin)...')
  const k3 = await processSapaanJob(fakeJob('KONTROL_REMINDER', 'H-3'))
  periksa('KONTROL H-3: 1 terkirim (baris kontrol saja)', k3.sent === 1, `(${k3.sent})`)
  const rowKontrolH3b = await db.simrsRencanaKontrol.findFirst({ where: { tenant_slug: SLUG, rencana_id_sumber: RK.kontrolH3 } })
  periksa('KONTROL H-3: baris kontrol terstempel', !!rowKontrolH3b.reminder_h3_at)

  console.log('→ VAKSIN H-7 (stempel reminder_h7_at)...')
  const v7 = await processSapaanJob(fakeJob('VAKSIN_REMINDER', 'H-7'))
  periksa('VAKSIN H-7: 1 terkirim', v7.sent === 1, `(${v7.sent})`)
  const rowVaksinH7 = await db.simrsRencanaKontrol.findFirst({ where: { tenant_slug: SLUG, rencana_id_sumber: RK.vaksinH7 } })
  periksa('VAKSIN H-7: baris vaksin H-7 terstempel reminder_h7_at', !!rowVaksinH7.reminder_h7_at)

  // Bersihkan & pulihkan config
  await bersih(db)
  await db.broadcastTemplate.deleteMany({ where: { tenant_slug: SLUG, template_name: TMPL } })
  for (const [jenis, lama] of [['VAKSIN_REMINDER', cfgVLama], ['KONTROL_REMINDER', cfgKLama]] as any) {
    if (lama) await db.sapaanConfig.update({ where: { tenant_slug_jenis: { tenant_slug: SLUG, jenis } }, data: { aktif: lama.aktif, template_id: lama.template_id, template: lama.template } })
    else await db.sapaanConfig.delete({ where: { tenant_slug_jenis: { tenant_slug: SLUG, jenis } } }).catch(() => {})
  }

  console.log(`\n${gagal === 0 ? '✅ SEMUA LOLOS' : '❌ ADA YANG GAGAL'} — lolos ${lolos}, gagal ${gagal}`)
  process.exit(gagal > 0 ? 1 : 0)
}
main().catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
