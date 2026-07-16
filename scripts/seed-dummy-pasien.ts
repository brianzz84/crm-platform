/**
 * Seed PASIEN DUMMY (person baru + kunjungan SIMRS) untuk pengembangan &
 * pengujian AI Partner, selama API SIMRS asli belum tersedia.
 *
 * ATURAN PENTING:
 * - Skrip ini HANYA membuat person BARU. Tidak pernah UPDATE/DELETE person asli
 *   (data warisan AKAR/kegiatan). Tidak ada satu pun record eksisting disentuh.
 * - Semua person dummy ditandai simrs_patient_id berawalan 'DUMMY-'
 *   dan semua kunjungan ditandai simrs_visit_id berawalan 'DUMMY-'.
 * - no_hp sengaja dikosongkan agar tidak ada kemungkinan broadcast nyasar
 *   ke nomor orang sungguhan.
 *
 * Hapus total (aman, hanya menyentuh data dummy):
 *   DELETE FROM crm_simrs_visits WHERE person_id IN (SELECT id FROM crm_persons WHERE simrs_patient_id LIKE 'DUMMY-%');
 *   DELETE FROM crm_persons WHERE simrs_patient_id LIKE 'DUMMY-%';
 *
 * Uji tanpa menulis: DRY_RUN=1 DATABASE_URL="..." npx tsx scripts/seed-dummy-pasien.ts
 * Jalankan:          DATABASE_URL="..." npx tsx scripts/seed-dummy-pasien.ts
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const SLUG = 'rkz'
const JUMLAH_PASIEN = 450
const DRY_RUN = process.env.DRY_RUN === '1'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

let seed = 20260715
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)]
const randInt = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min

const DEPAN_L = ['Agus','Budi','Slamet','Hendra','Rizal','Joko','Bayu','Andi','Eko','Dwi','Yohanes','Bambang','Tommy','Fajar','Arif','Doni','Wawan','Hadi','Iwan','Rudi']
const DEPAN_P = ['Siti','Dewi','Rina','Lestari','Ratna','Maria','Nurul','Kartika','Fitri','Ayu','Sri','Indah','Wulan','Yuni','Endah','Novi','Tuti','Vera','Diah','Melati']
const BELAKANG = ['Santoso','Wijaya','Kusuma','Pratama','Handoko','Susilo','Halim','Gunawan','Setiawan','Nugroho','Permata','Anggraini','Hartono','Salim','Puspita','Mahendra','Rahayu','Utami','Firmansyah','Lesmana']

const WILAYAH = [
  { kota: 'Surabaya', kecamatan: ['Tenggilis Mejoyo','Gubeng','Rungkut','Wonocolo','Sukolilo','Gayungan','Wiyung','Mulyorejo'] },
  { kota: 'Sidoarjo',  kecamatan: ['Waru','Taman','Buduran','Gedangan','Sukodono'] },
  { kota: 'Gresik',    kecamatan: ['Kebomas','Manyar','Driyorejo'] },
  { kota: 'Malang',    kecamatan: ['Klojen','Blimbing','Lowokwaru'] },
]
const PEKERJAAN = ['Karyawan Swasta','Wiraswasta','Ibu Rumah Tangga','PNS','Guru','Perawat','Dokter','Pensiunan','Pelajar/Mahasiswa','Buruh','Pedagang']
const AGAMA = ['Islam','Kristen','Katolik','Hindu','Buddha']

const DOKTER: Record<string, string[]> = {
  'Poli Penyakit Dalam': ['dr. Andi Wijaya, Sp.PD','dr. Ratna Kusuma, Sp.PD','dr. Bambang Sutrisno, Sp.PD'],
  'Poli Jantung':        ['dr. Sri Rahayu, Sp.JP','dr. Hendra Gunawan, Sp.JP'],
  'Poli Anak':           ['dr. Maria Yosefa, Sp.A','dr. Try Wahyudi, Sp.A'],
  'Poli Kandungan':      ['dr. Lestari Dewi, Sp.OG','dr. Agus Salim, Sp.OG'],
  'Poli Saraf':          ['dr. Nurul Hidayah, Sp.S'],
  'Poli Mata':           ['dr. Kartika Sari, Sp.M'],
  'Poli Gigi':           ['drg. Fransiska Ayu','drg. Yohanes Bimo'],
  'Poli Kulit':          ['dr. Dian Permata, Sp.KK'],
  'Poli Paru':           ['dr. Joko Susilo, Sp.P'],
  'Poli Bedah':          ['dr. Rizal Effendi, Sp.B','dr. Tommy Halim, Sp.OT'],
}

// Semua kode ICD di bawah sudah diverifikasi ADA di crm_icd_library production
const ICD_PER_POLI: Record<string, { kode: string; nama: string }[]> = {
  'Poli Penyakit Dalam': [
    { kode: 'E11.9', nama: 'Diabetes Melitus Tipe 2 tanpa komplikasi' },
    { kode: 'I10',   nama: 'Hipertensi esensial' },
    { kode: 'E78.5', nama: 'Dislipidemia' },
    { kode: 'K30',   nama: 'Dispepsia fungsional' },
    { kode: 'K21.9', nama: 'GERD tanpa esofagitis' },
    { kode: 'E66.9', nama: 'Obesitas' },
    { kode: 'D50.9', nama: 'Anemia defisiensi besi' },
  ],
  'Poli Jantung':   [{ kode: 'I10', nama: 'Hipertensi esensial' }, { kode: 'I25.10', nama: 'Penyakit jantung koroner' }, { kode: 'E78.5', nama: 'Dislipidemia' }],
  'Poli Anak':      [{ kode: 'J06.9', nama: 'ISPA akut' }, { kode: 'A09', nama: 'Gastroenteritis infeksius' }, { kode: 'J45.909', nama: 'Asma tanpa komplikasi' }],
  'Poli Kandungan': [{ kode: 'N39.0', nama: 'Infeksi saluran kemih' }],
  'Poli Saraf':     [{ kode: 'G43.909', nama: 'Migrain' }, { kode: 'F41.9', nama: 'Gangguan cemas' }],
  'Poli Mata':      [{ kode: 'H52.4', nama: 'Presbiopia' }],
  'Poli Gigi':      [{ kode: 'K30', nama: 'Dispepsia fungsional' }],
  'Poli Kulit':     [{ kode: 'L30.9', nama: 'Dermatitis' }, { kode: 'J30.9', nama: 'Rinitis alergi' }],
  'Poli Paru':      [{ kode: 'J45.909', nama: 'Asma tanpa komplikasi' }, { kode: 'J06.9', nama: 'ISPA akut' }],
  'Poli Bedah':     [{ kode: 'M17.9', nama: 'Osteoartritis lutut' }, { kode: 'M54.5', nama: 'Nyeri punggung bawah' }],
}
const POLI_LIST = Object.keys(ICD_PER_POLI)
const ICD_KRONIS = ['E11.9', 'I10', 'I25.10', 'E78.5', 'J45.909']

function tanggalKunjungan(): Date {
  const start = new Date('2024-01-01').getTime()
  const end   = new Date('2026-07-15').getTime()
  return new Date(start + rnd() * (end - start))
}

async function main() {
  console.log(DRY_RUN ? '[DRY_RUN] tidak akan menulis apa pun\n' : '')
  console.log('Mengambil acuan layanan dari library asli...')

  const [layananPondok, layananLab, layananRad, personAsliSebelum] = await Promise.all([
    db.simrsLayananLibrary.findMany({ where: { kelompok: 'Pondok Sehat', jenis: 'Check Up', aktif: true }, select: { kode_barang: true, nama: true }, take: 20 }),
    db.simrsLayananLibrary.findMany({ where: { kelompok: 'Penunjang', jenis: 'Laboratorium', aktif: true }, select: { kode_barang: true, nama: true }, take: 40 }),
    db.simrsLayananLibrary.findMany({ where: { kelompok: 'Penunjang', jenis: 'Radiologi', aktif: true }, select: { kode_barang: true, nama: true }, take: 40 }),
    db.person.count({ where: { tenant_slug: SLUG } }),
  ])
  if (!layananPondok.length || !layananLab.length || !layananRad.length) {
    throw new Error('Library layanan tidak lengkap — batal, supaya kode tindakan tidak dikarang.')
  }
  console.log(`  layanan — Pondok Sehat: ${layananPondok.length}, Lab: ${layananLab.length}, Radiologi: ${layananRad.length}`)
  console.log(`  person existing (TIDAK akan disentuh): ${personAsliSebelum}`)

  const sudahAda = await db.person.count({ where: { tenant_slug: SLUG, simrs_patient_id: { startsWith: 'DUMMY-' } } })
  if (sudahAda > 0 && !DRY_RUN) {
    throw new Error(`Sudah ada ${sudahAda} pasien dummy. Hapus dulu sebelum seed ulang (lihat header file).`)
  }

  // ── Bangun person dummy ──
  const persons: any[] = []
  for (let i = 0; i < JUMLAH_PASIEN; i++) {
    const pria = rnd() < 0.45
    const w    = pick(WILAYAH)
    const kec  = pick(w.kecamatan)   // sekali saja — alamat & kolom kecamatan harus konsisten
    const usia = randInt(3, 78)
    const lahir = new Date()
    lahir.setFullYear(lahir.getFullYear() - usia)
    lahir.setMonth(randInt(0, 11), randInt(1, 28))

    persons.push({
      tenant_slug:      SLUG,
      name:             `${pick(pria ? DEPAN_L : DEPAN_P)} ${pick(BELAKANG)}`,
      no_hp:            null,   // sengaja kosong — cegah broadcast nyasar ke nomor nyata
      jenis_kelamin:    pria ? 'L' : 'P',
      tanggal_lahir:    lahir,
      alamat:           `Jl. ${pick(BELAKANG)} No. ${randInt(1, 200)}, ${kec}, ${w.kota}`,
      kota:             w.kota,
      kecamatan:        kec,
      pekerjaan:        usia < 18 ? 'Pelajar/Mahasiswa' : usia > 60 && rnd() < 0.5 ? 'Pensiunan' : pick(PEKERJAAN),
      agama:            pick(AGAMA),
      no_rm:            `RM${900001 + i}`,
      simrs_patient_id: `DUMMY-${String(i + 1).padStart(4, '0')}`,   // penanda pasien dummy
      is_pasien_simrs:  true,
      sumber:           'SIMRS',
      kategori:         'pasien',
      aktif:            true,
      last_simrs_sync_at: new Date(),
    })
  }

  console.log(`\nMenyiapkan ${persons.length} person dummy baru...`)

  if (DRY_RUN) {
    console.log('Contoh person dummy:')
    console.log(JSON.stringify(persons.slice(0, 2), null, 2))
  }

  let created: { id: string }[] = []
  if (!DRY_RUN) {
    await db.person.createMany({ data: persons })
    created = await db.person.findMany({
      where: { tenant_slug: SLUG, simrs_patient_id: { startsWith: 'DUMMY-' } },
      select: { id: true },
    })
    console.log(`  person dummy dibuat: ${created.length}`)
  } else {
    created = persons.map((_, i) => ({ id: `dry-run-${i}` }))
  }

  // ── Bangun kunjungan untuk person dummy ──
  const visits: any[] = []
  let no = 1000
  for (const p of created) {
    const r = rnd()
    const jumlah = r < 0.45 ? 1 : r < 0.75 ? 2 : r < 0.9 ? randInt(3, 4) : randInt(5, 8)

    for (let i = 0; i < jumlah; i++) {
      const u = rnd()
      const tanggal = tanggalKunjungan()

      // Aturan nyata: ada penjamin (BPJS/asuransi/perusahaan) => NON_TUNAI (klaim).
      // Bayar sendiri => TUNAI dan tanpa penjamin. Tidak boleh TUNAI + penjamin.
      const pj = rnd()
      const penjamin =
        pj < 0.62 ? 'BPJS Kesehatan' :
        pj < 0.71 ? pick(['Prudential', 'Allianz', 'AXA Mandiri']) :
        pj < 0.75 ? pick(['PT Unilever Indonesia', 'PT Astra International']) :  // penjamin perusahaan
        null
      const base = {
        person_id: p.id,
        tanggal,
        aktif: true,
        status_kunjungan: 'SELESAI',
        simrs_visit_id: `DUMMY-${no++}`,
        jenis_pembayaran: penjamin ? 'NON_TUNAI' : 'TUNAI',
        nama_instansi: penjamin,
      }

      if (u < 0.55) {
        const poli = pick(POLI_LIST)
        const icd  = pick(ICD_PER_POLI[poli])
        const kronis = ICD_KRONIS.includes(icd.kode)
        visits.push({
          ...base, unit: 'RAWAT_JALAN', poli, dokter: pick(DOKTER[poli]),
          diagnosa_icd: icd.kode, diagnosa_nama: icd.nama,
          tindakan: kronis ? 'Konsultasi + kontrol rutin' : 'Konsultasi',
          jadwal_kontrol: kronis && rnd() < 0.7 ? new Date(tanggal.getTime() + randInt(30, 90) * 86400000) : null,
        })
      } else if (u < 0.73) {
        const l = pick(layananLab)
        visits.push({ ...base, unit: 'PENUNJANG', poli: 'Laboratorium', tindakan: l.nama, tindakan_kode: l.kode_barang })
      } else if (u < 0.85) {
        const l = pick(layananRad)
        visits.push({ ...base, unit: 'PENUNJANG', poli: 'Radiologi', dokter: pick(['dr. Sinta Wibowo, Sp.Rad','dr. Eko Prasetyo, Sp.Rad']), tindakan: l.nama, tindakan_kode: l.kode_barang })
      } else if (u < 0.95) {
        // Pondok Sehat = paket check-up. BPJS tidak menjamin, tapi MCU perusahaan
        // umum terjadi (perusahaan jadi penjamin) — selain pasien bayar sendiri.
        const l  = pick(layananPondok)
        const mcu = rnd() < 0.35 ? pick(['PT Unilever Indonesia', 'PT Astra International']) : null
        visits.push({
          ...base, unit: 'PONDOK_SEHAT', poli: 'Pondok Sehat',
          dokter: pick(['dr. Andi Wijaya, Sp.PD','dr. Ratna Kusuma, Sp.PD']),
          diagnosa_icd: 'Z00.00', diagnosa_nama: 'Pemeriksaan kesehatan umum',
          tindakan: l.nama, tindakan_kode: l.kode_barang,
          jenis_pembayaran: mcu ? 'NON_TUNAI' : 'TUNAI',
          nama_instansi: mcu,
        })
      } else {
        const poli = pick(['Poli Penyakit Dalam','Poli Anak','Poli Bedah','Poli Kandungan'])
        const icd  = pick(ICD_PER_POLI[poli])
        visits.push({
          ...base, unit: 'RAWAT_INAP', poli, dokter: pick(DOKTER[poli]),
          diagnosa_icd: icd.kode, diagnosa_nama: icd.nama,
          tindakan: `Rawat inap ${randInt(2, 6)} hari`,
          jadwal_kontrol: new Date(tanggal.getTime() + randInt(7, 21) * 86400000),
        })
      }
    }
  }

  const perUnit = visits.reduce((a: any, v) => {
    const k = v.unit === 'PENUNJANG' ? `PENUNJANG (${v.poli})` : v.unit
    a[k] = (a[k] ?? 0) + 1; return a
  }, {})
  console.log(`\nMenyiapkan ${visits.length} kunjungan...`)
  for (const [k, v] of Object.entries(perUnit).sort((a: any, b: any) => b[1] - a[1])) {
    console.log(`  ${String(k).padEnd(26)} ${v}`)
  }
  console.log(`  punya jadwal kontrol: ${visits.filter(v => v.jadwal_kontrol).length}`)
  console.log(`  BPJS: ${visits.filter(v => v.nama_instansi === 'BPJS Kesehatan').length}/${visits.length}`)

  if (DRY_RUN) { console.log('\n[DRY_RUN] Selesai — tidak ada yang ditulis.'); return }

  const BATCH = 200
  for (let i = 0; i < visits.length; i += BATCH) {
    await db.simrsVisit.createMany({ data: visits.slice(i, i + BATCH), skipDuplicates: true })
    process.stdout.write(`  tersimpan ${Math.min(i + BATCH, visits.length)}/${visits.length}\r`)
  }

  const personSesudah = await db.person.count({ where: { tenant_slug: SLUG } })
  console.log(`\n\nSelesai.`)
  console.log(`  person: ${personAsliSebelum} → ${personSesudah} (+${personSesudah - personAsliSebelum} dummy)`)
  console.log(`  kunjungan total: ${await db.simrsVisit.count()}`)
}

main()
  .catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
  .finally(() => db.$disconnect())
