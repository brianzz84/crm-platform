/**
 * Uji tools diagnostik SIMRS — end-to-end, HANYA terhadap DB lokal (bukan production),
 * memakai SIMRS_MOCK=true supaya tidak butuh API SIMRS sungguhan.
 *
 * Menguji: panggilan berhasil + laporan validasi field, batas laju (rate limit),
 * dan memastikan log yang tersimpan TIDAK memuat data pasien mentah.
 *
 * Jalankan: SIMRS_MOCK=true DATABASE_URL="postgresql://atc_user:atc_dev_password@localhost:5432/crm_rkz" npx tsx scripts/uji-diagnostik-simrs.ts
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { jalankanDiagnostikSimrs } from '../src/lib/simrs-diagnostik'

const SLUG = 'rkz'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

let lolos = 0, gagal = 0
function periksa(nama: string, syarat: boolean, detail = '') {
  if (syarat) { console.log(`  ✓ ${nama}`); lolos++ }
  else        { console.log(`  ✗ ${nama} ${detail}`); gagal++ }
}

async function main() {
  if (process.env.SIMRS_MOCK !== 'true') throw new Error('BATAL: jalankan dengan SIMRS_MOCK=true')
  if (!process.env.DATABASE_URL?.includes('localhost')) throw new Error('BATAL: skrip ini hanya untuk DB lokal, DATABASE_URL harus localhost')

  const admin = await db.appUser.findFirst({ where: { tenant_slug: SLUG }, select: { id: true } })
  if (!admin) throw new Error('Tidak ada AppUser di DB lokal.')

  // Bersihkan log lama supaya penghitungan rate limit bisa diuji dari nol
  await db.simrsDiagnostikLog.deleteMany({ where: { tenant_slug: SLUG } })

  // ── 1. Uji jenis 'kunjungan' ──
  console.log('→ Uji endpoint kunjungan (mock)...')
  const hasilKunjungan = await jalankanDiagnostikSimrs(db, db as any, SLUG, 'kunjungan', { tanggal: '2026-07-20' }, admin.id)
  periksa('berhasil', hasilKunjungan.berhasil === true)
  periksa('status HTTP 200 (mock)', hasilKunjungan.statusHttp === 200)
  periksa('ada data raw', Array.isArray((hasilKunjungan.raw as any)?.data))
  periksa('validasi mengenali jumlah baris', (hasilKunjungan.validasi?.jumlahBaris ?? 0) > 0)
  // Mock generator sengaja set tindakan_kode selalu null -> harus muncul di fieldKosongPenting
  periksa('tindakan_kode kosong terdeteksi sebagai "penting kosong" (mock memang begitu)',
    hasilKunjungan.validasi?.fieldKosongPenting.some(f => f.field === 'tindakan_kode') === true,
    `(dapat ${JSON.stringify(hasilKunjungan.validasi?.fieldKosongPenting)})`)
  periksa('tidak ada field wajib yang hilang (mock lengkap)', hasilKunjungan.validasi?.fieldHilang.length === 0)
  periksa('tidak ada field asing (mock cocok skema)', hasilKunjungan.validasi?.fieldAsing.length === 0,
    `(dapat ${JSON.stringify(hasilKunjungan.validasi?.fieldAsing)})`)

  // ── 2. Uji jenis 'pasien' ──
  console.log('\n→ Uji endpoint pasien (mock)...')
  const hasilPasien = await jalankanDiagnostikSimrs(db, db as any, SLUG, 'pasien', { no_rm: 'RM100005' }, admin.id)
  periksa('mock pasien mengembalikan data (bukan lagi "tidak disimulasikan")', hasilPasien.berhasil === true)
  periksa('validasi pasien: tidak ada field wajib hilang', hasilPasien.validasi?.fieldHilang.length === 0)
  periksa('validasi pasien: tidak ada field asing (mock cocok skema pasien)',
    hasilPasien.validasi?.fieldAsing.length === 0, `(dapat ${JSON.stringify(hasilPasien.validasi?.fieldAsing)})`)

  // ── 3. Log tersimpan TANPA data mentah ──
  console.log('\n→ Memeriksa isi log tersimpan...')
  const logs = await db.simrsDiagnostikLog.findMany({ where: { tenant_slug: SLUG }, orderBy: { created_at: 'asc' } })
  periksa('2 baris log tercatat (kunjungan + pasien)', logs.length === 2, `(dapat ${logs.length})`)
  const logStr = JSON.stringify(logs)
  periksa('log TIDAK memuat nama pasien mock manapun (mis. "Budi Santoso")', !logStr.includes('Budi Santoso'))
  periksa('log TIDAK memuat field "nama_pasien" (bukti tidak menyimpan raw)', !logStr.includes('nama_pasien'))
  periksa('log kunjungan mencatat field_kosong via field_hilang kosong tapi jumlah_baris terisi',
    logs[0].jumlah_baris !== null && logs[0].jumlah_baris > 0)
  periksa('dilakukan_oleh tercatat benar', logs.every(l => l.dilakukan_oleh === admin.id))

  // ── 4. Batas laju (rate limit) ──
  console.log('\n→ Menguji batas laju (maks 10 per 5 menit)...')
  let kenaLimit = false
  for (let i = 0; i < 10; i++) {
    try {
      await jalankanDiagnostikSimrs(db, db as any, SLUG, 'kunjungan', { tanggal: '2026-07-20' }, admin.id)
    } catch (e) {
      kenaLimit = true
      periksa('pesan batas laju jelas', e instanceof Error && e.message.includes('Terlalu sering'), `(dapat "${(e as Error).message}")`)
      break
    }
  }
  periksa('batas laju benar-benar tercapai dalam 10 percobaan tambahan', kenaLimit)

  const totalLogAkhir = await db.simrsDiagnostikLog.count({ where: { tenant_slug: SLUG } })
  console.log(`  (total log setelah uji rate limit: ${totalLogAkhir})`)

  // Bersihkan jejak uji supaya tidak mengotori riwayat asli
  await db.simrsDiagnostikLog.deleteMany({ where: { tenant_slug: SLUG } })

  console.log(`\n${gagal === 0 ? '✅ SEMUA LOLOS' : '❌ ADA YANG GAGAL'} — lolos ${lolos}, gagal ${gagal}`)
  if (gagal > 0) process.exit(1)
}

main()
  .catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
  .finally(() => db.$disconnect())
