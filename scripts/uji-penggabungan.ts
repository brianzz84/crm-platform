/**
 * Uji end-to-end penggabungan Person — gabungkan, periksa, lalu BATALKAN lagi.
 *
 * Skrip ini menguji jalur yang memindahkan data, jadi sengaja dibuat memulihkan
 * keadaan sendiri di akhir: kalau semua benar, DB kembali persis seperti semula.
 * Hanya memakai person dummy (simrs_patient_id 'DUMMY-'); berhenti kalau bukan.
 *
 * Jalankan: DATABASE_URL="..." npx tsx scripts/uji-penggabungan.ts
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { gabungkanPerson, batalkanPenggabungan } from '../src/lib/person-merge'
import { cariPersonByRm, cariPersonByNomor } from '../src/lib/person-identity'

const SLUG = 'rkz'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

let lolos = 0, gagal = 0
function periksa(nama: string, syarat: boolean, detail = '') {
  if (syarat) { console.log(`  ✓ ${nama}`); lolos++ }
  else        { console.log(`  ✗ ${nama} ${detail}`); gagal++ }
}

async function hitung(personId: string) {
  const [visits, convs, rcp, tags, keg] = await Promise.all([
    db.simrsVisit.count({ where: { person_id: personId } }),
    db.conversation.count({ where: { person_id: personId } }),
    db.campaignRecipient.count({ where: { person_id: personId } }),
    db.personTag.count({ where: { person_id: personId } }),
    db.kegiatanPeserta.count({ where: { person_id: personId } }),
  ])
  return { visits, convs, rcp, tags, keg }
}

async function main() {
  const admin = await db.appUser.findFirst({ where: { tenant_slug: SLUG }, select: { id: true } })
  if (!admin) throw new Error('Tidak ada AppUser.')

  // Sumber: person dummy yang PUNYA kunjungan, supaya perpindahan benar-benar teruji
  const sumber = await db.person.findFirst({
    where: {
      tenant_slug: SLUG, simrs_patient_id: { startsWith: 'DUMMY-' },
      digabung_ke_person_id: null, visits: { some: {} },
    },
    orderBy: { simrs_patient_id: 'desc' },
  })
  const tujuan = await db.person.findFirst({
    where: {
      tenant_slug: SLUG, simrs_patient_id: { startsWith: 'DUMMY-' },
      digabung_ke_person_id: null, id: { not: sumber?.id },
    },
    orderBy: { simrs_patient_id: 'asc' },
  })
  if (!sumber || !tujuan) throw new Error('Butuh 2 person dummy.')
  for (const p of [sumber, tujuan]) {
    if (!p.simrs_patient_id?.startsWith('DUMMY-')) throw new Error('BATAL: person uji bukan dummy.')
  }

  console.log(`Sumber : ${sumber.name} (RM ${sumber.no_rm}, HP ${sumber.no_hp})`)
  console.log(`Tujuan : ${tujuan.name} (RM ${tujuan.no_rm}, HP ${tujuan.no_hp})\n`)

  const sblmSumber = await hitung(sumber.id)
  const sblmTujuan = await hitung(tujuan.id)
  console.log('Sebelum:', { sumber: sblmSumber, tujuan: sblmTujuan }, '\n')

  // ── Gabungkan ──
  console.log('→ Menggabungkan…')
  const hasil = await gabungkanPerson(db, {
    tenantSlug: SLUG, sumberId: sumber.id, tujuanId: tujuan.id,
    alasan: 'UJI OTOMATIS — akan dibatalkan', olehUserId: admin.id,
  })

  const stlhSumber = await hitung(sumber.id)
  const stlhTujuan = await hitung(tujuan.id)
  const nisan = await db.person.findUnique({ where: { id: sumber.id } })

  periksa('kunjungan pindah ke tujuan',
    stlhTujuan.visits === sblmTujuan.visits + sblmSumber.visits,
    `(${stlhTujuan.visits} vs ${sblmTujuan.visits + sblmSumber.visits})`)
  periksa('kunjungan tidak tersisa di sumber', stlhSumber.visits === 0, `(sisa ${stlhSumber.visits})`)
  periksa('baris nisan menunjuk ke tujuan', nisan?.digabung_ke_person_id === tujuan.id)
  periksa('baris nisan dinonaktifkan', nisan?.aktif === false)
  periksa('baris nisan TETAP memegang no_rm lamanya', nisan?.no_rm === sumber.no_rm,
    '(krusial: SIMRS akan terus mengirim kunjungan dengan RM lama)')

  // Inti dari desain baris nisan: RM & nomor lama harus tetap menemukan penyintas
  const lewatRm = sumber.no_rm ? await cariPersonByRm(db, SLUG, sumber.no_rm) : null
  periksa('cari lewat RM LAMA mendarat di penyintas', lewatRm?.id === tujuan.id,
    `(dapat ${lewatRm?.id ?? 'null'})`)

  const lewatHp = sumber.no_hp ? await cariPersonByNomor(db, SLUG, sumber.no_hp) : null
  periksa('cari lewat NOMOR LAMA mendarat di penyintas', lewatHp?.id === tujuan.id,
    `(dapat ${lewatHp?.id ?? 'null'})`)

  // ── Batalkan ──
  console.log('\n→ Membatalkan…')
  await batalkanPenggabungan(db, { tenantSlug: SLUG, mergeLogId: hasil.mergeLogId, olehUserId: admin.id })

  const pulihSumber = await hitung(sumber.id)
  const pulihTujuan = await hitung(tujuan.id)
  const pulihPerson = await db.person.findUnique({ where: { id: sumber.id } })

  periksa('jumlah kunjungan sumber pulih',
    pulihSumber.visits === sblmSumber.visits, `(${pulihSumber.visits} vs ${sblmSumber.visits})`)
  periksa('jumlah kunjungan tujuan pulih',
    pulihTujuan.visits === sblmTujuan.visits, `(${pulihTujuan.visits} vs ${sblmTujuan.visits})`)
  periksa('percakapan pulih di kedua sisi',
    pulihSumber.convs === sblmSumber.convs && pulihTujuan.convs === sblmTujuan.convs)
  periksa('penerima campaign pulih di kedua sisi',
    pulihSumber.rcp === sblmSumber.rcp && pulihTujuan.rcp === sblmTujuan.rcp)
  periksa('penunjuk gabungan dihapus', pulihPerson?.digabung_ke_person_id === null)
  periksa('sumber aktif kembali', pulihPerson?.aktif === true)

  const log = await db.personMergeLog.findUnique({ where: { id: hasil.mergeLogId } })
  periksa('catatan audit ditandai dibatalkan', !!log?.dibatalkan_at)

  console.log(`\n${gagal === 0 ? '✅ SEMUA LOLOS' : '❌ ADA YANG GAGAL'} — lolos ${lolos}, gagal ${gagal}`)
  if (gagal > 0) process.exit(1)
}

main()
  .catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
  .finally(() => db.$disconnect())
