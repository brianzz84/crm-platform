/**
 * Uji deteksi calon duplikat + penandaan "bukan duplikat".
 *
 * Production tidak punya duplikat sungguhan, jadi deteksinya tidak akan pernah
 * terbukti jalan hanya dengan menjalankannya. Skrip ini membuat kemiripan SEMENTARA
 * pada dua person dummy, memastikan deteksi menangkapnya, lalu MENGEMBALIKAN nilai
 * aslinya — termasuk jika ada langkah yang gagal di tengah.
 *
 * Jalankan: DATABASE_URL="..." npx tsx scripts/uji-deteksi-duplikat.ts
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { cariCalonDuplikat, urutkanPasangan } from '../src/lib/person-merge'

const SLUG = 'rkz'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

let lolos = 0, gagal = 0
function periksa(nama: string, syarat: boolean, detail = '') {
  if (syarat) { console.log(`  ✓ ${nama}`); lolos++ }
  else        { console.log(`  ✗ ${nama} ${detail}`); gagal++ }
}

async function main() {
  const admin = await db.appUser.findFirst({ where: { tenant_slug: SLUG }, select: { id: true } })
  if (!admin) throw new Error('Tidak ada AppUser.')

  const [a, b] = await db.person.findMany({
    where: {
      tenant_slug: SLUG, simrs_patient_id: { startsWith: 'DUMMY-' },
      digabung_ke_person_id: null, tanggal_lahir: { not: null },
    },
    orderBy: { simrs_patient_id: 'asc' },
    take: 2,
  })
  if (!a || !b) throw new Error('Butuh 2 person dummy bertanggal lahir.')
  for (const p of [a, b]) {
    if (!p.simrs_patient_id?.startsWith('DUMMY-')) throw new Error('BATAL: person uji bukan dummy.')
  }

  // Simpan nilai asli untuk dikembalikan apa pun yang terjadi
  const asli = { no_hp: b.no_hp, tanggal_lahir: b.tanggal_lahir }
  const [pa, pb] = urutkanPasangan(a.id, b.id)

  console.log(`Person A: ${a.name} (HP ${a.no_hp}, lahir ${a.tanggal_lahir?.toISOString().slice(0, 10)})`)
  console.log(`Person B: ${b.name} (HP ${b.no_hp}, lahir ${b.tanggal_lahir?.toISOString().slice(0, 10)})\n`)

  try {
    // ── Sebelum: tidak boleh terdeteksi ──
    const sebelum = await cariCalonDuplikat(db, SLUG, 200)
    periksa('sebelum dimiripkan: pasangan ini belum terdeteksi',
      !sebelum.some(c => c.person_a_id === pa && c.person_b_id === pb))

    // ── Buat kemiripan: nomor HP DAN tanggal lahir sama ──
    console.log('\n→ Menyamakan nomor HP & tanggal lahir B dengan A (sementara)…')
    await db.person.update({
      where: { id: b.id },
      data:  { no_hp: a.no_hp, tanggal_lahir: a.tanggal_lahir },
    })

    const sesudah = await cariCalonDuplikat(db, SLUG, 200)
    const temuan  = sesudah.find(c => c.person_a_id === pa && c.person_b_id === pb)
    periksa('terdeteksi sebagai calon duplikat', !!temuan)
    periksa('keyakinan "sedang" (nomor+tgl lahir sama, tapi nama beda)',
      temuan?.keyakinan === 'sedang', `(dapat "${temuan?.keyakinan}")`)
    periksa('dasar menyebut nomor HP & tanggal lahir',
      temuan?.dasar === 'Nomor HP & tanggal lahir sama', `(dapat "${temuan?.dasar}")`)
    periksa('tiap pasangan hanya muncul sekali',
      sesudah.filter(c => c.person_a_id === pa && c.person_b_id === pb).length === 1)

    // ── Tandai bukan duplikat → harus hilang dari antrean ──
    console.log('\n→ Menandai "bukan duplikat"…')
    await db.personDuplikatDiabaikan.create({
      data: { tenant_slug: SLUG, person_a_id: pa, person_b_id: pb, alasan: 'UJI OTOMATIS', oleh: admin.id },
    })
    const setelahAbaikan = await cariCalonDuplikat(db, SLUG, 200)
    periksa('hilang dari antrean setelah ditandai bukan duplikat',
      !setelahAbaikan.some(c => c.person_a_id === pa && c.person_b_id === pb))

    await db.personDuplikatDiabaikan.deleteMany({
      where: { tenant_slug: SLUG, person_a_id: pa, person_b_id: pb, alasan: 'UJI OTOMATIS' },
    })
  } finally {
    // Pemulihan WAJIB jalan walau ada pemeriksaan yang gagal di atas
    console.log('\n→ Mengembalikan nilai asli person B…')
    await db.person.update({ where: { id: b.id }, data: asli })
    const cek = await db.person.findUnique({ where: { id: b.id } })
    periksa('nilai asli person B pulih',
      cek?.no_hp === asli.no_hp &&
      cek?.tanggal_lahir?.getTime() === asli.tanggal_lahir?.getTime())
  }

  console.log(`\n${gagal === 0 ? '✅ SEMUA LOLOS' : '❌ ADA YANG GAGAL'} — lolos ${lolos}, gagal ${gagal}`)
  if (gagal > 0) process.exit(1)
}

main()
  .catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
  .finally(() => db.$disconnect())
