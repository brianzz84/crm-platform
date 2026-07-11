/**
 * Import ICD-10-CM ke crm_icd_library_global
 * Strategi: query per 3-char prefix (A00-Z99) untuk melewati batas offset 7500 NLM API
 */
import { Client } from 'pg'

const DB_URL = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || ''
const API    = 'https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search'

function getBab(kode: string): string {
  const k = kode.toUpperCase()
  const c = k[0]
  const n = parseInt(k.slice(1, 3))
  if (c === 'A' || c === 'B') return 'I - Penyakit Infeksi & Parasit'
  if (c === 'C' || (c === 'D' && n <= 49)) return 'II - Neoplasma'
  if (c === 'D' && n >= 50) return 'III - Penyakit Darah'
  if (c === 'E') return 'IV - Penyakit Endokrin & Metabolik'
  if (c === 'F') return 'V - Gangguan Mental'
  if (c === 'G') return 'VI - Penyakit Sistem Saraf'
  if (c === 'H' && n <= 59) return 'VII - Penyakit Mata'
  if (c === 'H' && n >= 60) return 'VIII - Penyakit Telinga'
  if (c === 'I') return 'IX - Penyakit Sistem Sirkulasi'
  if (c === 'J') return 'X - Penyakit Sistem Pernapasan'
  if (c === 'K') return 'XI - Penyakit Sistem Pencernaan'
  if (c === 'L') return 'XII - Penyakit Kulit'
  if (c === 'M') return 'XIII - Penyakit Muskuloskeletal'
  if (c === 'N') return 'XIV - Penyakit Sistem Genitourinari'
  if (c === 'O') return 'XV - Kehamilan & Persalinan'
  if (c === 'P') return 'XVI - Kondisi Perinatal'
  if (c === 'Q') return 'XVII - Malformasi Kongenital'
  if (c === 'R') return 'XVIII - Gejala & Tanda Abnormal'
  if (c === 'S' || c === 'T') return 'XIX - Cedera & Keracunan'
  if (c === 'V' || c === 'W' || c === 'X' || c === 'Y') return 'XX - Penyebab Eksternal'
  if (c === 'Z') return 'XXI - Faktor Status Kesehatan'
  return 'Lainnya'
}

// Generate semua prefix 3-char: A00-Z99
function generatePrefixes(): string[] {
  const prefixes: string[] = []
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    for (let n = 0; n <= 99; n++) {
      prefixes.push(`${letter}${String(n).padStart(2, '0')}`)
    }
  }
  return prefixes
}

async function fetchByPrefix(prefix: string): Promise<{ code: string; name: string }[]> {
  const url = `${API}?sf=code&maxList=500&terms=${prefix}`
  const res  = await fetch(url)
  const text = await res.text()
  let json: any
  try { json = JSON.parse(text) } catch { return [] }
  if (!json[3]) return []
  return json[3].map((row: string[]) => ({ code: row[0], name: row[1] }))
}

async function insertBatch(db: Client, rows: { code: string; name: string }[]) {
  if (rows.length === 0) return
  const values: any[] = []
  const placeholders = rows.map((r, idx) => {
    const base = idx * 4
    values.push(r.code, r.name, r.name, getBab(r.code))
    return `(gen_random_uuid(), $${base+1}, $${base+2}, $${base+3}, $${base+4}, 'ICD10', true)`
  })
  await db.query(
    `INSERT INTO crm_icd_library_global (id, kode, nama, nama_id, bab, versi, aktif)
     VALUES ${placeholders.join(',')}
     ON CONFLICT (kode) DO UPDATE SET nama = EXCLUDED.nama, nama_id = EXCLUDED.nama_id, bab = EXCLUDED.bab`,
    values
  )
}

async function main() {
  const db = new Client({ connectionString: DB_URL })
  await db.connect()

  // Cek kode terakhir untuk resume
  const resumeRes = await db.query(`SELECT MAX(kode) AS last_kode, COUNT(*) AS cnt FROM crm_icd_library_global`)
  const lastKode  = resumeRes.rows[0].last_kode as string | null
  const existingCnt = parseInt(resumeRes.rows[0].cnt)
  console.log(`📋 Sudah ada: ${existingCnt} kode di DB`)

  const prefixes = generatePrefixes()

  // Resume: skip prefix yang sudah selesai
  let startIdx = 0
  if (lastKode) {
    const lastPrefix = lastKode.slice(0, 3).toUpperCase()
    const idx = prefixes.indexOf(lastPrefix)
    if (idx >= 0) { startIdx = idx; console.log(`⏩ Resume dari prefix ${lastPrefix} (idx ${idx})`) }
  }

  let total = existingCnt
  let prefixDone = startIdx

  for (let i = startIdx; i < prefixes.length; i++) {
    const prefix = prefixes[i]
    const rows = await fetchByPrefix(prefix)

    // Filter hanya kode yang dimulai dengan prefix ini (bukan substring match)
    const exact = rows.filter(r => r.code.toUpperCase().startsWith(prefix))
    if (exact.length > 0) {
      await insertBatch(db, exact)
      total += exact.length
    }

    prefixDone++
    process.stdout.write(`\r  [${prefixDone}/${prefixes.length} prefix] ~${total} kode — ${prefix}   `)
  }

  const finalRes = await db.query('SELECT COUNT(*) FROM crm_icd_library_global')
  console.log(`\n\n✅ Selesai! Total di DB: ${finalRes.rows[0].count} kode ICD-10`)
  await db.end()
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1) })
