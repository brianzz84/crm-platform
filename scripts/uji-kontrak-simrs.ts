/**
 * Uji fitur dokumentasi kontrak SIMRS — end-to-end terhadap DB lokal.
 *
 * Memastikan: daftar field lengkap ikut kode (bukan cuma yang pernah dianotasi),
 * anotasi contoh/catatan tersimpan & terbaca balik, field TIDAK DIKENAL ditolak
 * (mencegah dokumentasi menyimpang dari kontrak sungguhan), dan CRUD item bebas
 * (non-fungsional/kesepakatan/pertanyaan terbuka) bekerja termasuk toggle status.
 *
 * Jalankan: DATABASE_URL="postgresql://atc_user:atc_dev_password@localhost:5432/crm_rkz" npx tsx scripts/uji-kontrak-simrs.ts
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { ambilKontrakDoc, simpanAnotasiField, simpanItem, updateItem, hapusItem, simpanCatatanUmum } from '../src/lib/simrs-kontrak'

const SLUG = 'rkz'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

let lolos = 0, gagal = 0
function periksa(nama: string, syarat: boolean, detail = '') {
  if (syarat) { console.log(`  ✓ ${nama}`); lolos++ }
  else        { console.log(`  ✗ ${nama} ${detail}`); gagal++ }
}

async function main() {
  if (!process.env.DATABASE_URL?.includes('localhost')) throw new Error('BATAL: skrip ini hanya untuk DB lokal')

  // Bersihkan dulu supaya uji deterministik
  await db.simrsKontrakField.deleteMany({ where: { tenant_slug: SLUG } })
  await db.simrsKontrakItem.deleteMany({ where: { tenant_slug: SLUG } })
  await db.simrsKontrakCatatan.deleteMany({ where: { tenant_slug: SLUG } })

  console.log('→ Mengambil dokumen kosong (belum ada anotasi)...')
  const docKosong = await ambilKontrakDoc(db, SLUG)
  periksa('field kunjungan tetap lengkap walau belum dianotasi (dari kode, bukan DB)',
    docKosong.fieldsKunjungan.some(f => f.fieldNama === 'no_rm') && docKosong.fieldsKunjungan.some(f => f.fieldNama === 'kota'),
    `(dapat ${docKosong.fieldsKunjungan.length} field)`)

  console.log('\n→ Blok endpoint (diturunkan dari kode)...')
  periksa('endpoint kunjungan bermethod GET', docKosong.endpointKunjungan.spec.method === 'GET')
  periksa('path kunjungan memuat per_page=100 (batas disepakati, BUKAN 500)',
    docKosong.endpointKunjungan.spec.pathContoh.includes('per_page=100') && !docKosong.endpointKunjungan.spec.pathContoh.includes('per_page=500'),
    `(dapat "${docKosong.endpointKunjungan.spec.pathContoh}")`)
  periksa('path kunjungan memuat param unit (filter Pondok Sehat di server)',
    docKosong.endpointKunjungan.spec.pathContoh.includes('unit='))
  periksa('endpoint pasien path /pasien/{no_rm}', docKosong.endpointPasien.spec.pathContoh === '/pasien/{no_rm}')

  console.log('\n→ Contoh respons (auto-generate, JSON valid)...')
  const respKunjungan = JSON.parse(docKosong.endpointKunjungan.contohRespons)
  periksa('contoh respons kunjungan JSON valid + ada data[] & meta', Array.isArray(respKunjungan.data) && !!respKunjungan.meta)
  periksa('meta.per_page = 100 (dari konstanta yang sama)', respKunjungan.meta.per_page === 100, `(dapat ${respKunjungan.meta?.per_page})`)
  periksa('field belum dianotasi tampil null di contoh respons', respKunjungan.data[0].no_rm === null)
  const respPasien = JSON.parse(docKosong.endpointPasien.contohRespons)
  periksa('contoh respons pasien JSON valid (objek tunggal, bukan array)', !!respPasien.data && !Array.isArray(respPasien.data))
  periksa('no_rm berstatus wajib (dari kode)', docKosong.fieldsKunjungan.find(f => f.fieldNama === 'no_rm')?.status === 'wajib')
  periksa('tindakan_kode berstatus penting (dari kode)', docKosong.fieldsKunjungan.find(f => f.fieldNama === 'tindakan_kode')?.status === 'penting')
  periksa('alamat berstatus opsional (dari kode)', docKosong.fieldsKunjungan.find(f => f.fieldNama === 'alamat')?.status === 'opsional')
  periksa('contoh/catatan kosong sebelum dianotasi',
    docKosong.fieldsKunjungan.find(f => f.fieldNama === 'no_rm')?.contoh === null)

  console.log('\n→ Menyimpan anotasi untuk field no_rm...')
  await simpanAnotasiField(db, SLUG, 'kunjungan', 'no_rm', { contoh: 'RM123456', catatan: 'Uji anotasi' })
  const docTerisi = await ambilKontrakDoc(db, SLUG)
  const noRm = docTerisi.fieldsKunjungan.find(f => f.fieldNama === 'no_rm')
  periksa('contoh tersimpan & terbaca balik', noRm?.contoh === 'RM123456')
  periksa('catatan tersimpan & terbaca balik', noRm?.catatan === 'Uji anotasi')
  periksa('status TETAP dari kode walau sudah dianotasi (tidak ikut tersimpan di DB)', noRm?.status === 'wajib')

  console.log('\n→ Mencoba anotasi field yang TIDAK DIKENAL (harus ditolak)...')
  let ditolak = false
  try {
    await simpanAnotasiField(db, SLUG, 'kunjungan', 'field_karangan_saya', { contoh: 'x' })
  } catch (e) {
    ditolak = true
    periksa('pesan penolakan jelas', e instanceof Error && e.message.includes('tidak dikenal'), `(dapat "${(e as Error).message}")`)
  }
  periksa('field tidak dikenal DITOLAK (mencegah dokumentasi menyimpang dari kontrak)', ditolak)

  console.log('\n→ Uji CRUD item bebas (pertanyaan terbuka)...')
  const item = await simpanItem(db, SLUG, 'pertanyaan_terbuka', { isi: 'Kode unit Pondok Sehat?', status: 'terbuka' })
  periksa('item tersimpan', !!item.id)

  const docDenganItem = await ambilKontrakDoc(db, SLUG)
  periksa('item muncul di dokumen', docDenganItem.pertanyaanTerbuka.some(i => i.id === item.id))

  await updateItem(db, SLUG, item.id, { status: 'terjawab' })
  const docSetelahUbah = await ambilKontrakDoc(db, SLUG)
  periksa('status berubah jadi terjawab', docSetelahUbah.pertanyaanTerbuka.find(i => i.id === item.id)?.status === 'terjawab')

  // Pengaman: item milik tenant lain tidak boleh bisa diubah/dihapus lewat tenant ini
  let ditolakTenantLain = false
  try {
    await updateItem(db, 'tenant-lain-karangan', item.id, { isi: 'coba ubah dari tenant lain' })
  } catch { ditolakTenantLain = true }
  periksa('item TIDAK bisa diubah dari tenant lain (isolasi tenant)', ditolakTenantLain)

  await hapusItem(db, SLUG, item.id)
  const docSetelahHapus = await ambilKontrakDoc(db, SLUG)
  periksa('item terhapus', !docSetelahHapus.pertanyaanTerbuka.some(i => i.id === item.id))

  console.log('\n→ Uji catatan umum...')
  await simpanCatatanUmum(db, SLUG, 'Ini catatan uji.')
  const docCatatan = await ambilKontrakDoc(db, SLUG)
  periksa('catatan umum tersimpan & terbaca balik', docCatatan.catatanUmum === 'Ini catatan uji.')

  // Bersihkan jejak uji
  await db.simrsKontrakField.deleteMany({ where: { tenant_slug: SLUG } })
  await db.simrsKontrakItem.deleteMany({ where: { tenant_slug: SLUG } })
  await db.simrsKontrakCatatan.deleteMany({ where: { tenant_slug: SLUG } })

  console.log(`\n${gagal === 0 ? '✅ SEMUA LOLOS' : '❌ ADA YANG GAGAL'} — lolos ${lolos}, gagal ${gagal}`)
  if (gagal > 0) process.exit(1)
}

main()
  .catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
  .finally(() => db.$disconnect())
