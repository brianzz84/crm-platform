/**
 * Uji sync rencana kontrol — HANYA DB lokal, SIMRS_MOCK=true. Membuktikan:
 * upsert dari feed, rekonsiliasi pembatalan (rencana yang hilang dari feed → batal),
 * dan pembatalan bisa dibatalkan (muncul lagi → terjadwal). Membersihkan diri sendiri.
 *
 * Jalankan:
 *   SIMRS_MOCK=true DATABASE_URL="postgresql://atc_user:atc_dev_password@localhost:5432/crm_master" npx tsx scripts/uji-rencana-kontrol.ts
 */
import { syncRencanaKontrol } from '../src/lib/simrs-sync'
import { getTenantDb } from '../src/lib/tenant'

const SLUG = 'rkz'
let lolos = 0, gagal = 0
function periksa(nama: string, syarat: boolean, detail = '') {
  if (syarat) { console.log(`  ✓ ${nama}`); lolos++ }
  else        { console.log(`  ✗ ${nama} ${detail}`); gagal++ }
}
const MOCK_RM_LO = 'RM100001', MOCK_RM_HI = 'RM100020'

async function bersihkan(db: any) {
  await db.simrsRencanaKontrol.deleteMany({ where: { tenant_slug: SLUG, no_rm_sumber: { gte: MOCK_RM_LO, lte: MOCK_RM_HI } } })
  await db.simrsRencanaKontrol.deleteMany({ where: { tenant_slug: SLUG, rencana_id_sumber: 'RK-HANTU' } })
  await db.person.deleteMany({ where: { tenant_slug: SLUG, no_rm: { gte: MOCK_RM_LO, lte: MOCK_RM_HI } } })
}

async function main() {
  if (process.env.SIMRS_MOCK !== 'true') throw new Error('BATAL: jalankan dengan SIMRS_MOCK=true')
  if (!process.env.DATABASE_URL?.includes('localhost')) throw new Error('BATAL: hanya untuk DB lokal')

  const db: any = await getTenantDb(SLUG)
  await bersihkan(db)

  // ── Sync pertama: feed berisi 8 rencana mock ──
  console.log('→ Sync rencana pertama...')
  const s1 = await syncRencanaKontrol(SLUG, 'manual')
  periksa('8 rencana di-upsert dari feed', s1.jumlah_upsert === 8, `(dapat ${s1.jumlah_upsert})`)
  periksa('tidak ada yang dibatalkan (feed penuh)', s1.jumlah_batal === 0, `(dapat ${s1.jumlah_batal})`)

  const jml = await db.simrsRencanaKontrol.count({ where: { tenant_slug: SLUG, status: 'terjadwal', no_rm_sumber: { gte: MOCK_RM_LO, lte: MOCK_RM_HI } } })
  periksa('8 rencana tersimpan status terjadwal', jml === 8, `(dapat ${jml})`)

  const contoh = await db.simrsRencanaKontrol.findFirst({ where: { tenant_slug: SLUG, no_rm_sumber: { gte: MOCK_RM_LO, lte: MOCK_RM_HI } }, include: { person: true } })
  periksa('rencana tertaut ke Person (dibuat rintisan jika perlu)', !!contoh?.person_id)
  periksa('sumber terisi (pondok_sehat / rawat_jalan)', ['pondok_sehat', 'rawat_jalan'].includes(contoh?.sumber))

  // ── Sisipkan rencana HANTU (tidak ada di feed) lalu sync lagi → harus batal ──
  console.log('\n→ Sisipkan rencana hantu, sync lagi (rekonsiliasi)...')
  const besok = new Date(Date.now() + 5 * 86_400_000)
  await db.simrsRencanaKontrol.create({
    data: {
      tenant_slug: SLUG, person_id: contoh!.person_id, no_rm_sumber: contoh!.no_rm_sumber,
      rencana_id_sumber: 'RK-HANTU', tanggal_rencana: besok, sumber: 'pondok_sehat', status: 'terjadwal',
    },
  })
  const s2 = await syncRencanaKontrol(SLUG, 'manual')
  periksa('8 rencana feed di-upsert lagi', s2.jumlah_upsert === 8, `(dapat ${s2.jumlah_upsert})`)
  periksa('rencana hantu (hilang dari feed) ditandai BATAL', s2.jumlah_batal >= 1, `(dapat ${s2.jumlah_batal})`)
  const hantu = await db.simrsRencanaKontrol.findFirst({ where: { tenant_slug: SLUG, rencana_id_sumber: 'RK-HANTU' } })
  periksa('status hantu = batal', hantu?.status === 'batal', `(dapat ${hantu?.status})`)

  // ── Rencana yang sempat batal lalu MUNCUL lagi di feed → kembali terjadwal ──
  console.log('\n→ Batalkan manual salah satu rencana feed, sync lagi (muncul lagi → aktif)...')
  const salahSatu = await db.simrsRencanaKontrol.findFirst({ where: { tenant_slug: SLUG, no_rm_sumber: { gte: MOCK_RM_LO, lte: MOCK_RM_HI }, status: 'terjadwal' } })
  await db.simrsRencanaKontrol.update({ where: { id: salahSatu!.id }, data: { status: 'batal' } })
  await syncRencanaKontrol(SLUG, 'manual')
  const pulih = await db.simrsRencanaKontrol.findFirst({ where: { id: salahSatu!.id } })
  periksa('rencana yang muncul lagi di feed kembali terjadwal', pulih?.status === 'terjadwal', `(dapat ${pulih?.status})`)

  await bersihkan(db)
  console.log(`\n${gagal === 0 ? '✅ SEMUA LOLOS' : '❌ ADA YANG GAGAL'} — lolos ${lolos}, gagal ${gagal}`)
  process.exit(gagal > 0 ? 1 : 0)
}

main().catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
