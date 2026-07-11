/**
 * Seed Railway production via raw pg (bypass Prisma adapter)
 * Jalankan: DATABASE_URL="..." npx tsx scripts/seed-railway.ts
 */
import { Client } from 'pg'
import bcrypt from 'bcryptjs'

const DB_URL = process.env.DATABASE_URL!
if (!DB_URL) throw new Error('DATABASE_URL tidak diset')

const TENANT_SLUG = 'rkz'
const TENANT_NAME = 'RS RKZ Surabaya'
// Railway: master dan tenant pakai DB yang sama
const TENANT_DB_URL = process.env.DATABASE_PRIVATE_URL || DB_URL.replace('hayabusa.proxy.rlwy.net:40531', 'postgres.railway.internal:5432')

async function main() {
  const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  console.log('✓ Terhubung ke Railway DB')

  // 1. Upsert tenant
  await client.query(`
    INSERT INTO "Tenant" (id, slug, name, database_url, plan, aktif, created_at, updated_at)
    VALUES (gen_random_uuid(), $1, $2, $3, 'TRIAL', true, now(), now())
    ON CONFLICT (slug) DO UPDATE SET database_url = $3, updated_at = now()
  `, [TENANT_SLUG, TENANT_NAME, TENANT_DB_URL])
  console.log(`✓ Tenant: ${TENANT_SLUG} (${TENANT_NAME})`)

  // 2. Upsert TenantProfile
  await client.query(`
    INSERT INTO "TenantProfile" (id, tenant_slug, nama_rs, nama_klinik, created_at, updated_at)
    VALUES (gen_random_uuid(), $1, $2, 'CRM 360', now(), now())
    ON CONFLICT (tenant_slug) DO NOTHING
  `, [TENANT_SLUG, TENANT_NAME])
  console.log(`✓ TenantProfile dibuat`)

  // 3. Upsert user admin
  const passwordHash = await bcrypt.hash('Admin1234!', 12)
  await client.query(`
    INSERT INTO "AppUser" (id, tenant_slug, name, email, password_hash, roles, aktif, created_at, updated_at)
    VALUES (gen_random_uuid(), $1, 'Brian Admin', $2, $3, ARRAY['SUPER_ADMIN'], true, now(), now())
    ON CONFLICT (tenant_slug, email) DO NOTHING
  `, [TENANT_SLUG, 'brianzz84@gmail.com', passwordHash])
  console.log(`✓ User: brianzz84@gmail.com`)

  await client.end()

  console.log(`\n✅ Selesai! Login credentials:`)
  console.log(`  Kode Tenant : ${TENANT_SLUG}`)
  console.log(`  Email       : brianzz84@gmail.com`)
  console.log(`  Password    : Admin1234!`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => process.exit(0))
