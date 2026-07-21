/**
 * Uji alur KONTROL_REMINDER end-to-end di DB lokal, DRY-RUN (tidak kirim WA).
 * Membuktikan: worker mengambil rencana yang jatuh H-3/H-1, menstempel kolom
 * reminder_hX_at, dan idempotent (run kedua tidak mengirim ulang). Membersihkan diri.
 *
 * Jalankan:
 *   SAPAAN_DRY_RUN=true DATABASE_URL="postgresql://atc_user:atc_dev_password@localhost:5432/crm_master" npx tsx scripts/uji-reminder-kontrol.ts
 */
import { processSapaanJob } from '../src/workers/sapaan.worker'
import { getTenantDb } from '../src/lib/tenant'

const SLUG = 'rkz'
const SIMRS_ID = 'UJI-REMINDER-PERSON'   // non 'DUMMY-' → tidak tersaring BUKAN_PERSON_UJI
const RK_H3 = 'UJI-RK-H3', RK_H1 = 'UJI-RK-H1'

let lolos = 0, gagal = 0
function periksa(nama: string, syarat: boolean, detail = '') {
  if (syarat) { console.log(`  ✓ ${nama}`); lolos++ }
  else        { console.log(`  ✗ ${nama} ${detail}`); gagal++ }
}

// Job palsu — cukup untuk processSapaanJob (log + updateProgress + data).
function fakeJob(horizon: 'H-3' | 'H-1'): any {
  return {
    data: { type: 'KONTROL_REMINDER', tenantSlug: SLUG, horizon },
    log: async () => {},
    updateProgress: async () => {},
  }
}

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

  // Simpan config lama, set aktif + template untuk uji, pulihkan di akhir.
  const cfgLama = await db.sapaanConfig.findUnique({ where: { tenant_slug_jenis: { tenant_slug: SLUG, jenis: 'KONTROL_REMINDER' } } })
  await db.sapaanConfig.upsert({
    where:  { tenant_slug_jenis: { tenant_slug: SLUG, jenis: 'KONTROL_REMINDER' } },
    update: { aktif: true, template: 'Halo {{nama}}, kontrol {{tanggal_kontrol}}.' },
    create: { tenant_slug: SLUG, jenis: 'KONTROL_REMINDER', aktif: true, template: 'Halo {{nama}}, kontrol {{tanggal_kontrol}}.', jam_kirim: 8 },
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

  // ── Run H-3 ──
  console.log('→ Run KONTROL_REMINDER H-3 (dry-run)...')
  const r3 = await processSapaanJob(fakeJob('H-3'))
  periksa('H-3: 1 terkirim', r3.sent === 1, `(dapat ${r3.sent})`)
  let rowH3 = await db.simrsRencanaKontrol.findFirst({ where: { tenant_slug: SLUG, rencana_id_sumber: RK_H3 } })
  let rowH1 = await db.simrsRencanaKontrol.findFirst({ where: { tenant_slug: SLUG, rencana_id_sumber: RK_H1 } })
  periksa('H-3: rencana H-3 terstempel reminder_h3_at', !!rowH3.reminder_h3_at)
  periksa('H-3: rencana H-3 BELUM terstempel reminder_h1_at', !rowH3.reminder_h1_at)
  periksa('H-3: rencana H-1 tidak tersentuh', !rowH1.reminder_h3_at && !rowH1.reminder_h1_at)

  // ── Run H-1 ──
  console.log('→ Run KONTROL_REMINDER H-1 (dry-run)...')
  const r1 = await processSapaanJob(fakeJob('H-1'))
  periksa('H-1: 1 terkirim', r1.sent === 1, `(dapat ${r1.sent})`)
  rowH1 = await db.simrsRencanaKontrol.findFirst({ where: { tenant_slug: SLUG, rencana_id_sumber: RK_H1 } })
  periksa('H-1: rencana H-1 terstempel reminder_h1_at', !!rowH1.reminder_h1_at)

  // ── Idempotency: run H-3 lagi → 0 terkirim ──
  console.log('→ Run KONTROL_REMINDER H-3 lagi (idempotent)...')
  const r3b = await processSapaanJob(fakeJob('H-3'))
  periksa('H-3 ulang: 0 terkirim (sudah distempel)', r3b.sent === 0, `(dapat ${r3b.sent})`)

  // ── Rencana BATAL tidak diambil ──
  console.log('→ Batalkan rencana H-1, reset stempel, run lagi → tidak terkirim...')
  await db.simrsRencanaKontrol.updateMany({ where: { tenant_slug: SLUG, rencana_id_sumber: RK_H1 }, data: { status: 'batal', reminder_h1_at: null } })
  const r1b = await processSapaanJob(fakeJob('H-1'))
  periksa('H-1 batal: 0 terkirim (status bukan terjadwal)', r1b.sent === 0, `(dapat ${r1b.sent})`)

  // Bersihkan & pulihkan config
  await bersihkan(db)
  if (cfgLama) {
    await db.sapaanConfig.update({ where: { tenant_slug_jenis: { tenant_slug: SLUG, jenis: 'KONTROL_REMINDER' } }, data: { aktif: cfgLama.aktif, template: cfgLama.template } })
  } else {
    await db.sapaanConfig.delete({ where: { tenant_slug_jenis: { tenant_slug: SLUG, jenis: 'KONTROL_REMINDER' } } }).catch(() => {})
  }

  console.log(`\n${gagal === 0 ? '✅ SEMUA LOLOS' : '❌ ADA YANG GAGAL'} — lolos ${lolos}, gagal ${gagal}`)
  process.exit(gagal > 0 ? 1 : 0)
}

main().catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
