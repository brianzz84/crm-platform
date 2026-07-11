/**
 * Migrasi data dari MySQL XAMPP (simkek) ke Railway PostgreSQL
 * Jalankan: npx tsx scripts/migrate-from-akar.ts
 */
import mysql from 'mysql2/promise'
import { Client } from 'pg'
import { randomUUID } from 'crypto'

const TENANT_SLUG = 'rkz'
const MYSQL_SOCKET = '/Applications/XAMPP/xamppfiles/var/mysql/mysql.sock'

async function main() {
  const my = await mysql.createConnection({
    socketPath: MYSQL_SOCKET,
    user: 'root',
    password: '',
    database: 'simkek',
  })
  console.log('✓ MySQL terhubung')

  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })
  await pg.connect()
  console.log('✓ PostgreSQL terhubung')

  // ── 1. CUSTOMERS → crm_persons ──────────────────────────────
  console.log('\n[1/4] Migrasi customers...')
  const [customers]: any = await my.query(`
    SELECT c.id, c.kode, c.nama_lengkap, c.nik, c.jenis_kelamin,
           c.tanggal_lahir, c.email, c.kategori, c.alamat, c.catatan,
           c.created_at,
           p.no_hp as phone_primary
    FROM simkek_customers c
    LEFT JOIN simkek_customer_phones p ON p.customer_id = c.id AND p.is_primary = 1
  `)

  const customerIdMap = new Map<number, string>() // mysql_id → uuid

  let inserted = 0, skipped = 0
  for (const c of customers) {
    const uuid = randomUUID()
    customerIdMap.set(c.id, uuid)

    try {
      await pg.query(`
        INSERT INTO crm_persons (
          id, tenant_slug, akar_kode, name, nik, jenis_kelamin,
          tanggal_lahir, email, kategori, alamat, no_hp,
          aktif, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12,$12)
        ON CONFLICT DO NOTHING
      `, [
        uuid, TENANT_SLUG, c.kode, c.nama_lengkap,
        c.nik || null,
        c.jenis_kelamin || null,
        c.tanggal_lahir || null,
        c.email || null,
        c.kategori || 'umum',
        c.alamat || null,
        c.phone_primary || null,
        c.created_at,
      ])
      inserted++
    } catch (e: any) {
      console.error(`  Skip customer ${c.kode}: ${e.message}`)
      skipped++
    }
  }
  console.log(`  ✓ ${inserted} inserted, ${skipped} skipped`)

  // ── 2. CUSTOMER_PHONES → crm_person_contacts ────────────────
  console.log('\n[2/4] Migrasi phone contacts...')
  const [phones]: any = await my.query(`
    SELECT * FROM simkek_customer_phones
  `)

  let pInserted = 0
  for (const p of phones) {
    const personId = customerIdMap.get(p.customer_id)
    if (!personId) continue
    try {
      await pg.query(`
        INSERT INTO crm_person_contacts (id, person_id, tenant_slug, jenis, nilai, label, is_primary, created_at)
        VALUES ($1,$2,$3,'HP',$4,$5,$6,$7)
        ON CONFLICT DO NOTHING
      `, [randomUUID(), personId, TENANT_SLUG, p.no_hp, p.label || 'utama', p.is_primary === 1, p.created_at])
      pInserted++
    } catch {}
  }
  console.log(`  ✓ ${pInserted} phone contacts inserted`)

  // ── 3. KEGIATAN → crm_kegiatan ──────────────────────────────
  console.log('\n[3/4] Migrasi kegiatan...')
  const [kegiatan]: any = await my.query(`
    SELECT k.*, j.nama as jenis_nama
    FROM simkek_kegiatan k
    LEFT JOIN simkek_jenis_kegiatan j ON j.id = k.jenis_kegiatan_id
  `)

  const kegiatanIdMap = new Map<number, string>()
  let kInserted = 0
  for (const k of kegiatan) {
    const uuid = randomUUID()
    kegiatanIdMap.set(k.id, uuid)
    try {
      await pg.query(`
        INSERT INTO crm_kegiatan (
          id, tenant_slug, kode, nama, jenis,
          tanggal_mulai, tanggal_selesai, lokasi, penyelenggara,
          keterangan, status, qr_token, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
        ON CONFLICT (qr_token) DO NOTHING
      `, [
        uuid, TENANT_SLUG, k.kode, k.nama_kegiatan,
        k.jenis_nama || 'Umum',
        k.tanggal_mulai, k.tanggal_selesai || null,
        k.lokasi || null, k.penyelenggara || null,
        k.keterangan || null, k.status || 'selesai',
        k.qr_token, k.created_at,
      ])
      kInserted++
    } catch (e: any) {
      console.error(`  Skip kegiatan ${k.kode}: ${e.message}`)
    }
  }
  console.log(`  ✓ ${kInserted} kegiatan inserted`)

  // ── 4. CUSTOMER_KEGIATAN → crm_kegiatan_peserta ─────────────
  console.log('\n[4/4] Migrasi peserta kegiatan...')
  const [peserta]: any = await my.query(`SELECT * FROM simkek_customer_kegiatan`)

  let pesInserted = 0
  for (const p of peserta) {
    const personId   = customerIdMap.get(p.customer_id)
    const kegiatanId = kegiatanIdMap.get(p.kegiatan_id)
    if (!personId || !kegiatanId) continue
    try {
      await pg.query(`
        INSERT INTO crm_kegiatan_peserta (id, kegiatan_id, person_id, tenant_slug, hadir, sumber, created_at)
        VALUES ($1,$2,$3,$4,true,'import',$5)
        ON CONFLICT DO NOTHING
      `, [randomUUID(), kegiatanId, personId, TENANT_SLUG, p.created_at || new Date()])
      pesInserted++
    } catch {}
  }
  console.log(`  ✓ ${pesInserted} peserta inserted`)

  await my.end()
  await pg.end()
  console.log('\n✅ Migrasi selesai!')
}

main().catch(e => { console.error(e); process.exit(1) })
