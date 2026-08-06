/**
 * Siapkan tenant DEMO untuk peninjau App Review Meta.
 *
 * KENAPA TENANT TERPISAH. Peninjau Meta akan masuk dan membaca isi aplikasi.
 * Tenant RKZ berisi percakapan pasien sungguhan — keluhan, pertanyaan medis,
 * nomor telepon. Menyerahkan akses ke peninjau pihak ketiga adalah pengungkapan
 * data kesehatan tanpa dasar, betapapun sahnya keperluan peninjauannya.
 *
 * Seluruh isi tenant ini KARANGAN: nama, keluhan, dan nomor tidak merujuk siapa
 * pun. Polanya sengaja menyerupai pertanyaan yang benar-benar masuk ke RKZ —
 * jadwal dokter, biaya, lowongan, komplain — supaya peragaannya meyakinkan tanpa
 * memakai data seorang pun.
 *
 * SANDI TIDAK PERNAH DITULIS DI SINI. Skrip menolak jalan tanpa DEMO_PASSWORD,
 * dan nilainya hanya lewat dari lingkungan ke fungsi hash.
 *
 *   DEMO_PASSWORD='...' npx tsx scripts/seed-tenant-demo.ts
 */
import { masterDb, getTenantDb, copyGlobalToTenant } from '../src/lib/tenant'
import { hashPassword } from '../src/lib/password'

const SLUG  = process.env.DEMO_SLUG  || 'demo'
const NAMA  = process.env.DEMO_NAMA  || 'RS Demo Sehat Sentosa'
const EMAIL = process.env.DEMO_EMAIL || 'reviewer@demo.local'
const SANDI = process.env.DEMO_PASSWORD

/**
 * Percakapan karangan. Kategorinya mengikuti taksonomi DM di laporan triwulanan
 * RKZ (Tabel 2.12–2.15) supaya peragaan menunjukkan kegunaan yang sesungguhnya:
 * satu kotak masuk untuk pertanyaan yang datangnya beragam.
 *
 * Sebagian sengaja SUDAH DIBALAS dan sebagian belum — peninjau perlu melihat
 * percakapan dua arah, dan itu pula yang membuat metrik waktu respons masuk akal.
 *
 * DUA KANAL, dan yang IG ada alasannya. App Review menuntut peragaan izin yang
 * belum diberikan: selama `instagram_manage_messages` masih Standard Access,
 * percakapan Instagram yang sungguhan tidak bisa ditarik sama sekali. Baris
 * berlabel IG di bawah menutup celah itu — peninjau bisa melihat bentuk akhirnya
 * di kotak masuk yang sama.
 *
 * Rekaman layar WAJIB menyebutkan bahwa baris IG adalah data contoh. Bukan
 * datanya yang membuat pengajuan ditolak, melainkan menyajikannya seolah data
 * sungguhan lalu ketahuan.
 */
const PERCAKAPAN: {
  nama: string; psid: string; jamLalu: number; kanal: 'FB' | 'IG'
  pesan: { dari: 'user' | 'halaman'; teks: string; menitSetelah: number }[]
}[] = [
  {
    nama: 'Rina Kusuma', psid: 'demo-psid-001', jamLalu: 30, kanal: 'FB',
    pesan: [
      { dari: 'user',    teks: 'Selamat pagi, dokter jantung praktek hari apa saja ya?', menitSetelah: 0 },
      { dari: 'halaman', teks: 'Selamat pagi Ibu Rina. Poli Jantung buka Senin–Jumat pukul 08.00–14.00. Untuk pendaftaran bisa lewat aplikasi atau datang langsung. Terima kasih.', menitSetelah: 42 },
      { dari: 'user',    teks: 'Baik, terima kasih infonya.', menitSetelah: 55 },
    ],
  },
  {
    nama: 'Bagus Prakoso', psid: 'demo-psid-002', jamLalu: 26, kanal: 'FB',
    pesan: [
      { dari: 'user',    teks: 'Mau tanya, biaya medical check up paket lengkap berapa ya?', menitSetelah: 0 },
      { dari: 'halaman', teks: 'Terima kasih atas pertanyaannya. Paket MCU tersedia mulai dari beberapa pilihan sesuai kebutuhan. Boleh kami hubungi di nomor berapa agar tim kami menjelaskan lebih rinci?', menitSetelah: 18 },
    ],
  },
  {
    nama: 'Siti Marlina', psid: 'demo-psid-003', jamLalu: 20, kanal: 'FB',
    pesan: [
      { dari: 'user',    teks: 'Halo, apakah sedang ada lowongan untuk perawat?', menitSetelah: 0 },
      { dari: 'halaman', teks: 'Halo, terima kasih atas minatnya. Informasi lowongan kami umumkan lewat akun resmi dan situs rumah sakit. Silakan pantau secara berkala ya.', menitSetelah: 130 },
    ],
  },
  {
    nama: 'Andi Wijaya', psid: 'demo-psid-004', jamLalu: 8, kanal: 'FB',
    pesan: [
      // Sengaja BELUM dibalas — peninjau perlu melihat percakapan yang menunggu,
      // dan itu pula yang membuat penghitungan waktu respons ada gunanya.
      { dari: 'user', teks: 'Selamat siang, saya sudah menunggu di poli sejak jam 9 tapi belum dipanggil. Mohon bantuannya.', menitSetelah: 0 },
    ],
  },
  {
    nama: 'Dewi Anggraini', psid: 'demo-psid-005', jamLalu: 4, kanal: 'FB',
    pesan: [
      { dari: 'user', teks: 'Apakah bisa konsultasi ke dokter anak di hari Sabtu?', menitSetelah: 0 },
    ],
  },
  {
    nama: 'putri.andini', psid: 'demo-igsid-001', jamLalu: 18, kanal: 'IG',
    pesan: [
      { dari: 'user',    teks: 'Kak, imunisasi bayi 6 bulan jadwalnya hari apa ya?', menitSetelah: 0 },
      { dari: 'halaman', teks: 'Halo Kak Putri. Poli Anak melayani imunisasi Senin sampai Sabtu pukul 08.00-13.00. Sebaiknya daftar dulu agar tidak menunggu lama ya. Terima kasih.', menitSetelah: 25 },
      { dari: 'user',    teks: 'Oke kak, makasih banyak.', menitSetelah: 31 },
    ],
  },
  {
    nama: 'hendra.wibowo', psid: 'demo-igsid-002', jamLalu: 11, kanal: 'IG',
    pesan: [
      { dari: 'user',    teks: 'Halo, untuk operasi katarak apakah bisa pakai BPJS?', menitSetelah: 0 },
      { dari: 'halaman', teks: 'Terima kasih atas pertanyaannya. Layanan tersebut dapat menggunakan BPJS dengan rujukan dari faskes tingkat pertama. Silakan bawa rujukan dan kartu BPJS saat pendaftaran.', menitSetelah: 63 },
    ],
  },
  {
    nama: 'maya.sari', psid: 'demo-igsid-003', jamLalu: 2, kanal: 'IG',
    pesan: [
      // Belum dibalas — peninjau perlu melihat percakapan yang masih menunggu,
      // dan itu pula yang membuat penghitungan waktu tanggap ada gunanya.
      { dari: 'user', teks: 'Seminar kesehatan jantung yang diposting kemarin masih ada kuota tidak ya?', menitSetelah: 0 },
    ],
  },
]

async function main() {
  if (!SANDI) {
    console.error('DEMO_PASSWORD belum diisi. Jalankan:\n\n  DEMO_PASSWORD=\'sandi-pilihan-anda\' npx tsx scripts/seed-tenant-demo.ts\n')
    process.exit(1)
  }

  // URL database disalin dari tenant yang sudah ada, TANPA dicetak ke mana pun —
  // di produksi seluruh tenant berbagi satu database dan dipisah oleh tenant_slug.
  const contoh = await masterDb.tenant.findFirst({ where: { aktif: true }, select: { database_url: true } })
  if (!contoh) { console.error('Tidak ada tenant aktif sebagai acuan database_url.'); process.exit(1) }

  const tenant = await masterDb.tenant.upsert({
    where:  { slug: SLUG },
    create: { slug: SLUG, name: NAMA, database_url: contoh.database_url, aktif: true },
    update: { name: NAMA, aktif: true },
  })
  console.log(`[demo] Tenant ${SLUG} siap`)

  await copyGlobalToTenant(tenant.id)
  const db = await getTenantDb(SLUG)

  await db.appUser.upsert({
    where:  { id: `demo-reviewer-${SLUG}` },
    create: {
      id: `demo-reviewer-${SLUG}`, tenant_slug: SLUG,
      name: 'Meta Reviewer', email: EMAIL,
      password_hash: await hashPassword(SANDI),
      roles: ['SUPER_ADMIN'], aktif: true,
    },
    update: { password_hash: await hashPassword(SANDI), aktif: true },
  })
  console.log(`[demo] Akun peninjau: ${EMAIL}`)

  let pesanTotal = 0
  for (const p of PERCAKAPAN) {
    const mulai = Date.now() - p.jamLalu * 3_600_000

    const pct = await db.conversation.upsert({
      where:  { tenant_slug_channel_channel_user_id: {
        tenant_slug: SLUG, channel: p.kanal, channel_user_id: p.psid } },
      create: {
        tenant_slug: SLUG, channel: p.kanal, channel_user_id: p.psid,
        channel_user_name: p.nama, status: 'OPEN',
        last_message_at: new Date(mulai + p.pesan[p.pesan.length - 1].menitSetelah * 60_000),
      },
      update: { channel_user_name: p.nama },
    })

    for (const [i, m] of p.pesan.entries()) {
      const waktu = new Date(mulai + m.menitSetelah * 60_000)
      const eid   = `${p.psid}-${i}`
      const isi = {
        direction: (m.dari === 'halaman' ? 'outgoing' : 'incoming') as 'outgoing' | 'incoming',
        content: m.teks, status: 'SENT' as const, sent_at: waktu,
      }
      const ada = await db.message.findFirst({
        where: { conversation_id: pct.id, external_id: eid }, select: { id: true },
      })
      if (ada) await db.message.update({ where: { id: ada.id }, data: isi })
      else {
        await db.message.create({ data: { conversation_id: pct.id, external_id: eid, created_at: waktu, ...isi } })
        pesanTotal++
      }
    }
  }

  console.log(`[demo] ${PERCAKAPAN.length} percakapan, ${pesanTotal} pesan baru`)
  console.log(`[demo] Selesai. Masuk lewat /${SLUG} dengan email di atas.`)
}

main().catch(e => { console.error(e); process.exit(1) })
