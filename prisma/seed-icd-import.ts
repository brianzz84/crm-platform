/**
 * Import ICD-10 lengkap ke master DB + semua tenant DB.
 *
 * Jalankan setelah download_icd10.py selesai menghasilkan seed-icd-full.ts:
 *   DATABASE_URL="postgresql://..." npx tsx prisma/seed-icd-import.ts
 *
 * Strategi merge:
 *  - Kode yang sudah ada di seed-icd.ts (302 kode dengan terjemahan Indonesia) → pakai nama_id-nya
 *  - Kode baru dari dataset lengkap → nama_id = nama_en (English) sebagai fallback
 */
import { masterDb, getTenantDb } from '../src/lib/tenant'
import { ICD10_SEED, ICD11_SEED } from './seed-icd'
import { ICD10_FULL } from './seed-icd-full'

// Bangun lookup nama_id dari seed manual (yang sudah ada terjemahan Indonesia)
const manualNamaId = new Map<string, string>()
for (const [kode, , nama_id] of ICD10_SEED) {
  manualNamaId.set(kode, nama_id)
}

async function importToDb(db: any, label: string) {
  const entries = [
    ...ICD10_FULL.map(([kode, nama_en, bab]) => ({
      kode,
      nama:    nama_en,
      nama_id: manualNamaId.get(kode) ?? nama_en,  // pakai Indo jika ada, fallback English
      bab,
      versi:   'ICD10',
      aktif:   true,
    })),
    ...ICD11_SEED.map(([kode, nama, nama_id, bab]) => ({
      kode, nama, nama_id, bab, versi: 'ICD11', aktif: true,
    })),
  ]

  let inserted = 0
  let updated  = 0
  const BATCH  = 200

  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH)
    for (const entry of batch) {
      const existing = await db.icdLibrary.findUnique({ where: { kode: entry.kode } })
      if (existing) {
        await db.icdLibrary.update({
          where:  { kode: entry.kode },
          data:   { nama: entry.nama, nama_id: entry.nama_id, bab: entry.bab, versi: entry.versi },
        })
        updated++
      } else {
        await db.icdLibrary.create({ data: entry })
        inserted++
      }
    }
    if ((i / BATCH + 1) % 10 === 0) {
      process.stdout.write(`  ${label}: ${i + BATCH}/${entries.length}...\r`)
    }
  }
  console.log(`✓ ${label}: ${inserted} baru, ${updated} diperbarui (total ${entries.length})`)
}

async function main() {
  const total = ICD10_FULL.length + ICD11_SEED.length
  console.log(`\nImport ${total} kode ICD ke database...`)
  console.log(`  (${ICD10_FULL.length} ICD-10 + ${ICD11_SEED.length} ICD-11)`)
  console.log(`  (${manualNamaId.size} kode memiliki terjemahan Indonesia manual)\n`)

  // 1. Master DB
  const masterEntries = [
    ...ICD10_FULL.map(([kode, nama_en, bab]) => ({
      kode,
      nama:    nama_en,
      nama_id: manualNamaId.get(kode) ?? nama_en,
      bab,
      versi:   'ICD10',
      aktif:   true,
    })),
    ...ICD11_SEED.map(([kode, nama, nama_id, bab]) => ({
      kode, nama, nama_id, bab, versi: 'ICD11', aktif: true,
    })),
  ]

  let masterInserted = 0
  for (let i = 0; i < masterEntries.length; i += 200) {
    const batch = masterEntries.slice(i, i + 200)
    for (const entry of batch) {
      await masterDb.icdLibraryGlobal.upsert({
        where:  { kode: entry.kode },
        update: { nama: entry.nama, nama_id: entry.nama_id, bab: entry.bab, versi: entry.versi },
        create: entry,
      })
      masterInserted++
    }
    process.stdout.write(`  master DB: ${Math.min(i + 200, masterEntries.length)}/${masterEntries.length}...\r`)
  }
  console.log(`✓ master DB: ${masterInserted} kode`)

  // 2. Semua tenant DB
  const tenants = await masterDb.tenant.findMany({ where: { aktif: true }, select: { slug: true } })
  for (const { slug } of tenants) {
    const db = await getTenantDb(slug)
    await importToDb(db, `tenant:${slug}`)
  }

  console.log('\n✅ Import selesai.')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => process.exit(0))
