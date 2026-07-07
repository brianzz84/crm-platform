/**
 * Script: Setup tenant RKZ + push schema ke semua tenant DB
 * Jalankan: npx tsx scripts/setup-rkz.ts
 */

import { Client } from 'pg'
import { execSync } from 'child_process'

const MASTER_URL = process.env.DATABASE_URL || 'postgresql://atc_user:atc_dev_password@localhost:5432/crm_master'
const RKZ_DB_URL = 'postgresql://atc_user:atc_dev_password@localhost:5432/crm_tenant_rkz'
const DEMO_DB_URL = 'postgresql://atc_user:atc_dev_password@localhost:5432/crm_tenant_demo'

async function main() {
  // ── 1. Buat database crm_tenant_rkz ──
  console.log('📦 Membuat database crm_tenant_rkz...')
  const pgClient = new Client({ connectionString: 'postgresql://atc_user:atc_dev_password@localhost:5432/postgres' })
  await pgClient.connect()
  const dbExists = await pgClient.query(`SELECT 1 FROM pg_database WHERE datname = 'crm_tenant_rkz'`)
  if (dbExists.rowCount === 0) {
    await pgClient.query('CREATE DATABASE crm_tenant_rkz')
    console.log('  ✓ Database crm_tenant_rkz dibuat')
  } else {
    console.log('  ✓ Database crm_tenant_rkz sudah ada')
  }
  await pgClient.end()

  // ── 2. Daftarkan tenant RKZ di master DB ──
  console.log('📋 Mendaftarkan tenant RKZ di master DB...')
  const masterClient = new Client({ connectionString: MASTER_URL })
  await masterClient.connect()

  const existing = await masterClient.query(`SELECT id FROM crm_tenants WHERE slug = 'rkz'`)
  if (existing.rowCount === 0) {
    await masterClient.query(`
      INSERT INTO crm_tenants (id, slug, name, plan, database_url, aktif, created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        'rkz',
        'RS RKZ Surabaya',
        'PRO',
        $1,
        true,
        NOW(),
        NOW()
      )
    `, [RKZ_DB_URL])
    console.log('  ✓ Tenant RKZ didaftarkan')
  } else {
    console.log('  ✓ Tenant RKZ sudah ada')
  }
  await masterClient.end()

  // ── 3. Push schema ke crm_tenant_rkz ──
  console.log('🔄 Push schema ke crm_tenant_rkz...')
  execSync(`DATABASE_URL="${RKZ_DB_URL}" npx prisma db push --accept-data-loss`, {
    stdio: 'inherit',
    cwd: process.cwd(),
  })
  console.log('  ✓ Schema RKZ selesai')

  // ── 4. Push schema ke crm_tenant_demo (update dengan model baru) ──
  console.log('🔄 Update schema crm_tenant_demo...')
  execSync(`DATABASE_URL="${DEMO_DB_URL}" npx prisma db push --accept-data-loss`, {
    stdio: 'inherit',
    cwd: process.cwd(),
  })
  console.log('  ✓ Schema demo selesai')

  // ── 5. Seed LoyaltyRule default untuk RKZ ──
  console.log('⭐ Seed LoyaltyRule default untuk RKZ...')
  const rkzClient = new Client({ connectionString: RKZ_DB_URL })
  await rkzClient.connect()

  const loyaltyRules = [
    { jenis: 'KUNJUNGAN_RAWAT_JALAN', poin: 10,  keterangan: 'Poin otomatis dari kunjungan rawat jalan (SIMRS)' },
    { jenis: 'KUNJUNGAN_RAWAT_INAP',  poin: 50,  keterangan: 'Poin otomatis dari kunjungan rawat inap (SIMRS)' },
    { jenis: 'KUNJUNGAN_PENUNJANG',   poin: 5,   keterangan: 'Poin otomatis dari kunjungan penunjang (SIMRS)' },
    { jenis: 'KEGIATAN',              poin: 0,   keterangan: 'Poin diambil dari field poin_kegiatan di setiap kegiatan' },
    { jenis: 'MANUAL',                poin: 0,   keterangan: 'Poin diinput manual oleh admin' },
  ]

  for (const rule of loyaltyRules) {
    await rkzClient.query(`
      INSERT INTO crm_loyalty_rules (id, tenant_slug, jenis, poin, aktif, keterangan, updated_at)
      VALUES (gen_random_uuid(), 'rkz', $1, $2, true, $3, NOW())
      ON CONFLICT (tenant_slug, jenis) DO UPDATE SET poin = $2, keterangan = $3, updated_at = NOW()
    `, [rule.jenis, rule.poin, rule.keterangan])
  }
  console.log('  ✓ LoyaltyRule default selesai')

  // ── 6. Seed TenantProfile RKZ ──
  console.log('🏥 Seed TenantProfile RKZ...')
  await rkzClient.query(`
    INSERT INTO crm_tenant_profile (id, tenant_slug, nama_klinik, nama_rs, created_at, updated_at)
    VALUES (gen_random_uuid(), 'rkz', 'RS RKZ Surabaya', 'RS RKZ', NOW(), NOW())
    ON CONFLICT (tenant_slug) DO NOTHING
  `)
  console.log('  ✓ TenantProfile RKZ selesai')

  await rkzClient.end()

  console.log('\n✅ Setup tenant RKZ selesai!')
  console.log('   URL tenant: http://localhost:3002/rkz')
  console.log('   Selanjutnya: npx tsx scripts/migrate-akar.ts')
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1) })
