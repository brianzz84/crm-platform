/**
 * Enrich crm_simrs_layanan_library.nama_generik via Claude Haiku.
 * Batch 50 baris per request. Skip yang sudah punya nama_generik.
 * Jalankan: DATABASE_PUBLIC_URL="..." ANTHROPIC_API_KEY="..." npx tsx scripts/enrich-layanan-generik.ts
 */
import { Client } from 'pg'
import Anthropic from '@anthropic-ai/sdk'

const DB_URL = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL!
const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const BATCH = 50

async function enrichBatch(rows: { id: string; nama: string; kelompok: string; jenis: string }[]) {
  const list = rows.map((r, i) =>
    `${i + 1}. [${r.kelompok} / ${r.jenis}] "${r.nama}"`
  ).join('\n')

  const msg = await ai.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Kamu adalah ahli terminologi medis Indonesia. Berikut daftar nama layanan/tindakan dari sistem kasir rumah sakit (sering disingkat atau tidak baku). Tugas kamu: tulis nama medis generik yang baku dan mudah dipahami (bahasa Indonesia yang umum digunakan di dunia medis).

Aturan:
- Jika nama sudah baku, tulis ulang dengan kapitalisasi yang benar
- Jika singkatan, expand ke nama lengkap yang baku
- Jika ada angka atau kode prefix (1, 2, X, Z, dst), abaikan
- Gunakan ejaan Indonesia standar (Hemodialisis bukan Haemodialysis)
- Maksimal 60 karakter
- Hanya tulis nama generiknya saja, tanpa penjelasan

Format output WAJIB: satu baris per item, dengan format:
1. [nama generik]
2. [nama generik]
dst.

Daftar:
${list}`,
    }],
  })

  const text = (msg.content[0] as any).text as string
  const lines = text.trim().split('\n').filter(l => l.match(/^\d+\./))
  return lines.map(l => l.replace(/^\d+\.\s*/, '').trim())
}

async function main() {
  const db = new Client({ connectionString: DB_URL })
  await db.connect()
  console.log('✓ Terhubung ke DB')

  const { rows: pending } = await db.query(
    `SELECT id, nama, kelompok, jenis FROM crm_simrs_layanan_library
     WHERE aktif = true AND nama_generik IS NULL
     ORDER BY kelompok, jenis, nama`
  )
  console.log(`Perlu dienrich: ${pending.length} baris`)

  let done = 0
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH)
    try {
      const names = await enrichBatch(batch)

      for (let j = 0; j < batch.length; j++) {
        const generik = names[j]?.replace(/^["']|["']$/g, '').trim()
        if (generik && generik.length > 0 && generik.length <= 120) {
          await db.query(
            'UPDATE crm_simrs_layanan_library SET nama_generik = $1 WHERE id = $2',
            [generik, batch[j].id]
          )
        }
      }
      done += batch.length
      process.stdout.write(`\r  Progress: ${done}/${pending.length} (${Math.round(done/pending.length*100)}%)  `)
    } catch (e: any) {
      console.error(`\n⚠ Batch ${i}-${i+BATCH} error:`, e.message)
    }
    // Jeda kecil agar tidak hit rate limit
    await new Promise(r => setTimeout(r, 500))
  }

  const { rows: result } = await db.query(
    `SELECT COUNT(*) FILTER (WHERE nama_generik IS NOT NULL) AS filled,
            COUNT(*) AS total
     FROM crm_simrs_layanan_library WHERE aktif = true`
  )
  console.log(`\n✅ Selesai! ${result[0].filled}/${result[0].total} baris punya nama_generik`)
  await db.end()
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
