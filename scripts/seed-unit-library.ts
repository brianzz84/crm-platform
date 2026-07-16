/**
 * Seed master unit (crm_simrs_unit_library) untuk sebuah tenant.
 *
 * Sumbernya BUKAN karangan: unit diturunkan dari data nyata tenant —
 * kelompok & jenis di master tindakan SIMRS (crm_simrs_layanan_library)
 * dan nilai poli yang benar-benar muncul di kunjungan. Admin tetap bisa
 * menambah/edit lewat UI Library setelahnya.
 *
 * Aman diulang: upsert per (tenant_slug, nama), tidak menimpa warna/urutan
 * yang sudah diedit admin.
 *
 * Uji:  DRY_RUN=1 DATABASE_URL="..." npx tsx scripts/seed-unit-library.ts rkz
 * Jalan: DATABASE_URL="..." npx tsx scripts/seed-unit-library.ts rkz
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const SLUG = process.argv[2] || 'rkz'
const DRY_RUN = process.env.DRY_RUN === '1'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

// Warna badge per kelompok — dipakai UI. Admin bisa ubah per unit lewat library.
const WARNA_KELOMPOK: Record<string, string> = {
  'Rawat Jalan':  '#0089A8',
  'Rawat Inap':   '#7C3AED',
  'Penunjang':    '#D97706',
  'Pondok Sehat': '#16A34A',
  'One Day Care': '#DB2777',
  'Home Care':    '#0891B2',
}

async function main() {
  console.log(DRY_RUN ? '[DRY_RUN] tidak menulis apa pun\n' : '')
  console.log(`Tenant: ${SLUG}`)

  // Sumber kebenaran TUNGGAL: master tindakan SIMRS (kelompok + jenis).
  // Sengaja TIDAK mengambil dari nilai poli di kunjungan — data kunjungan bisa
  // mengandung ejaan lama/dummy dan akan mencemari master.
  const layanan = await db.simrsLayananLibrary.groupBy({
    by: ['kelompok', 'jenis'],
    where: { aktif: true },
    _count: { _all: true },
  })
  if (!layanan.length) throw new Error('Master tindakan kosong — batal, jangan mengarang unit.')

  const rows = layanan
    .filter(l => l.kelompok && l.jenis)
    .map(l => ({ nama: l.jenis, kelompok: l.kelompok, jumlahLayanan: l._count._all }))
    .sort((a, b) => a.kelompok.localeCompare(b.kelompok) || b.jumlahLayanan - a.jumlahLayanan)

  const perKelompok = rows.reduce((a: any, r) => { (a[r.kelompok] ??= []).push(`${r.nama} (${r.jumlahLayanan} layanan)`); return a }, {})
  console.log(`\nUnit yang akan dibuat: ${rows.length}`)
  for (const [k, list] of Object.entries(perKelompok)) {
    console.log(`\n  ${k} (${(list as string[]).length} unit)`)
    for (const n of list as string[]) console.log(`    - ${n}`)
  }

  if (DRY_RUN) { console.log('\n[DRY_RUN] Selesai.'); return }

  let baru = 0, ada = 0
  for (const [i, r] of rows.entries()) {
    const existing = await db.simrsUnitLibrary.findUnique({
      where: { tenant_slug_nama: { tenant_slug: SLUG, nama: r.nama } },
    })
    if (existing) { ada++; continue }
    await db.simrsUnitLibrary.create({
      data: {
        tenant_slug: SLUG,
        nama:        r.nama,
        kelompok:    r.kelompok,
        warna:       WARNA_KELOMPOK[r.kelompok] ?? '#0089A8',
        urutan:      i,
      },
    })
    baru++
  }
  console.log(`\nSelesai. Baru: ${baru}, sudah ada (dilewati): ${ada}`)
}

main()
  .catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
  .finally(() => db.$disconnect())
