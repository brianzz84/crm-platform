/**
 * Uji end-to-end engine sync Opsi A (visit ramping + fetch person selektif).
 * HANYA DB lokal, SIMRS_MOCK=true. Membuat data mock RM100001..RM100020 lalu
 * membersihkannya sendiri di akhir.
 *
 * Membuktikan inti hemat-transfer: pasien yang datanya sudah segar TIDAK di-fetch
 * person-nya ulang saat kunjungan berikutnya; yang basi (>30 hari) di-fetch lagi.
 *
 * Jalankan (pakai DATABASE_URL master lokal supaya getTenantDb bisa resolve rkz):
 *   SIMRS_MOCK=true DATABASE_URL="postgresql://atc_user:atc_dev_password@localhost:5432/crm_master" npx tsx scripts/uji-sync-opsi-a.ts
 */
import { syncTanggal, segarkanPersonDariSimrs } from '../src/lib/simrs-sync'
import { getTenantDb } from '../src/lib/tenant'

const SLUG = 'rkz'
let lolos = 0, gagal = 0
function periksa(nama: string, syarat: boolean, detail = '') {
  if (syarat) { console.log(`  ✓ ${nama}`); lolos++ }
  else        { console.log(`  ✗ ${nama} ${detail}`); gagal++ }
}

const MOCK_RM_LO = 'RM100001', MOCK_RM_HI = 'RM100020'

async function bersihkan(db: any) {
  await db.simrsVisit.deleteMany({ where: { person: { tenant_slug: SLUG, no_rm: { gte: MOCK_RM_LO, lte: MOCK_RM_HI } } } })
  await db.simrsSyncLog.deleteMany({ where: { tenant_slug: SLUG, mode: 'manual' } })
  await db.person.deleteMany({ where: { tenant_slug: SLUG, no_rm: { gte: MOCK_RM_LO, lte: MOCK_RM_HI } } })
}

async function main() {
  if (process.env.SIMRS_MOCK !== 'true') throw new Error('BATAL: jalankan dengan SIMRS_MOCK=true')
  if (!process.env.DATABASE_URL?.includes('localhost')) throw new Error('BATAL: hanya untuk DB lokal')

  const db: any = await getTenantDb(SLUG)
  await bersihkan(db)

  // ── Hari 1: pasien baru semua ──
  console.log('→ Hari 1 (2026-07-01) — semua pasien baru...')
  const h1 = await syncTanggal(SLUG, '2026-07-01', 'manual')
  periksa('kunjungan baru dibuat (20)', h1.jumlah_baru === 20, `(dapat ${h1.jumlah_baru})`)
  periksa('semua person disegarkan hari 1 (20, karena baru)', h1.person_disegarkan === 20, `(dapat ${h1.person_disegarkan})`)

  const contoh = await db.person.findFirst({ where: { tenant_slug: SLUG, no_rm: 'RM100001' } })
  periksa('demografi terisi dari endpoint Pasien (nama bukan placeholder)',
    !!contoh && !contoh.name.startsWith('(Menunggu'), `(nama="${contoh?.name}")`)
  periksa('no_hp terisi dari endpoint Pasien', !!contoh?.no_hp)
  periksa('nik terisi (untuk deteksi duplikat)', !!contoh?.nik)
  periksa('kota terisi (segmentasi wilayah)', !!contoh?.kota)
  periksa('is_rintisan = false setelah demografi terisi', contoh?.is_rintisan === false)
  periksa('last_simrs_sync_at terisi', !!contoh?.last_simrs_sync_at)

  const visit1 = await db.simrsVisit.findFirst({ where: { person_id: contoh!.id } })
  periksa('SimrsVisit terisi field kunjungan (unit)', !!visit1?.unit)
  periksa('no_rm_sumber tercatat di kunjungan', visit1?.no_rm_sumber === 'RM100001')

  // ── Hari 2: pasien SAMA (no_rm deterministik), data masih segar ──
  console.log('\n→ Hari 2 (2026-07-02) — pasien sama, data <30 hari...')
  const h2 = await syncTanggal(SLUG, '2026-07-02', 'manual')
  periksa('kunjungan baru hari 2 dibuat (20, kunjungan_id beda)', h2.jumlah_baru === 20, `(dapat ${h2.jumlah_baru})`)
  periksa('★ NOL person di-fetch ulang (data segar) — inti hemat transfer',
    h2.person_disegarkan === 0, `(dapat ${h2.person_disegarkan})`)

  // ── Hari 3: satu pasien dibuat "basi" (40 hari) → harus di-fetch ulang ──
  console.log('\n→ Hari 3 (2026-07-03) — 1 pasien dibuat basi (40 hari)...')
  const empatPuluhHariLalu = new Date(Date.now() - 40 * 86_400_000)
  await db.person.update({ where: { id: contoh!.id }, data: { last_simrs_sync_at: empatPuluhHariLalu } })
  const h3 = await syncTanggal(SLUG, '2026-07-03', 'manual')
  periksa('tepat 1 person basi di-fetch ulang', h3.person_disegarkan === 1, `(dapat ${h3.person_disegarkan})`)
  const segar = await db.person.findFirst({ where: { id: contoh!.id } })
  periksa('last_simrs_sync_at pasien basi diperbarui', !!segar?.last_simrs_sync_at && segar.last_simrs_sync_at > empatPuluhHariLalu)

  // ── Tombol manual: segarkanPersonDariSimrs langsung ──
  console.log('\n→ Fungsi segarkan manual (dipakai tombol)...')
  const sblm = await db.person.findFirst({ where: { id: contoh!.id } })
  await new Promise(r => setTimeout(r, 10))
  const ok = await segarkanPersonDariSimrs(db, { base_url: 'mock', api_key: 'mock' }, contoh!.id, 'RM100001')
  periksa('segarkanPersonDariSimrs mengembalikan true', ok === true)
  const ssdh = await db.person.findFirst({ where: { id: contoh!.id } })
  periksa('last_simrs_sync_at diperbarui oleh segarkan manual',
    !!ssdh?.last_simrs_sync_at && !!sblm?.last_simrs_sync_at && ssdh.last_simrs_sync_at > sblm.last_simrs_sync_at)

  await bersihkan(db)
  console.log(`\n${gagal === 0 ? '✅ SEMUA LOLOS' : '❌ ADA YANG GAGAL'} — lolos ${lolos}, gagal ${gagal}`)
  if (gagal > 0) process.exit(1)
  process.exit(0)
}

main().catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
