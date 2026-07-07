/**
 * Script migrasi lanjutan: Kegiatan + KegiatanPeserta + LoyaltyTransaction
 * Dijalankan setelah migrate-akar.ts (persons sudah masuk)
 * Jalankan: npx tsx scripts/migrate-akar-kegiatan.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { Client } from 'pg'

const RKZ_DB_URL = 'postgresql://atc_user:atc_dev_password@localhost:5432/crm_tenant_rkz'
const SQL_FILE   = path.join(process.cwd(), '..', 'Downloads', 'simkek.sql')
const TENANT     = 'rkz'

function extractInserts(sql: string, tableName: string): string[][] {
  const tableRegex = new RegExp(
    `INSERT INTO \`${tableName}\`[^;]+?VALUES\\s*([\\s\\S]+?);\\s*(?:--|$)`,
    'gi'
  )
  const rows: string[][] = []
  let match: RegExpExecArray | null
  while ((match = tableRegex.exec(sql)) !== null) {
    const valuesBlock = match[1]
    const rowRegex = /\(([^)]+)\)/g
    let rowMatch: RegExpExecArray | null
    while ((rowMatch = rowRegex.exec(valuesBlock)) !== null) {
      rows.push(parseRow(rowMatch[1]))
    }
  }
  return rows
}

function parseRow(raw: string): string[] {
  const cells: string[] = []
  let cur = '', inStr = false, i = 0
  while (i < raw.length) {
    const ch = raw[i]
    if (!inStr && ch === "'") { inStr = true; i++; continue }
    if (inStr && ch === "'" && raw[i + 1] === "'") { cur += "'"; i += 2; continue }
    if (inStr && ch === "'") { inStr = false; i++; continue }
    if (!inStr && ch === ',') { cells.push(cur.trim()); cur = ''; i++; continue }
    cur += ch; i++
  }
  cells.push(cur.trim())
  return cells.map(c => c === 'NULL' ? '' : c)
}

async function main() {
  console.log('📂 Membaca simkek.sql...')
  const sql = fs.readFileSync(SQL_FILE, 'utf-8')

  const db = new Client({ connectionString: RKZ_DB_URL })
  await db.connect()

  // ── Rebuild map dari DB ──
  console.log('🗺️  Rebuild ID maps dari DB...')

  // custIdMap: akar_integer_id → crm_uuid
  // akar_kode disimpan sebagai "CST20260001" → ambil nomor urut dari kode
  const personsInDb = await db.query(
    `SELECT id, akar_kode FROM crm_persons WHERE tenant_slug = $1 AND akar_kode IS NOT NULL`,
    [TENANT]
  )
  const custIdMap = new Map<string, string>()
  // Parse akar int id dari customers sql untuk matching
  const custRows = extractInserts(sql, 'simkek_customers')
  for (const r of custRows) {
    const [akarId, kode] = r
    if (!akarId || !kode || kode === 'kode') continue
    const found = personsInDb.rows.find((p: any) => p.akar_kode === kode)
    if (found) custIdMap.set(akarId, found.id)
  }
  console.log(`  ✓ ${custIdMap.size} customers mapped`)

  // ── Kegiatan ──
  console.log('🎯 Migrasi kegiatan...')
  const jenisMap: Record<string, string> = {
    '1': 'Seminar / Webinar', '2': 'Penyuluhan Kesehatan',
    '3': 'Bakti Sosial',      '4': 'Pemeriksaan Gratis',
    '5': 'Pameran / Expo',    '6': 'Pelatihan',
    '7': 'Gathering',         '8': 'Lainnya',
  }

  const kegiatanRows = extractInserts(sql, 'simkek_kegiatan')
  const kegiatanIdMap = new Map<string, string>()
  let kegiatanCount = 0

  for (const r of kegiatanRows) {
    const [akarId, kode, nama, jenisId, tglMulai, tglSelesai, lokasi, penyelenggara, keterangan, status, qrToken] = r
    if (!nama || !tglMulai || kode === 'kode') continue

    const res = await db.query(`
      INSERT INTO crm_kegiatan (
        id, tenant_slug, kode, nama, jenis,
        tanggal_mulai, tanggal_selesai, lokasi, penyelenggara,
        keterangan, poin_kegiatan, status, qr_token, created_at, updated_at
      ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, 25, $10, $11, NOW(), NOW())
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

  // ── KegiatanPeserta + LoyaltyTransaction ──
  console.log('🎫 Migrasi kehadiran + poin...')
  const custKegRows = extractInserts(sql, 'simkek_customer_kegiatan')
  let pesertaCount = 0, skipCount = 0

  for (const r of custKegRows) {
    const [, custId, kegId, sumber, catatan] = r
    const personId   = custIdMap.get(custId)
    const kegiatanId = kegiatanIdMap.get(kegId)
    if (!personId || !kegiatanId) { skipCount++; continue }

    try {
      await db.query(`
        INSERT INTO crm_kegiatan_peserta (id, kegiatan_id, person_id, tenant_slug, hadir, poin_diberikan, sumber, catatan, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, true, 25, 'migrasi', $4, NOW())
        ON CONFLICT (kegiatan_id, person_id) DO NOTHING
      `, [kegiatanId, personId, TENANT, catatan || null])

      await db.query(`
        INSERT INTO crm_loyalty_transactions (id, tenant_slug, person_id, jenis, poin, ref_id, keterangan, created_at)
        VALUES (gen_random_uuid(), $1, $2, 'KEGIATAN', 25, $3, 'Migrasi dari Akar', NOW())
      `, [TENANT, personId, kegiatanId])

      pesertaCount++
    } catch { skipCount++ }
  }
  console.log(`  ✓ ${pesertaCount} kehadiran, ${skipCount} dilewati`)

  await db.end()

  console.log('\n✅ Migrasi kegiatan selesai!')
  console.log(`   Kegiatan : ${kegiatanCount}`)
  console.log(`   Peserta  : ${pesertaCount}`)
}

main().catch(e => { console.error('\n❌ Error:', e.message, e.stack); process.exit(1) })
