/**
 * Isi nomor HP SINTETIS ke person dummy, supaya bisa dipakai menguji
 * campaign/broadcast (perlu nomor untuk mencocokkan penerima & balasan chat).
 *
 * ATURAN PENTING:
 * - HANYA menyentuh baris ber-`simrs_patient_id` awalan 'DUMMY-'. Skrip berhenti
 *   (throw) kalau menemukan target di luar itu. Tidak ada person asli tersentuh.
 * - Nomor memakai blok 0899900xxxx / 0899901xxxx yang sudah diverifikasi TIDAK
 *   dipakai person mana pun di DB (nol tabrakan).
 * - Nomor ini tetap TIDAK BOLEH dikirimi pesan sungguhan: 0899 adalah awalan
 *   operator asli, jadi bisa saja milik orang tak dikenal di dunia nyata.
 *   Pencegahnya ada di src/lib/test-data-guard.ts, yang mencegat person dummy
 *   di semua jalur kirim (broadcast + worker sapaan). Jangan hapus pengaman itu.
 *
 * Uji tanpa menulis: DRY_RUN=1 DATABASE_URL="..." npx tsx scripts/backfill-hp-dummy.ts
 * Jalankan:          DATABASE_URL="..." npx tsx scripts/backfill-hp-dummy.ts
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { PENANDA_PERSON_UJI } from '../src/lib/test-data-guard'

const SLUG = 'rkz'
const DRY_RUN = process.env.DRY_RUN === '1'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

// Satu dari sekian person dummy diberi nomor alternatif (no_hp_2), meniru kasus
// nyata: nomor yang terdaftar milik keluarga/wali, bukan pasien sendiri.
const SETIAP_KE = 23

function nomorUtama(urut: string)     { return `0899900${urut}` }   // 08999000001..08999000450
function nomorAlternatif(urut: string) { return `0899901${urut}` }  // 08999010001..

function labelAlternatif(jk: string | null, usia: number | null): string {
  if (usia !== null && usia < 17) return 'HP Orang Tua'
  if (jk === 'L') return 'HP Istri'
  if (jk === 'P') return 'HP Suami'
  return 'HP Keluarga'
}

function usiaDari(tglLahir: Date | null): number | null {
  if (!tglLahir) return null
  return Math.floor((Date.now() - tglLahir.getTime()) / (365.25 * 24 * 3600 * 1000))
}

async function main() {
  if (DRY_RUN) console.log('[DRY_RUN] tidak akan menulis apa pun\n')

  const target = await db.person.findMany({
    where:  { tenant_slug: SLUG, simrs_patient_id: { startsWith: PENANDA_PERSON_UJI } },
    select: { id: true, name: true, simrs_patient_id: true, jenis_kelamin: true, tanggal_lahir: true, no_hp: true, no_hp_2: true },
    orderBy: { simrs_patient_id: 'asc' },
  })

  if (target.length === 0) throw new Error('Tidak ada person dummy — batal.')

  // Sabuk pengaman: pastikan tidak ada satu pun target di luar penanda dummy.
  const nyasar = target.filter(p => !p.simrs_patient_id?.startsWith(PENANDA_PERSON_UJI))
  if (nyasar.length > 0) {
    throw new Error(`BATAL: ${nyasar.length} target bukan person dummy. Query salah, jangan diteruskan.`)
  }

  const totalPerson = await db.person.count({ where: { tenant_slug: SLUG } })
  console.log(`Person dummy target : ${target.length}`)
  console.log(`Person lain (AMAN)  : ${totalPerson - target.length}\n`)

  const sudahPunya = target.filter(p => p.no_hp).length
  if (sudahPunya > 0) console.log(`Catatan: ${sudahPunya} sudah punya no_hp, akan ditimpa dengan pola sintetis.\n`)

  type Ubah = { id: string; nama: string; no_hp: string; no_hp_2: string | null; label: string | null }
  const rencana: Ubah[] = target.map((p, i) => {
    const urut  = p.simrs_patient_id!.slice(PENANDA_PERSON_UJI.length)   // '0001'
    const pakai = (i + 1) % SETIAP_KE === 0
    return {
      id:      p.id,
      nama:    p.name,
      no_hp:   nomorUtama(urut),
      no_hp_2: pakai ? nomorAlternatif(urut) : null,
      label:   pakai ? labelAlternatif(p.jenis_kelamin, usiaDari(p.tanggal_lahir)) : null,
    }
  })

  const jmlAlternatif = rencana.filter(r => r.no_hp_2).length
  console.log(`Akan diisi: ${rencana.length} nomor utama, ${jmlAlternatif} nomor alternatif`)
  console.log('\nContoh 5 baris pertama:')
  for (const r of rencana.slice(0, 5)) {
    console.log(`  ${r.nama.padEnd(24)} ${r.no_hp}${r.no_hp_2 ? `  + ${r.no_hp_2} (${r.label})` : ''}`)
  }
  console.log('\nContoh yang dapat nomor alternatif:')
  for (const r of rencana.filter(x => x.no_hp_2).slice(0, 5)) {
    console.log(`  ${r.nama.padEnd(24)} ${r.no_hp}  + ${r.no_hp_2} (${r.label})`)
  }

  if (DRY_RUN) { console.log('\n[DRY_RUN] Selesai — tidak ada yang ditulis.'); return }

  let n = 0
  for (const r of rencana) {
    await db.person.update({
      where: { id: r.id },
      data:  { no_hp: r.no_hp, no_hp_2: r.no_hp_2, no_hp_2_label: r.label },
    })
    if (++n % 50 === 0) process.stdout.write(`  tersimpan ${n}/${rencana.length}\r`)
  }

  // Verifikasi sesudah tulis
  const [dummyPunyaHp, asliTersentuh] = await Promise.all([
    db.person.count({ where: { tenant_slug: SLUG, simrs_patient_id: { startsWith: PENANDA_PERSON_UJI }, no_hp: { not: null } } }),
    db.person.count({ where: { tenant_slug: SLUG, no_hp: { startsWith: '0899900' }, NOT: { simrs_patient_id: { startsWith: PENANDA_PERSON_UJI } } } }),
  ])
  console.log(`\n\nSelesai.`)
  console.log(`  person dummy punya no_hp : ${dummyPunyaHp}/${target.length}`)
  console.log(`  person NON-dummy kena nomor sintetis : ${asliTersentuh} (harus 0)`)
  if (asliTersentuh > 0) throw new Error('BAHAYA: ada person non-dummy memakai nomor sintetis. Periksa segera.')
}

main()
  .catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
  .finally(() => db.$disconnect())
