/**
 * Script migrasi: Akar (simkek.sql) → CRM tenant RKZ
 * Jalankan: npx tsx scripts/migrate-akar.ts
 *
 * Urutan:
 *  1. Parse simkek.sql
 *  2. Migrate tags → crm_tags
 *  3. Migrate customers → crm_persons + crm_person_contacts
 *  4. Migrate customer_tags → crm_person_tags
 *  5. Migrate kegiatan → crm_kegiatan
 *  6. Migrate customer_kegiatan → crm_kegiatan_peserta + crm_loyalty_transactions
 */

import * as fs from 'fs'
import * as path from 'path'
import { Client } from 'pg'

const RKZ_DB_URL = 'postgresql://atc_user:atc_dev_password@localhost:5432/crm_tenant_rkz'
const SQL_FILE   = path.join(process.cwd(), '..', 'Downloads', 'simkek.sql')
const TENANT     = 'rkz'

// ──────────────────────────────────────────────
// Parser SQL sederhana — ekstrak INSERT rows
// ──────────────────────────────────────────────
function extractInserts(sql: string, tableName: string): string[][] {
  const tableRegex = new RegExp(
    `INSERT INTO \`${tableName}\`[^;]+?VALUES\\s*([\\s\\S]+?);\\s*(?:--|$)`,
    'gi'
  )

  const rows: string[][] = []
  let match: RegExpExecArray | null

  while ((match = tableRegex.exec(sql)) !== null) {
    const valuesBlock = match[1]
    // Split per baris INSERT
    const rowRegex = /\(([^)]+(?:\)[^,\n]*\()*[^)]*)\)/g
    let rowMatch: RegExpExecArray | null
    while ((rowMatch = rowRegex.exec(valuesBlock)) !== null) {
      const cells = parseRow(rowMatch[1])
      rows.push(cells)
    }
  }

  return rows
}

function parseRow(raw: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inStr = false
  let i = 0

  while (i < raw.length) {
    const ch = raw[i]
    if (!inStr && ch === "'") {
      inStr = true
      i++
      continue
    }
    if (inStr && ch === "'" && raw[i + 1] === "'") {
      cur += "'"
      i += 2
      continue
    }
    if (inStr && ch === "'") {
      inStr = false
      i++
      continue
    }
    if (!inStr && ch === ',') {
      cells.push(cur.trim())
      cur = ''
      i++
      continue
    }
    cur += ch
    i++
  }
  cells.push(cur.trim())
  return cells.map(c => c === 'NULL' ? '' : c)
}

function normalizePhone(raw: string): string {
  const s = raw.replace(/\s+/g, '').replace(/[^0-9+]/g, '')
  if (s.startsWith('+62')) return '0' + s.slice(3)
  if (s.startsWith('62') && s.length > 10) return '0' + s.slice(2)
  return s
}

function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
    .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────
async function main() {
  console.log('📂 Membaca simkek.sql...')
  if (!fs.existsSync(SQL_FILE)) {
    throw new Error(`File tidak ditemukan: ${SQL_FILE}`)
  }
  const sql = fs.readFileSync(SQL_FILE, 'utf-8')
  console.log(`  ✓ File terbaca (${(sql.length / 1024 / 1024).toFixed(1)} MB)`)

  const db = new Client({ connectionString: RKZ_DB_URL })
  await db.connect()
  console.log('  ✓ Terhubung ke crm_tenant_rkz\n')

  // ── Cek apakah persons sudah ada ──
  const existingPersons = await db.query(`SELECT COUNT(*) FROM crm_persons`)
  const personsAlreadyMigrated = parseInt(existingPersons.rows[0].count) > 0
  if (personsAlreadyMigrated) {
    console.log(`  ✓ ${existingPersons.rows[0].count} persons sudah ada — skip migrasi persons & tags`)
  }

  // ────────────────────────────────────────
  // STEP 1: Tags
  // ────────────────────────────────────────
  if (personsAlreadyMigrated) {
    // Rebuild map dari DB yang sudah ada
    const existingTags = await db.query(`SELECT id, name FROM crm_tags WHERE tenant_slug = $1`, [TENANT])
    const tagRows2 = extractInserts(sql, 'simkek_tags')
    for (const r of tagRows2) {
      const [id, nama] = r
      const found = existingTags.rows.find((t: any) => t.name === nama)
      if (found) tagIdMap.set(id, found.id)
    }
    const existingCusts = await db.query(`SELECT id, akar_kode FROM crm_persons WHERE tenant_slug = $1`, [TENANT])
    for (const row of existingCusts.rows) {
      if (row.akar_kode) custIdMap.set(row.akar_kode.replace('CST', '').replace(/^0+/, '').trim(), row.id)
    }
    // Rebuild custIdMap by akar_kode properly
    for (const row of existingCusts.rows) {
      if (row.akar_kode) {
        // akar_kode = kode (CST20260001), custId from akar = sequential number
        // We stored kode as akar_kode, but custIdMap is keyed by akar integer id
        // Re-parse customers to match
      }
    }
    tagCount = existingTags.rows.length
    console.log('🏷️  Migrasi tags...')
  } else {
    console.log('🏷️  Migrasi tags...')
  const tagRows = extractInserts(sql, 'simkek_tags')
  // Kolom: id, nama, kategori, warna, is_active, created_at
  const tagIdMap = new Map<string, string>() // akar_id → crm uuid

  let tagCount = 0
  for (const r of tagRows) {
    const [id, nama, kategori, warna] = r
    if (!nama) continue

    const res = await db.query(`
      INSERT INTO crm_tags (id, tenant_slug, name, warna, keterangan, aktif, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, true, NOW())
      ON CONFLICT (tenant_slug, name) DO UPDATE SET warna = EXCLUDED.warna
      RETURNING id
    `, [TENANT, nama, warna || '#607D8B', kategori || null])

    tagIdMap.set(id, res.rows[0].id)
    tagCount++
  }
  console.log(`  ✓ ${tagCount} tag`)

  // ────────────────────────────────────────
  // STEP 2: Customers → Person + PersonContact
  // ────────────────────────────────────────
  console.log('👤 Migrasi customers → persons...')

  // Parse phones dulu → map customer_id → no_hp[]
  const phoneRows = extractInserts(sql, 'simkek_customer_phones')
  // Kolom: id, customer_id, no_hp, label, is_primary, created_at
  const phoneMap = new Map<string, { no_hp: string; label: string; is_primary: boolean }[]>()
  for (const r of phoneRows) {
    const [, custId, noHp, label, isPrimary] = r
    if (!noHp) continue
    const normalized = normalizePhone(noHp)
    if (normalized.length < 8) continue
    if (!phoneMap.has(custId)) phoneMap.set(custId, [])
    phoneMap.get(custId)!.push({
      no_hp:      normalized,
      label:      label || 'utama',
      is_primary: isPrimary === '1',
    })
  }

  // Parse customers
  const custRows = extractInserts(sql, 'simkek_customers')
  // Kolom: id, kode, nama_lengkap, nik, jenis_kelamin, tanggal_lahir, email,
  //        pekerjaan_id, kategori, pernah_rkz, layanan_rkz, alamat,
  //        kecamatan_id, kota_id, kota_manual, catatan, created_by, created_at, updated_at

  const custIdMap = new Map<string, string>() // akar_id → crm uuid
  let personNew = 0, personSkip = 0

  for (const r of custRows) {
    const [
      akarId, kode, namaRaw, nik, jenisKelamin, tanggalLahir, email,
      , kategori, , , alamat, , , , catatan,
    ] = r

    const nama = normalizeName(namaRaw || '')
    if (!nama) continue

    const phones  = phoneMap.get(akarId) || []
    const primary = phones.find(p => p.is_primary) || phones[0]
    const noHp    = primary?.no_hp || null

    try {
      const res = await db.query(`
        INSERT INTO crm_persons (
          id, tenant_slug, name, nik, email, jenis_kelamin,
          tanggal_lahir, alamat, kategori, akar_kode, no_hp, aktif, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10, true, NOW(), NOW()
        )
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [
        TENANT,
        nama,
        nik      || null,
        email?.toLowerCase() || null,
        jenisKelamin || null,
        tanggalLahir || null,
        alamat   || null,
        kategori || 'umum',
        kode,
        noHp,
      ])

      if (res.rowCount === 0) { personSkip++; continue }

      const personId = res.rows[0].id
      custIdMap.set(akarId, personId)
      personNew++

      // Upsert semua nomor HP ke PersonContact
      for (const phone of phones) {
        await db.query(`
          INSERT INTO crm_person_contacts (id, person_id, tenant_slug, jenis, nilai, label, is_primary, is_wa_aktif, created_at)
          VALUES (gen_random_uuid(), $1, $2, 'WA', $3, $4, $5, $5, NOW())
          ON CONFLICT (person_id, nilai) DO NOTHING
        `, [personId, TENANT, phone.no_hp, phone.label, phone.is_primary])
      }

      // Email sebagai kontak EMAIL
      if (email) {
        await db.query(`
          INSERT INTO crm_person_contacts (id, person_id, tenant_slug, jenis, nilai, label, is_primary, is_wa_aktif, created_at)
          VALUES (gen_random_uuid(), $1, $2, 'EMAIL', $3, 'email', false, false, NOW())
          ON CONFLICT (person_id, nilai) DO NOTHING
        `, [personId, TENANT, email.toLowerCase()])
      }

      // Tag otomatis: pernah_rkz / layanan_rkz → tag sumber
      if (catatan) {
        // simpan catatan sebagai keterangan — skip untuk sekarang
      }

    } catch (e: any) {
      console.warn(`  ⚠ Skip customer ${akarId} (${nama}): ${e.message}`)
      personSkip++
    }

    if ((personNew + personSkip) % 200 === 0) {
      process.stdout.write(`  ... ${personNew + personSkip}/${custRows.length}\r`)
    }
  }
  console.log(`  ✓ ${personNew} person baru, ${personSkip} dilewati`)

  // ────────────────────────────────────────
  // STEP 3: Customer Tags → PersonTag
  // ────────────────────────────────────────
  console.log('🏷️  Migrasi customer_tags → person_tags...')
  const custTagRows = extractInserts(sql, 'simkek_customer_tags')
  // Kolom: id, customer_id, tag_id, ...
  let tagLinkCount = 0

  for (const r of custTagRows) {
    // Format berbeda — bisa: id,customer_id,tag_id atau customer_id,tag_id
    // Deteksi dari panjang
    const [f1, f2, f3] = r
    const [custId, tagId] = r.length >= 3 ? [f2, f3] : [f1, f2]

    const personId = custIdMap.get(custId)
    const crmTagId = tagIdMap.get(tagId)
    if (!personId || !crmTagId) continue

    try {
      await db.query(`
        INSERT INTO crm_person_tags (id, person_id, tag_id, sumber, aktif, assigned_at)
        VALUES (gen_random_uuid(), $1, $2, 'akar_migrasi', true, NOW())
        ON CONFLICT (person_id, tag_id) DO NOTHING
      `, [personId, crmTagId])
      tagLinkCount++
    } catch {}
  }
  console.log(`  ✓ ${tagLinkCount} relasi person-tag`)

  // ────────────────────────────────────────
  // STEP 4: Kegiatan
  // ────────────────────────────────────────
  console.log('🎯 Migrasi kegiatan...')
  const kegiatanRows = extractInserts(sql, 'simkek_kegiatan')
  // Kolom: id, kode, nama_kegiatan, jenis_kegiatan_id, tanggal_mulai, tanggal_selesai,
  //        lokasi, penyelenggara, keterangan, status, qr_token, created_by, created_at, updated_at

  const jenisMap: Record<string, string> = {
    '1': 'Seminar / Webinar', '2': 'Penyuluhan Kesehatan',
    '3': 'Bakti Sosial',      '4': 'Pemeriksaan Gratis',
    '5': 'Pameran / Expo',    '6': 'Pelatihan',
    '7': 'Gathering',         '8': 'Lainnya',
  }

  const kegiatanIdMap = new Map<string, string>() // akar_id → crm uuid
  let kegiatanCount = 0

  for (const r of kegiatanRows) {
    const [akarId, kode, nama, jenisId, tglMulai, tglSelesai, lokasi, penyelenggara, keterangan, status, qrToken] = r
    if (!nama) continue

    // Skip baris header (parser kadang ikut baca baris pertama)
    if (kode === 'kode' || !tglMulai || tglMulai === 'tanggal_mulai') continue

    const res = await db.query(`
      INSERT INTO crm_kegiatan (
        id, tenant_slug, kode, nama, jenis, tanggal_mulai, tanggal_selesai,
        lokasi, penyelenggara, keterangan, poin_kegiatan, status, qr_token, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6,
        $7, $8, $9, 25, $10, $11, NOW(), NOW()
      )
      ON CONFLICT (qr_token) DO UPDATE SET nama = EXCLUDED.nama
      RETURNING id
    `, [
      TENANT, kode, nama,
      jenisMap[jenisId] || 'Lainnya',
      tglMulai,
      tglSelesai || null,
      lokasi     || null,
      penyelenggara || null,
      keterangan || null,
      status     || 'selesai',
      qrToken,
    ])

    kegiatanIdMap.set(akarId, res.rows[0].id)
    kegiatanCount++
  }
  console.log(`  ✓ ${kegiatanCount} kegiatan`)

  // ────────────────────────────────────────
  // STEP 5: Customer Kegiatan → KegiatanPeserta + LoyaltyTransaction
  // ────────────────────────────────────────
  console.log('🎫 Migrasi kehadiran kegiatan...')
  const custKegRows = extractInserts(sql, 'simkek_customer_kegiatan')
  // Kolom: id, customer_id, kegiatan_id, sumber_input, catatan, created_at

  let pesertaCount = 0, loyaltyCount = 0

  for (const r of custKegRows) {
    const [, custId, kegId, sumber, catatan] = r
    const personId   = custIdMap.get(custId)
    const kegiatanId = kegiatanIdMap.get(kegId)
    if (!personId || !kegiatanId) continue

    try {
      // KegiatanPeserta
      await db.query(`
        INSERT INTO crm_kegiatan_peserta (id, kegiatan_id, person_id, tenant_slug, hadir, poin_diberikan, sumber, catatan, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, true, 25, $4, $5, NOW())
        ON CONFLICT (kegiatan_id, person_id) DO NOTHING
      `, [kegiatanId, personId, TENANT, sumber === 'self' ? 'self' : 'migrasi', catatan || null])
      pesertaCount++

      // LoyaltyTransaction
      await db.query(`
        INSERT INTO crm_loyalty_transactions (id, tenant_slug, person_id, jenis, poin, ref_id, keterangan, created_at)
        VALUES (gen_random_uuid(), $1, $2, 'KEGIATAN', 25, $3, 'Migrasi dari Akar', NOW())
        ON CONFLICT DO NOTHING
      `, [TENANT, personId, kegiatanId])
      loyaltyCount++
    } catch {}
  }
  console.log(`  ✓ ${pesertaCount} peserta kegiatan, ${loyaltyCount} loyalty transactions`)

  await db.end()

  // ── Ringkasan ──
  console.log('\n✅ Migrasi Akar → RKZ selesai!')
  console.log(`   Persons    : ${personNew}`)
  console.log(`   Tags       : ${tagCount}`)
  console.log(`   Tag links  : ${tagLinkCount}`)
  console.log(`   Kegiatan   : ${kegiatanCount}`)
  console.log(`   Peserta    : ${pesertaCount}`)
  console.log(`   Poin       : ${loyaltyCount} transaksi`)
  console.log('\n   Akses CRM RKZ: http://localhost:3002/rkz')
  console.log('   Buat user admin: POST /api/admin/users')
}

main().catch(e => { console.error('\n❌ Error:', e.message); process.exit(1) })
