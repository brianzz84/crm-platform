/**
 * Uji logika evaluasi campaign terhadap data dummy — membandingkan hasil fungsi
 * dengan angka yang SUDAH DIKETAHUI PERSIS dari scripts/seed-dummy-campaign.ts.
 *
 * Ini bukan cuma "jalankan dan lihat", tapi pencocokan ke angka yang sudah dihafal
 * dari skenario seed: 40 penerima, kirim_dua_nomor, KODE_VIT_B='4419' dipromosikan,
 * KODE_INFUS='4417' konversi produk lain, dst.
 *
 * Jalankan: DATABASE_URL="..." npx tsx scripts/uji-evaluasi-campaign.ts
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { hitungEvaluasiCampaign } from '../src/lib/campaign-evaluasi'

const SLUG = 'rkz'
const NAMA_CAMPAIGN = '[DUMMY] Promo Suntik Vit. B Kompleks — Maret 2026'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

let lolos = 0, gagal = 0
function periksa(nama: string, syarat: boolean, detail = '') {
  if (syarat) { console.log(`  ✓ ${nama}`); lolos++ }
  else        { console.log(`  ✗ ${nama} ${detail}`); gagal++ }
}

async function main() {
  const campaign = await db.campaign.findFirst({ where: { tenant_slug: SLUG, nama: NAMA_CAMPAIGN } })
  if (!campaign) throw new Error('Campaign dummy tidak ditemukan — jalankan seed-dummy-campaign.ts dulu.')

  console.log(`Campaign: ${campaign.nama}`)
  console.log(`kode_layanan_promo: ${JSON.stringify(campaign.kode_layanan_promo)}\n`)
  periksa('kode_layanan_promo terisi ["4419"]',
    JSON.stringify(campaign.kode_layanan_promo) === '["4419"]',
    `(dapat ${JSON.stringify(campaign.kode_layanan_promo)})`)

  // ── Jendela lebar (180 hari) — supaya SEMUA konversi (H+12 s/d H+40) masuk ──
  const hasil = await hitungEvaluasiCampaign(db, SLUG, campaign.id, 180)

  console.log('\n=== FUNNEL ===')
  console.log(hasil.funnel)
  periksa('total penerima 42 (40 utama + 2 alternatif)', hasil.funnel.totalPenerima === 42, `(dapat ${hasil.funnel.totalPenerima})`)
  periksa('gagal 3 (idx 37-39)', hasil.funnel.gagal === 3, `(dapat ${hasil.funnel.gagal})`)
  // Dihitung persis dari RENCANA di seed-dummy-campaign.ts: idx dengan `balas` terisi
  // = 0,2,3,5,6,7,8,9,10,11,12,13 → 12 baris. idx1 (py alt) & idx4 SENGAJA tanpa balasan.
  periksa('dibalas persis 12 (dihitung dari RENCANA di seed)', hasil.funnel.dibalas === 12, `(dapat ${hasil.funnel.dibalas})`)
  periksa('tidakMembalas persis terkirim - dibalas (27)', hasil.funnel.tidakMembalas === hasil.funnel.terkirim - hasil.funnel.dibalas,
    `(dapat ${hasil.funnel.tidakMembalas}, terkirim=${hasil.funnel.terkirim}, dibalas=${hasil.funnel.dibalas})`)
  periksa('dibalas + tidakMembalas = terkirim (tidak ada yang tercecer/dobel hitung)',
    hasil.funnel.dibalas + hasil.funnel.tidakMembalas === hasil.funnel.terkirim)
  periksa('ada rincian error 131026', hasil.funnel.errorBreakdown.some(e => e.kode === 'meta_error'))

  console.log('\n=== KONVERSI (satu baris PER KUNJUNGAN — populasi dummy 450 orang punya ~126')
  console.log('kunjungan acak lain dari seed-dummy-pasien.ts yang kebetulan jatuh di jendela ini,')
  console.log('jadi total baris > 4 itu WAJAR, bukan bug — selama 4 kunjungan yang benar-benar')
  console.log('disuntikkan campaign ini tetap ketemu dan terklasifikasi benar.) ===')
  for (const k of hasil.konversi) {
    console.log(`  H+${String(k.hariSetelahKirim).padStart(3)}  ${k.nama.padEnd(20)} ${k.layanan.padEnd(45)} [${k.jenis}] balas=${k.pernahMembalas}`)
  }

  // Cocokkan ke 4 kunjungan yang MEMANG ditandai seed (simrs_visit_id DUMMY-CAMP-%),
  // bukan ke total baris (yang bercampur noise dari populasi dummy yang lebih luas).
  const cariBaris = (nama: string, hari: number) => hasil.konversi.find(k => k.nama === nama && k.hariSetelahKirim === hari)

  const kLestari = cariBaris('Lestari Lesmana', 12)
  periksa('Lestari Lesmana H+12 → langsung (Vit B Kompleks IM)', kLestari?.jenis === 'langsung', `(dapat ${kLestari?.jenis})`)

  const kAndi = cariBaris('Andi Setiawan', 25)
  periksa('Andi Setiawan H+25 → langsung (Vit B Kompleks IM)', kAndi?.jenis === 'langsung', `(dapat ${kAndi?.jenis})`)

  const kWulan = cariBaris('Wulan Mahendra', 40)
  periksa('Wulan Mahendra H+40 → langsung (Vit B Kompleks IM)', kWulan?.jenis === 'langsung', `(dapat ${kWulan?.jenis})`)
  periksa('Wulan Mahendra H+40 → TIDAK pernah membalas (silent conversion)', kWulan?.pernahMembalas === false)

  // Kasus kunci bug yang tadi ditemukan: kunjungan konversi sesungguhnya (H+18,
  // Multivitamin Infus) HARUS tetap muncul walau ada kunjungan noise lain (H+5)
  // untuk orang yang sama.
  const kSlametAsli = cariBaris('Slamet Anggraini', 18)
  periksa('Slamet Anggraini H+18 (kunjungan konversi ASLI) tidak lagi tertutup kunjungan noise',
    !!kSlametAsli, '(TIDAK DITEMUKAN — regresi ke bug lama)')
  periksa('Slamet Anggraini H+18 → produk_lain (Multivitamin Infus, bukan kode promo)',
    kSlametAsli?.jenis === 'produk_lain', `(dapat ${kSlametAsli?.jenis})`)
  periksa('Slamet Anggraini H+18 → layanan memang Multivitamin Infus',
    kSlametAsli?.layanan === 'PAKET BOOSTER MULTIVITAMIN (INFUS)', `(dapat "${kSlametAsli?.layanan}")`)
  periksa('Slamet Anggraini H+18 → pernah membalas (balasannya dari HP istri/no_hp_2)',
    kSlametAsli?.pernahMembalas === true)

  console.log('\n=== RINGKASAN KONVERSI (per orang) ===')
  console.log(hasil.ringkasanKonversi)
  periksa('orangAmbilPromo >= 3 (minimal 3 kunjungan langsung dari seed campaign)',
    hasil.ringkasanKonversi.orangAmbilPromo >= 3, `(dapat ${hasil.ringkasanKonversi.orangAmbilPromo})`)
  periksa('orangBerkunjung >= orangAmbilPromo + orangProdukLain secara konsisten (tidak dobel hitung)',
    hasil.ringkasanKonversi.orangBerkunjung === hasil.ringkasanKonversi.orangAmbilPromo + hasil.ringkasanKonversi.orangProdukLain)

  // Sejak jadwal kontrol pindah ke tabel SimrsRencanaKontrol (terpisah dari kunjungan),
  // pengecualian "sudah terjadwal" dihitung dari rencana kontrol — bukan lagi dari
  // jadwal_kontrol di kunjungan. Campaign dummy tidak punya data rencana kontrol,
  // jadi tidak ada yang dikecualikan. (Dwi Wijaya yang dulu terkecuali sudah tidak
  // relevan — jadwal_kontrol di kunjungan sudah dihapus.)
  periksa('tidak ada yang dikecualikan "sudah terjadwal" (belum ada data rencana kontrol)',
    hasil.sudahTerjadwal.length === 0, `(dapat ${JSON.stringify(hasil.sudahTerjadwal)})`)

  console.log('\n=== BASELINE ===')
  console.log(hasil.baseline)
  periksa('baseline tidak error (angka valid >= 0)', hasil.baseline.sebelum >= 0 && hasil.baseline.sesudah >= 0)

  // ── Jendela SEMPIT (10 hari) — konversi H+12 dst seharusnya TIDAK masuk ──
  const hasilSempit = await hitungEvaluasiCampaign(db, SLUG, campaign.id, 10)
  console.log('\n=== JENDELA SEMPIT (10 hari) ===')
  periksa('jendela 10 hari: tidak ada baris H+12 ke atas (Lestari dkk di luar jendela)',
    !hasilSempit.konversi.some(k => k.hariSetelahKirim >= 12), `(masih ada baris >= H+12)`)
  periksa('jendela sempit TIDAK mengubah funnel (dibalas tetap sama — funnel seumur hidup)',
    hasilSempit.funnel.dibalas === hasil.funnel.dibalas,
    `(${hasilSempit.funnel.dibalas} vs ${hasil.funnel.dibalas})`)

  console.log(`\n${gagal === 0 ? '✅ SEMUA LOLOS' : '❌ ADA YANG GAGAL'} — lolos ${lolos}, gagal ${gagal}`)
  if (gagal > 0) process.exit(1)
}

main()
  .catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
  .finally(() => db.$disconnect())
