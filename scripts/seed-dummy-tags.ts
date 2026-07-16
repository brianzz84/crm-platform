/**
 * Beri TAG ke pasien dummy (person bertanda simrs_patient_id 'DUMMY-%').
 *
 * ATURAN: hanya MENAMBAH baris crm_person_tags untuk person dummy.
 * Tidak pernah menyentuh person asli, tidak pernah mengubah master tag.
 *
 * Tag TIDAK diacak — diturunkan dari data pasien dummy itu sendiri supaya
 * konsisten secara klinis, sehingga pencarian lintas-sumber AI benar-benar
 * bermakna saat diuji (mis. "Nakes yang juga pasien Kardiologi").
 *
 * Hapus: DELETE FROM crm_person_tags WHERE person_id IN
 *          (SELECT id FROM crm_persons WHERE simrs_patient_id LIKE 'DUMMY-%');
 *
 * Uji: DRY_RUN=1 DATABASE_URL="..." npx tsx scripts/seed-dummy-tags.ts
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const SLUG = 'rkz'
const DRY_RUN = process.env.DRY_RUN === '1'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

// poli kunjungan → nama tag spesialisasi
const POLI_KE_TAG: Record<string, string> = {
  'Poli Jantung':        'Kardiologi',
  'Poli Kulit':          'Dermatologi',
  'Poli Anak':           'Pediatri',
  'Poli Gigi':           'Gigi & Mulut',
  'Poli Bedah':          'Orthopedi',
  'Poli Kandungan':      'Kebidanan',
  'Poli Saraf':          'Neurologi',
  'Poli Mata':           'Oftalmologi',
  'Poli Penyakit Dalam': 'Kesehatan Umum',
  'Poli Paru':           'Kesehatan Umum',
  'Radiologi':           'Radiologi',
}
// unit kunjungan → nama tag
const UNIT_KE_TAG: Record<string, string> = {
  PONDOK_SEHAT: 'Medical Check-up',
  RAWAT_INAP:   'Rawat Inap',
  RAWAT_JALAN:  'Rawat Jalan',
}
const ASURANSI_SWASTA = ['Prudential', 'Allianz', 'AXA Mandiri']

async function main() {
  console.log(DRY_RUN ? '[DRY_RUN] tidak akan menulis apa pun\n' : '')

  const tags = await db.tag.findMany({ where: { tenant_slug: SLUG, aktif: true }, select: { id: true, name: true } })
  const tagId = new Map(tags.map(t => [t.name, t.id]))

  // Pastikan semua tag yang akan dipakai memang ada — jangan buat tag baru.
  const dibutuhkan = [...new Set([...Object.values(POLI_KE_TAG), ...Object.values(UNIT_KE_TAG), 'Nakes', 'Awam', 'Geriatri', 'Asuransi'])]
  const hilang = dibutuhkan.filter(n => !tagId.has(n))
  if (hilang.length) throw new Error(`Tag tidak ada di master: ${hilang.join(', ')} — batal.`)

  const pasien = await db.person.findMany({
    where:  { tenant_slug: SLUG, simrs_patient_id: { startsWith: 'DUMMY-' } },
    select: {
      id: true, pekerjaan: true, tanggal_lahir: true,
      visits: { select: { unit: true, poli: true, nama_instansi: true } },
    },
  })
  console.log(`Pasien dummy ditemukan: ${pasien.length}`)
  if (!pasien.length) throw new Error('Tidak ada pasien dummy — jalankan seed-dummy-pasien.ts dulu.')

  const now  = new Date()
  const baris: { person_id: string; tag_id: string; sumber: any; aktif: boolean; assigned_at: Date }[] = []

  for (const p of pasien) {
    const namaTag = new Set<string>()

    // 1. Profesi — Nakes vs Awam (dari pekerjaan)
    namaTag.add(['Dokter', 'Perawat'].includes(p.pekerjaan ?? '') ? 'Nakes' : 'Awam')

    // 2. Usia lanjut → Geriatri
    if (p.tanggal_lahir) {
      const usia = (now.getTime() - p.tanggal_lahir.getTime()) / (365.25 * 86400000)
      if (usia > 60) namaTag.add('Geriatri')
    }

    // 3. Turunan dari kunjungan: unit, poli, asuransi
    for (const v of p.visits) {
      const tUnit = UNIT_KE_TAG[v.unit as string]
      if (tUnit) namaTag.add(tUnit)
      if (v.poli && POLI_KE_TAG[v.poli]) namaTag.add(POLI_KE_TAG[v.poli])
      if (v.nama_instansi && ASURANSI_SWASTA.includes(v.nama_instansi)) namaTag.add('Asuransi')
    }

    for (const n of namaTag) {
      baris.push({ person_id: p.id, tag_id: tagId.get(n)!, sumber: 'simrs_sync', aktif: true, assigned_at: now })
    }
  }

  // Ringkasan distribusi
  const perTag = baris.reduce((a: any, b) => {
    const nama = tags.find(t => t.id === b.tag_id)!.name
    a[nama] = (a[nama] ?? 0) + 1; return a
  }, {})
  console.log(`\nAkan menambah ${baris.length} penandaan tag (rata-rata ${(baris.length / pasien.length).toFixed(1)} tag/pasien):`)
  for (const [k, v] of Object.entries(perTag).sort((a: any, b: any) => b[1] - a[1])) {
    console.log(`  ${String(k).padEnd(20)} ${v}`)
  }

  if (DRY_RUN) { console.log('\n[DRY_RUN] Selesai — tidak ada yang ditulis.'); return }

  const BATCH = 300
  for (let i = 0; i < baris.length; i += BATCH) {
    await db.personTag.createMany({ data: baris.slice(i, i + BATCH), skipDuplicates: true })
    process.stdout.write(`  tersimpan ${Math.min(i + BATCH, baris.length)}/${baris.length}\r`)
  }
  console.log(`\n\nSelesai. Total baris crm_person_tags sekarang: ${await db.personTag.count()}`)
}

main()
  .catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
  .finally(() => db.$disconnect())
