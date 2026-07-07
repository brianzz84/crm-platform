/**
 * Seed: buat tenant demo + user ADMIN_IT pertama
 * Jalankan: npx prisma db seed
 *
 * Tenant DB (crm_tenant_demo) perlu diinisialisasi terpisah —
 * lihat prisma/migrate-tenant.sh
 */
import { masterDb } from '../src/lib/tenant'
import bcrypt from 'bcryptjs'
import { ICD10_SEED, ICD11_SEED } from './seed-icd'

async function main() {
  // ── Tenant demo ──────────────────────────────────────────
  const tenant = await masterDb.tenant.upsert({
    where:  { slug: 'demo' },
    update: {},
    create: {
      slug:         'demo',
      name:         'RS Demo',
      database_url: 'postgresql://atc_user:atc_dev_password@localhost:5432/crm_tenant_demo',
      plan:         'TRIAL',
      aktif:        true,
    },
  })
  console.log(`✓ Tenant: ${tenant.slug} (${tenant.name})`)

  // ── User ADMIN_IT di tenant DB ───────────────────────────
  // Import getTenantDb setelah tenant dibuat agar koneksi tersedia
  const { getTenantDb } = await import('../src/lib/tenant')
  const db = await getTenantDb('demo')

  const passwordHash = await bcrypt.hash('Admin1234!', 12)

  const user = await db.appUser.upsert({
    where: { tenant_slug_email: { tenant_slug: 'demo', email: 'admin@demo.crm' } },
    update: {},
    create: {
      tenant_slug:   'demo',
      name:          'Admin Demo',
      email:         'admin@demo.crm',
      password_hash: passwordHash,
      roles:         ['ADMIN_IT'],
      aktif:         true,
    },
  })
  console.log(`✓ User: ${user.email} / password: Admin1234!`)
  // ── ICD Library ─────────────────────────────────────────
  const allIcd = [
    ...ICD10_SEED.map(([kode, nama, nama_id, bab]) => ({ kode, nama, nama_id, bab, versi: 'ICD10', aktif: true })),
    ...ICD11_SEED.map(([kode, nama, nama_id, bab]) => ({ kode, nama, nama_id, bab, versi: 'ICD11', aktif: true })),
  ]
  let icdInserted = 0
  for (const entry of allIcd) {
    await masterDb.icdLibraryGlobal.upsert({
      where:  { kode: entry.kode },
      update: { nama: entry.nama, nama_id: entry.nama_id, bab: entry.bab, versi: entry.versi },
      create: entry,
    })
    icdInserted++
  }
  console.log(`✓ ICD Library: ${icdInserted} kode (${ICD10_SEED.length} ICD-10 + ${ICD11_SEED.length} ICD-11)`)

  console.log(`\nBuka: http://localhost:3002/login`)
  console.log(`  Kode Tenant : demo`)
  console.log(`  Email       : admin@demo.crm`)
  console.log(`  Password    : Admin1234!`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => process.exit(0))
