/**
 * Seed dummy conversations + messages ke Railway untuk testing inbox
 * Jalankan: DATABASE_URL="..." npx tsx scripts/seed-dummy-chat.ts
 */
import { Client } from 'pg'
import { randomUUID } from 'crypto'

const TENANT_SLUG = 'rkz'

const DUMMY_CONVS = [
  {
    nama: 'Brian Mursidi', no_hp: '08170630330',
    status: 'OPEN',
    messages: [
      { dir: 'IN',  text: 'Selamat pagi, saya ingin tanya jadwal poli jantung', menit: -60 },
      { dir: 'OUT', text: 'Selamat pagi Pak Brian! Poli Jantung buka Senin-Jumat pukul 08.00-12.00. Ada yang bisa kami bantu lebih lanjut?', menit: -55 },
      { dir: 'IN',  text: 'Apakah perlu buat janji dulu?', menit: -50 },
      { dir: 'OUT', text: 'Sebaiknya buat janji terlebih dahulu agar tidak terlalu lama menunggu. Bisa melalui WhatsApp ini atau datang langsung ke loket pendaftaran.', menit: -45 },
      { dir: 'IN',  text: 'Baik terima kasih infonya', menit: -40 },
    ],
  },
  {
    nama: 'Siti Rahayu', no_hp: '081234567890',
    status: 'PENDING',
    messages: [
      { dir: 'IN',  text: 'Halo, apakah ada dokter spesialis anak hari ini?', menit: -120 },
      { dir: 'OUT', text: 'Halo Ibu Siti! Hari ini Dr. Bambang SpA praktek pukul 09.00-13.00 dan Dr. Lestari SpA pukul 14.00-17.00.', menit: -115 },
      { dir: 'IN',  text: 'Anak saya demam 3 hari, perlu langsung ke IGD atau bisa ke poli?', menit: -30 },
    ],
  },
  {
    nama: 'Antonius Wijaya', no_hp: '082145678901',
    status: 'RESOLVED',
    messages: [
      { dir: 'IN',  text: 'Permisi, saya sudah operasi 2 minggu lalu, kapan kontrol berikutnya?', menit: -1440 },
      { dir: 'OUT', text: 'Selamat siang Pak Antonius. Untuk jadwal kontrol pasca operasi, kami perlu konfirmasi dengan dokter bedah yang menangani. Boleh share nama dokternya?', menit: -1430 },
      { dir: 'IN',  text: 'Dr. Handoko SpB', menit: -1420 },
      { dir: 'OUT', text: 'Baik, Dr. Handoko biasanya kontrol 2-3 minggu pasca operasi. Kami sarankan datang minggu ini di hari Rabu atau Kamis pukul 10.00-12.00.', menit: -1410 },
      { dir: 'IN',  text: 'Oke terima kasih banyak', menit: -1400 },
      { dir: 'OUT', text: 'Sama-sama Pak. Semoga lekas pulih 🙏', menit: -1395 },
    ],
  },
  {
    nama: 'Maria Susanti', no_hp: '085678901234',
    status: 'OPEN',
    messages: [
      { dir: 'IN',  text: 'Dok, saya ingin tanya soal hasil lab kemarin', menit: -20 },
      { dir: 'IN',  text: 'Hemoglobin saya 9.5 apakah normal?', menit: -18 },
    ],
  },
  {
    nama: 'Yohanes Santoso', no_hp: '087890123456',
    status: 'RESOLVED',
    messages: [
      { dir: 'IN',  text: 'Apakah RKZ melayani BPJS untuk poli mata?', menit: -2880 },
      { dir: 'OUT', text: 'Ya Pak Yohanes, kami menerima BPJS untuk hampir semua poli termasuk Poli Mata. Pastikan membawa kartu BPJS dan surat rujukan dari Faskes 1.', menit: -2870 },
      { dir: 'IN',  text: 'Terima kasih infonya', menit: -2860 },
    ],
  },
]

function minsAgo(menit: number) {
  return new Date(Date.now() + menit * 60 * 1000)
}

async function main() {
  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })
  await pg.connect()
  console.log('✓ PostgreSQL terhubung')

  // Ambil beberapa person yang sudah ada
  const { rows: persons } = await pg.query(
    `SELECT id, name, no_hp FROM crm_persons WHERE tenant_slug=$1 AND no_hp IS NOT NULL LIMIT 10`,
    [TENANT_SLUG]
  )

  let convCount = 0, msgCount = 0

  for (let i = 0; i < DUMMY_CONVS.length; i++) {
    const d = DUMMY_CONVS[i]
    // Pakai person dari DB kalau ada, fallback ke dummy
    const person = persons[i] || null
    const personId = person?.id || null
    const namaDisplay = person?.name || d.nama
    const noHp = person?.no_hp || d.no_hp

    const convId = randomUUID()
    const lastMsg = d.messages[d.messages.length - 1]
    const lastAt = minsAgo(lastMsg.menit)

    const { rows: convRows } = await pg.query(`
      INSERT INTO crm_conversations (
        id, tenant_slug, person_id, channel, channel_user_id,
        status, last_message_at, unread_count, created_at
      ) VALUES ($1,$2,$3,'WA',$4,$5,$6,$7,$8)
      ON CONFLICT (tenant_slug, channel, channel_user_id) DO UPDATE SET last_message_at=EXCLUDED.last_message_at
      RETURNING id
    `, [
      convId, TENANT_SLUG, personId, noHp,
      d.status,
      lastAt,
      d.messages.filter(m => m.dir === 'IN').length,
      minsAgo(d.messages[0].menit),
    ])
    const actualConvId = convRows[0]?.id || convId
    convCount++

    for (const m of d.messages) {
      await pg.query(`
        INSERT INTO crm_messages (
          id, conversation_id, direction, content, status, created_at
        ) VALUES ($1,$2,$3,$4,'DELIVERED',$5)
        ON CONFLICT DO NOTHING
      `, [
        randomUUID(), actualConvId,
        m.dir === 'IN' ? 'incoming' : 'outgoing',
        m.text,
        minsAgo(m.menit),
      ])
      msgCount++
    }
  }

  console.log(`✅ ${convCount} conversations, ${msgCount} messages seeded`)
  await pg.end()
}

main().catch(e => { console.error(e); process.exit(1) })
