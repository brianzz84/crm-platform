/**
 * Isi awal dokumentasi kontrak SIMRS untuk tenant RKZ — memindahkan isi yang sudah
 * disepakati (docs/kontrak-api-simrs.md) ke fitur di dalam aplikasi, supaya Admin IT
 * tidak mulai dari halaman kosong.
 *
 * Aman dijalankan ulang: memakai upsert untuk anotasi field, dan mengecek
 * "sudah ada isi serupa" sebelum menambah item bebas supaya tidak dobel kalau
 * skrip ini tidak sengaja dijalankan dua kali.
 *
 * Jalankan: DATABASE_URL="..." npx tsx scripts/seed-kontrak-simrs-rkz.ts
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { simpanAnotasiField, simpanItem, simpanCatatanUmum } from '../src/lib/simrs-kontrak'

const SLUG = 'rkz'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

const ANOTASI_KUNJUNGAN: Record<string, { contoh: string; catatan?: string }> = {
  kunjungan_id: { contoh: 'KJG-20260320-0042', catatan: 'ID unik kunjungan di SIMRS — kunci dedup sync' },
  no_rm: { contoh: 'RM123456', catatan: 'Penghubung ke data Pasien' },
  nama_pasien: { contoh: 'Budi Santoso' },
  tanggal: { contoh: '2026-03-20' },
  tindakan_kode: { contoh: '4419', catatan: 'Harus sama persis dengan kode barang di master layanan kami — dasar pencocokan evaluasi campaign' },
  unit: { contoh: 'Pondok Sehat', catatan: 'Perlu diisi tim IT: kode/nilai parameter unit untuk filter Pondok Sehat' },
  no_hp: { contoh: '081234567890' },
  status_kunjungan: { contoh: 'SELESAI', catatan: 'Dikonfirmasi: kunjungan BATAL sudah difilter di API SIMRS — field ini tetap diminta sebagai jaring pengaman' },
  jadwal_kontrol: { contoh: '2026-04-20' },
  nik: { contoh: '3578012345678901', catatan: 'Dikonfirmasi tersedia di SIMRS — dipakai deteksi pasien duplikat' },
  tanggal_lahir: { contoh: '1985-06-15' },
  jenis_kelamin: { contoh: 'L' },
  no_hp_alternatif: { contoh: '081298765432', catatan: 'Nomor HP kedua (mis. milik keluarga/wali)' },
  agama: { contoh: 'Islam' },
  alamat: { contoh: 'Jl. Contoh No. 1', catatan: 'Alamat bebas — terpisah dari kota/kecamatan' },
  kota: { contoh: 'Surabaya', catatan: 'Field terstruktur sendiri, dipakai segmentasi wilayah' },
  kecamatan: { contoh: 'Tenggilis Mejoyo', catatan: 'Field terstruktur sendiri, dipakai segmentasi wilayah' },
  poli: { contoh: 'Poli Umum', catatan: 'Unit spesifik (lebih detail dari unit)' },
  dokter: { contoh: 'dr. Andi Wijaya, Sp.PD' },
  diagnosa_icd: { contoh: 'J06.9' },
  diagnosa_nama: { contoh: 'ISPA akut' },
  diagnosa_sekunder: { contoh: '["I10"]' },
  jenis_pembayaran: { contoh: 'NON_TUNAI', catatan: 'Atribut kunjungan ini, bukan atribut pasien' },
  nama_instansi: { contoh: 'BPJS Kesehatan' },
  kode_instansi: { contoh: 'BPJS-001' },
}

const ANOTASI_PASIEN: Record<string, { contoh: string; catatan?: string }> = {
  no_rm: { contoh: 'RM123456' },
  nama: { contoh: 'Budi Santoso' },
  no_hp: { contoh: '081234567890' },
  nik: { contoh: '3578012345678901', catatan: 'Dikonfirmasi tersedia di SIMRS' },
  tanggal_lahir: { contoh: '1985-06-15' },
  jenis_kelamin: { contoh: 'L' },
  no_hp_alternatif: { contoh: '081298765432' },
  agama: { contoh: 'Islam' },
  alamat: { contoh: 'Jl. Contoh No. 1', catatan: 'Alamat bebas — terpisah dari kota/kecamatan' },
  kota: { contoh: 'Surabaya' },
  kecamatan: { contoh: 'Tenggilis Mejoyo' },
  jenis_pembayaran: { contoh: 'NON_TUNAI' },
  nama_instansi: { contoh: 'BPJS Kesehatan' },
  kode_instansi: { contoh: 'BPJS-001' },
  no_bpjs: { contoh: '0001234567890' },
}

const NON_FUNGSIONAL = [
  { judul: 'Ukuran halaman', isi: 'Maks 100 baris per panggilan', status: 'Dikonfirmasi' },
  { judul: 'Batas frekuensi panggilan', isi: 'Apakah 100 baris cuma batas per halaman, atau juga ada batas jumlah panggilan per menit/jam?', status: 'Terbuka' },
  { judul: 'Paginasi', isi: 'Wajib ada untuk endpoint Kunjungan (page, per_page, meta.total)', status: 'Di kontrak' },
  { judul: 'Zona waktu', isi: 'WIB, format tanggal YYYY-MM-DD', status: 'Asumsi' },
  { judul: 'Format nomor HP', isi: 'Dengan/tanpa awalan 0, atau +62? Kami normalisasi ke awalan 0', status: 'Terbuka' },
  { judul: 'Kunjungan batal', isi: 'Sudah difilter di sisi API SIMRS', status: 'Dikonfirmasi' },
  { judul: 'Sandbox / lingkungan uji', isi: 'Belum tersedia — pengujian awal memakai 1-2 No. RM sungguhan yang ditunjuk tim IT', status: 'Dikonfirmasi' },
]

const KESEPAKATAN = [
  'tindakan_kode di SIMRS sama persis dengan kode barang di master layanan kami — tidak perlu tabel pemetaan',
  'Pondok Sehat adalah satu kode unit (bukan gabungan beberapa poli/kode layanan)',
  'Kunjungan berstatus BATAL sudah difilter oleh API SIMRS sebelum sampai ke kami',
  'NIK tersedia di data pasien SIMRS',
  'Belum ada sistem yang menandai "data pasien ini berubah" — diakali dari sisi kami: setiap kali No. RM muncul di feed Kunjungan, data Pasiennya otomatis disegarkan. Tidak perlu tim IT membangun apa pun tambahan untuk ini.',
  'Sandbox/staging belum tersedia — pengujian dilakukan bertahap dengan No. RM sungguhan yang ditunjuk tim IT',
]

const PERTANYAAN_TERBUKA = [
  'Apa kode/nilai parameter unit untuk Pondok Sehat di sistem SIMRS?',
  'Batas 100 baris itu cuma per halaman, atau juga ada batas jumlah panggilan per menit/jam?',
  'Format nomor HP yang dikirim — dengan awalan 0, atau +62?',
]

const CATATAN_UMUM = `Pilot: Unit Pondok Sehat. CRM 360 RKZ butuh dua jenis data dari SIMRS — data pasien (Person) dan data kunjungan (Visit). Lingkupnya sengaja dibatasi ke satu unit (Pondok Sehat) supaya beban ke sistem SIMRS minimal sambil kedua sisi belajar.

Autentikasi: Bearer token lewat header Authorization. Base URL disimpan per rumah sakit (multi-tenant).

Endpoint Kunjungan (delta harian) perlu API sungguhan — feed berkelanjutan. Endpoint Pasien untuk pilot boleh dimulai dari ekspor Excel sekali, API menyusul.

Kalau kontrak ini berubah: karena belum ada sistem otomatis yang memberi tahu perubahan, perubahan nama field/tipe/struktur endpoint wajib dikomunikasikan manual sebelum dideploy. Tools Diagnostik API di halaman ini bisa dipakai bersama untuk verifikasi cepat.`

async function main() {
  console.log('Menyimpan anotasi field Kunjungan...')
  for (const [field, a] of Object.entries(ANOTASI_KUNJUNGAN)) {
    await simpanAnotasiField(db, SLUG, 'kunjungan', field, a)
  }
  console.log(`  ${Object.keys(ANOTASI_KUNJUNGAN).length} field dianotasi.`)

  console.log('Menyimpan anotasi field Pasien...')
  for (const [field, a] of Object.entries(ANOTASI_PASIEN)) {
    await simpanAnotasiField(db, SLUG, 'pasien', field, a)
  }
  console.log(`  ${Object.keys(ANOTASI_PASIEN).length} field dianotasi.`)

  const sudahAdaItem = await db.simrsKontrakItem.count({ where: { tenant_slug: SLUG } })
  if (sudahAdaItem > 0) {
    console.log(`\nSudah ada ${sudahAdaItem} item bebas tersimpan — dilewati (skrip ini tidak menduplikasi item, hanya anotasi field).`)
  } else {
    console.log('Menambah item Aturan Non-Fungsional...')
    for (let i = 0; i < NON_FUNGSIONAL.length; i++) {
      const n = NON_FUNGSIONAL[i]
      await simpanItem(db, SLUG, 'non_fungsional', { judul: n.judul, isi: n.isi, status: n.status, urutan: i })
    }
    console.log('Menambah item Kesepakatan...')
    for (let i = 0; i < KESEPAKATAN.length; i++) {
      await simpanItem(db, SLUG, 'kesepakatan', { isi: KESEPAKATAN[i], urutan: i })
    }
    console.log('Menambah item Pertanyaan Terbuka...')
    for (let i = 0; i < PERTANYAAN_TERBUKA.length; i++) {
      await simpanItem(db, SLUG, 'pertanyaan_terbuka', { isi: PERTANYAAN_TERBUKA[i], status: 'terbuka', urutan: i })
    }
  }

  console.log('Menyimpan catatan umum...')
  await simpanCatatanUmum(db, SLUG, CATATAN_UMUM)

  console.log('\nSelesai.')
}

main()
  .catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
  .finally(() => db.$disconnect())
