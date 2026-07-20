/**
 * Seed CAMPAIGN DUMMY: promo Suntik Vitamin B Kompleks (Maret 2026).
 *
 * Tujuan: menyediakan data realistis untuk membangun & menguji fitur EVALUASI
 * CAMPAIGN — mengukur balasan chat (beserta sentimennya) dan konversi kunjungan
 * sesudah campaign, dicocokkan lewat NOMOR HP (bukan person_id), karena yang
 * membalas bisa saja keluarga/wali, bukan pasiennya sendiri.
 *
 * ATURAN PENTING:
 * - Semua penerima adalah person dummy (`simrs_patient_id` awalan 'DUMMY-').
 *   Skrip berhenti kalau menemukan person non-dummy ikut terpilih.
 * - Tidak ada pesan yang benar-benar dikirim. Baris campaign ditulis langsung
 *   ke DB dengan status akhir. Pengaman jalur kirim ada di src/lib/test-data-guard.ts.
 * - Kode & nama layanan diambil dari crm_simrs_layanan_library (data asli RKZ),
 *   tidak dikarang.
 *
 * Kasus yang sengaja dimasukkan (penting untuk menguji logika evaluasi):
 * - 1 balasan datang dari nomor ALTERNATIF (no_hp_2, mis. HP istri) — menguji
 *   pencocokan lewat nomor, bukan person_id.
 * - 1 orang konversi TANPA pernah membalas — supaya evaluasi tidak menyimpulkan
 *   "tidak balas = tidak konversi".
 * - 1 orang datang tapi mengambil PRODUK LAIN (Multivitamin Infus, bukan Vit. B).
 * - Balasan bersentimen campur: tertarik, tanya harga, menolak, komplain, salah sasaran.
 *
 * Hapus total (aman, hanya menyentuh data dummy):
 *   DELETE FROM crm_messages WHERE conversation_id IN (SELECT id FROM crm_conversations WHERE channel_user_id LIKE '089990%');
 *   DELETE FROM crm_conversations WHERE channel_user_id LIKE '089990%';
 *   DELETE FROM crm_campaign_recipients WHERE campaign_id IN (SELECT id FROM crm_campaigns WHERE nama LIKE '[DUMMY]%');
 *   DELETE FROM crm_campaigns WHERE nama LIKE '[DUMMY]%';
 *   DELETE FROM crm_segment_persons WHERE segment_id IN (SELECT id FROM crm_segments WHERE nama LIKE '[DUMMY]%');
 *   DELETE FROM crm_segments WHERE nama LIKE '[DUMMY]%';
 *   DELETE FROM crm_simrs_visits WHERE simrs_visit_id LIKE 'DUMMY-CAMP-%';
 *   DELETE FROM crm_broadcast_templates WHERE template_name='promo_vit_b_kompleks_dummy';
 *
 * Uji tanpa menulis: DRY_RUN=1 DATABASE_URL="..." npx tsx scripts/seed-dummy-campaign.ts
 * Jalankan:          DATABASE_URL="..." npx tsx scripts/seed-dummy-campaign.ts
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { PENANDA_PERSON_UJI } from '../src/lib/test-data-guard'

const SLUG = 'rkz'
const DRY_RUN = process.env.DRY_RUN === '1'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

const KIRIM        = new Date('2026-03-10T09:00:00+07:00')
const NAMA_CAMPAIGN = '[DUMMY] Promo Suntik Vit. B Kompleks — Maret 2026'
const NAMA_SEGMEN   = '[DUMMY] Kandidat Promo Vit. B Kompleks'
const TEMPLATE_NAME = 'promo_vit_b_kompleks_dummy'

const KODE_VIT_B    = '4419'   // PAKET BOOSTER VIT. B KOMPLEKS (INJEKSI IM)
const KODE_INFUS    = '4417'   // PAKET BOOSTER MULTIVITAMIN (INFUS) — konversi ke produk lain

const menit = (n: number) => new Date(KIRIM.getTime() + n * 60_000)
const hari  = (n: number) => new Date(KIRIM.getTime() + n * 86_400_000)

/** 'HP Istri' → 'istri' — untuk menyusun kalimat balasan dari nomor alternatif. */
function relasiDariLabel(label: string | null): string {
  const l = (label ?? '').replace(/^HP\s+/i, '').trim().toLowerCase()
  return l || 'keluarga'
}

const PESAN_PROMO =
  'Halo {{1}}, RKZ Surabaya mengadakan promo Suntik Vitamin B Kompleks di Pondok Sehat ' +
  'sepanjang Maret 2026. Membantu menjaga stamina dan mengurangi rasa lelah. ' +
  'Balas pesan ini untuk info jadwal dan biaya ya. 🙏'

/** Rencana per penerima. idx 0-1 = yang punya nomor alternatif. */
type Sentimen = 'tertarik' | 'tanya' | 'menolak' | 'komplain' | 'salah_sasaran'
type Rencana = {
  idx:       number
  balas?:    { dariAlternatif?: boolean; sentimen: Sentimen; teks: string; jamSetelah: number; balasanAdmin?: string }
  konversi?: { hariSetelah: number; kode: string }
}

const RENCANA: Rencana[] = [
  // ── Kasus kunci: balasan dari nomor istri, lalu pasien datang ambil PRODUK LAIN ──
  { idx: 0,
    balas: { dariAlternatif: true, sentimen: 'tanya', jamSetelah: 5,
      // {{RELASI}} diisi dari no_hp_2_label saat runtime — supaya isi pesan tidak
      // pernah bertentangan dengan label nomor yang tersimpan.
      teks: 'Halo, ini {{RELASI}} beliau. Pasiennya tertarik suntik vitaminnya, tapi mau tanya dulu bedanya dengan yang infus apa ya?',
      balasanAdmin: 'Halo, terima kasih atas pertanyaannya. Yang injeksi diberikan lewat suntikan (± 10 menit), sedangkan yang infus dialirkan ± 45 menit dan dosis multivitaminnya lebih lengkap. Keduanya tersedia di Pondok Sehat.' },
    konversi: { hariSetelah: 18, kode: KODE_INFUS } },

  // Punya nomor alternatif tapi diam saja — memastikan baris 'alternatif' tetap ada tanpa balasan
  { idx: 1 },

  // ── Balas lalu konversi ──
  { idx: 2,
    balas: { sentimen: 'tertarik', jamSetelah: 2, teks: 'Saya tertarik, jadwalnya hari apa saja ya?',
      balasanAdmin: 'Setiap hari kerja pukul 08.00–14.00 Pak/Bu, tanpa perlu janji temu. Langsung ke Pondok Sehat lantai 1.' },
    konversi: { hariSetelah: 12, kode: KODE_VIT_B } },
  { idx: 3,
    balas: { sentimen: 'tanya', jamSetelah: 26, teks: 'Berapa biayanya untuk sekali suntik?',
      balasanAdmin: 'Untuk paket promo Maret Rp 150.000 sekali suntik Pak/Bu, sudah termasuk konsultasi dokter.' },
    konversi: { hariSetelah: 25, kode: KODE_VIT_B } },

  // ── Konversi TANPA pernah membalas (silent conversion) ──
  { idx: 4, konversi: { hariSetelah: 40, kode: KODE_VIT_B } },

  // ── Balas positif tapi tidak jadi datang ──
  { idx: 5, balas: { sentimen: 'tertarik', jamSetelah: 3, teks: 'Boleh info lengkapnya?',
      balasanAdmin: 'Baik, kami kirimkan detailnya ya. Promo berlaku sampai 31 Maret 2026.' } },
  { idx: 6, balas: { sentimen: 'tertarik', jamSetelah: 30, teks: 'Menarik ini, nanti saya kabari lagi ya' } },

  // ── Bertanya, tidak lanjut ──
  { idx: 7, balas: { sentimen: 'tanya', jamSetelah: 8, teks: 'Apakah bisa pakai BPJS?',
      balasanAdmin: 'Mohon maaf, paket booster vitamin termasuk layanan promotif sehingga belum dijamin BPJS Pak/Bu.' } },
  { idx: 8, balas: { sentimen: 'tanya', jamSetelah: 50, teks: 'Lokasinya di gedung mana ya?' } },

  // ── Menolak sopan ──
  { idx: 9,  balas: { sentimen: 'menolak', jamSetelah: 6,  teks: 'Terima kasih infonya, untuk saat ini belum perlu.' } },
  { idx: 10, balas: { sentimen: 'menolak', jamSetelah: 20, teks: 'Maaf belum berminat.' } },

  // ── Komplain / minta berhenti ──
  { idx: 11, balas: { sentimen: 'komplain', jamSetelah: 1, teks: 'Mohon jangan kirim promo ke nomor ini lagi.',
      balasanAdmin: 'Mohon maaf atas ketidaknyamanannya. Nomor Bapak/Ibu kami keluarkan dari daftar promo.' } },
  { idx: 12, balas: { sentimen: 'komplain', jamSetelah: 15, teks: 'Kenapa saya terus-terusan dapat pesan seperti ini?' } },

  // ── Salah sasaran ──
  { idx: 13, balas: { sentimen: 'salah_sasaran', jamSetelah: 12, teks: 'Ini nomor siapa ya? Sepertinya salah kirim.' } },
]

const TERBACA_SAMPAI = 25   // idx 0..25 membaca pesan
const GAGAL_MULAI    = 37   // idx 37..39 gagal kirim (nomor tidak terdaftar WhatsApp)
const JUMLAH         = 40

async function main() {
  if (DRY_RUN) console.log('[DRY_RUN] tidak akan menulis apa pun\n')

  // ── 1. Acuan dari library asli ──
  const layanan = await db.simrsLayananLibrary.findMany({
    where: { kode_barang: { in: [KODE_VIT_B, KODE_INFUS] } },
    select: { kode_barang: true, nama: true, kelompok: true, jenis: true },
  })
  const byKode = new Map(layanan.map(l => [l.kode_barang, l]))
  for (const k of [KODE_VIT_B, KODE_INFUS]) {
    if (!byKode.has(k)) throw new Error(`Kode layanan ${k} tidak ada di library — batal, jangan mengarang kode.`)
  }
  console.log('Acuan layanan (dari library asli):')
  for (const l of layanan) console.log(`  ${l.kode_barang}  ${l.nama}  [${l.kelompok} / ${l.jenis}]`)

  const admin = await db.appUser.findFirst({ where: { tenant_slug: SLUG }, orderBy: { created_at: 'asc' }, select: { id: true, name: true } })
  if (!admin) throw new Error('Tidak ada AppUser untuk tenant — batal.')

  const sudahAda = await db.campaign.findFirst({ where: { tenant_slug: SLUG, nama: NAMA_CAMPAIGN } })
  if (sudahAda && !DRY_RUN) throw new Error('Campaign dummy sudah ada. Hapus dulu (lihat header file) sebelum seed ulang.')

  // ── 2. Pilih penerima: HANYA person dummy yang punya riwayat kunjungan ──
  const kandidat = await db.person.findMany({
    where: {
      tenant_slug: SLUG,
      simrs_patient_id: { startsWith: PENANDA_PERSON_UJI },
      no_hp: { not: null },
      visits: { some: { tanggal: { lt: KIRIM } } },
    },
    select: { id: true, name: true, no_hp: true, no_hp_2: true, no_hp_2_label: true, simrs_patient_id: true },
    orderBy: { simrs_patient_id: 'asc' },
  })

  const denganAlt = kandidat.filter(p => p.no_hp_2)
  const tanpaAlt  = kandidat.filter(p => !p.no_hp_2)
  if (denganAlt.length < 2 || tanpaAlt.length < JUMLAH - 2) {
    throw new Error(`Kandidat kurang (alt: ${denganAlt.length}, biasa: ${tanpaAlt.length}). Jalankan backfill-hp-dummy.ts dulu.`)
  }
  const penerima = [...denganAlt.slice(0, 2), ...tanpaAlt.slice(0, JUMLAH - 2)]

  // Sabuk pengaman: tidak boleh ada person non-dummy ikut terpilih.
  const nyasar = penerima.filter(p => !p.simrs_patient_id?.startsWith(PENANDA_PERSON_UJI))
  if (nyasar.length) throw new Error(`BATAL: ${nyasar.length} penerima bukan person dummy.`)
  console.log(`\nPenerima: ${penerima.length} person dummy (${denganAlt.slice(0, 2).length} punya nomor alternatif)`)

  const rencanaByIdx = new Map(RENCANA.map(r => [r.idx, r]))

  if (DRY_RUN) {
    console.log('\nRingkasan rencana:')
    console.log(`  baris penerima  : ${JUMLAH + 2} (${JUMLAH} nomor utama + 2 nomor alternatif)`)
    console.log(`  gagal kirim     : ${JUMLAH - GAGAL_MULAI}`)
    console.log(`  dibaca          : ${TERBACA_SAMPAI + 1}`)
    console.log(`  membalas        : ${RENCANA.filter(r => r.balas).length}`)
    console.log(`  konversi        : ${RENCANA.filter(r => r.konversi).length}`)
    console.log('\nDetail balasan:')
    for (const r of RENCANA.filter(x => x.balas)) {
      const p = penerima[r.idx]
      const dari = r.balas!.dariAlternatif ? `${p.no_hp_2} (${p.no_hp_2_label})` : p.no_hp
      console.log(`  [${r.balas!.sentimen.padEnd(13)}] ${p.name.padEnd(22)} dari ${dari}`)
    }
    console.log('\nDetail konversi:')
    for (const r of RENCANA.filter(x => x.konversi)) {
      const p = penerima[r.idx]
      const l = byKode.get(r.konversi!.kode)!
      console.log(`  H+${String(r.konversi!.hariSetelah).padStart(2)}  ${p.name.padEnd(22)} ${l.nama}${r.balas ? '' : '  (tanpa membalas)'}`)
    }
    console.log('\n[DRY_RUN] Selesai — tidak ada yang ditulis.')
    return
  }

  // ── 3. Template ──
  const template = await db.broadcastTemplate.upsert({
    where:  { tenant_slug_template_name: { tenant_slug: SLUG, template_name: TEMPLATE_NAME } },
    update: {},
    create: {
      tenant_slug: SLUG,
      nama: '[DUMMY] Promo Vit. B Kompleks',
      template_name: TEMPLATE_NAME,
      template_language: 'id',
      meta_status: 'APPROVED',
      meta_category: 'MARKETING',
      preview_text: PESAN_PROMO,
      components_schema: [
        { type: 'body', text: PESAN_PROMO,
          parameters: [{ param_key: 'nama', source: 'field', field: 'nama', example: 'Budi Santoso' }] },
      ],
      aktif: true,
    },
  })

  // ── 4. Segmen ──
  const segmen = await db.segment.create({
    data: {
      tenant_slug: SLUG, nama: NAMA_SEGMEN, tipe: 'MANUAL',
      deskripsi: 'Data uji coba — pasien dummy dengan riwayat kunjungan, sasaran promo booster vitamin.',
      created_by: admin.id,
    },
  })
  await db.segmentPerson.createMany({ data: penerima.map(p => ({ segment_id: segmen.id, person_id: p.id })) })

  // ── 5. Campaign ──
  const campaign = await db.campaign.create({
    data: {
      tenant_slug: SLUG, nama: NAMA_CAMPAIGN, status: 'DONE', channel: 'WA',
      template_id: template.id, segment_id: segmen.id,
      kirim_dua_nomor: true,
      // Yang benar-benar dipromosikan (pesannya "Suntik Vitamin B Kompleks" = injeksi).
      // KODE_INFUS (Multivitamin Infus) SENGAJA tidak ikut — itu produk lain yang
      // dikonversi salah satu penerima, bukan yang dipromosikan.
      kode_layanan_promo: [KODE_VIT_B],
      template_params: {},
      jadwal_kirim: KIRIM, started_at: KIRIM, finished_at: menit(18),
      created_by: admin.id,
    },
  })

  // ── 6. Penerima campaign ──
  type BarisPenerima = {
    campaign_id: string; person_id: string; no_hp: string; nomor_ke: string; nama: string
    status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'
    sent_at: Date | null; delivered_at: Date | null; read_at: Date | null; replied_at: Date | null
    error_code: string | null; error_detail: string | null
  }
  const baris: BarisPenerima[] = []

  penerima.forEach((p, idx) => {
    const r      = rencanaByIdx.get(idx)
    const gagal  = idx >= GAGAL_MULAI
    const dibaca = idx <= TERBACA_SAMPAI && !gagal
    const balasUtama = r?.balas && !r.balas.dariAlternatif

    baris.push({
      campaign_id: campaign.id, person_id: p.id, no_hp: p.no_hp!, nomor_ke: 'utama', nama: p.name,
      status:       gagal ? 'FAILED' : balasUtama ? 'READ' : dibaca ? 'READ' : 'DELIVERED',
      sent_at:      gagal ? null : menit(idx % 15),
      delivered_at: gagal ? null : menit((idx % 15) + 2),
      read_at:      gagal || !dibaca ? null : menit((idx % 15) + 40 + idx * 3),
      replied_at:   balasUtama ? new Date(KIRIM.getTime() + r!.balas!.jamSetelah * 3_600_000) : null,
      error_code:   gagal ? 'meta_error' : null,
      error_detail: gagal ? '131026: nomor tidak terdaftar di WhatsApp' : null,
    })

    // Baris kedua untuk nomor alternatif (campaign.kirim_dua_nomor = true)
    if (p.no_hp_2) {
      const balasAlt = r?.balas?.dariAlternatif
      baris.push({
        campaign_id: campaign.id, person_id: p.id, no_hp: p.no_hp_2, nomor_ke: 'alternatif', nama: p.name,
        status:       balasAlt ? 'READ' : 'DELIVERED',
        sent_at:      menit(idx % 15),
        delivered_at: menit((idx % 15) + 2),
        read_at:      balasAlt ? menit((idx % 15) + 55) : null,
        replied_at:   balasAlt ? new Date(KIRIM.getTime() + r!.balas!.jamSetelah * 3_600_000) : null,
        error_code: null, error_detail: null,
      })
    }
  })
  await db.campaignRecipient.createMany({ data: baris })

  // ── 7. Percakapan + pesan ──
  let jmlPesan = 0
  for (const r of RENCANA) {
    if (!r.balas) continue
    const p       = penerima[r.idx]
    const nomor   = r.balas.dariAlternatif ? p.no_hp_2! : p.no_hp!
    const teksIn  = r.balas.teks.replace('{{RELASI}}', relasiDariLabel(p.no_hp_2_label))
    const waktuIn = new Date(KIRIM.getTime() + r.balas.jamSetelah * 3_600_000)
    const adaJawaban = !!r.balas.balasanAdmin
    const waktuOut = new Date(waktuIn.getTime() + 12 * 60_000)

    const conv = await db.conversation.create({
      data: {
        tenant_slug: SLUG, person_id: p.id, channel: 'WA', channel_user_id: nomor,
        status: adaJawaban ? 'RESOLVED' : 'OPEN',
        unread_count: adaJawaban ? 0 : 1,
        last_message_at: adaJawaban ? waktuOut : waktuIn,
        created_at: menit(r.idx % 15),
      },
    })

    // Pesan promo yang dikirim campaign (nama pasien sudah tersubstitusi)
    await db.message.create({
      data: {
        conversation_id: conv.id, direction: 'outgoing',
        content: PESAN_PROMO.replace('{{1}}', p.name),
        status: 'READ', sent_at: menit(r.idx % 15), delivered_at: menit((r.idx % 15) + 2),
        read_at: new Date(waktuIn.getTime() - 30 * 60_000), created_at: menit(r.idx % 15),
      },
    })
    jmlPesan++

    await db.message.create({
      data: {
        conversation_id: conv.id, direction: 'incoming', content: teksIn,
        status: 'DELIVERED', sent_at: waktuIn, created_at: waktuIn,
      },
    })
    jmlPesan++

    if (r.balas.balasanAdmin) {
      await db.message.create({
        data: {
          conversation_id: conv.id, direction: 'outgoing', content: r.balas.balasanAdmin,
          status: 'READ', sent_by: admin.id,
          sent_at: waktuOut, delivered_at: waktuOut, read_at: new Date(waktuOut.getTime() + 5 * 60_000),
          created_at: waktuOut,
        },
      })
      jmlPesan++
    }
  }

  // ── 8. Kunjungan konversi ──
  let noVisit = 1
  for (const r of RENCANA) {
    if (!r.konversi) continue
    const p = penerima[r.idx]
    const l = byKode.get(r.konversi.kode)!
    await db.simrsVisit.create({
      data: {
        person_id: p.id,   // SimrsVisit tidak punya tenant_slug — ikut lewat relasi Person
        tanggal: hari(r.konversi.hariSetelah),
        unit: 'Pondok Sehat', poli: 'Check Up',
        dokter: 'dr. Andi Wijaya, Sp.PD',
        diagnosa_icd: 'Z00.00', diagnosa_nama: 'Pemeriksaan kesehatan umum',
        tindakan: l.nama, tindakan_kode: l.kode_barang,
        jenis_pembayaran: 'TUNAI', nama_instansi: null,
        status_kunjungan: 'SELESAI',
        simrs_visit_id: `DUMMY-CAMP-${String(noVisit++).padStart(3, '0')}`,
        aktif: true,
      },
    })
  }

  // ── 9. Counter campaign (dihitung dari baris nyata, bukan ditebak) ──
  const hitung = {
    total_penerima: baris.length,
    total_terkirim: baris.filter(b => b.status !== 'FAILED').length,
    total_diterima: baris.filter(b => b.delivered_at).length,
    total_dibaca:   baris.filter(b => b.read_at).length,
    total_dibalas:  baris.filter(b => b.replied_at).length,
    total_gagal:    baris.filter(b => b.status === 'FAILED').length,
  }
  await db.campaign.update({
    where: { id: campaign.id },
    data:  { ...hitung, error_summary: { '131026: nomor tidak terdaftar di WhatsApp': hitung.total_gagal } },
  })

  console.log('\nSelesai.')
  console.log(`  campaign        : ${campaign.id}`)
  console.log(`  segmen          : ${penerima.length} anggota`)
  console.log(`  baris penerima  : ${hitung.total_penerima} (termasuk ${baris.filter(b => b.nomor_ke === 'alternatif').length} nomor alternatif)`)
  console.log(`  terkirim/gagal  : ${hitung.total_terkirim}/${hitung.total_gagal}`)
  console.log(`  dibaca/dibalas  : ${hitung.total_dibaca}/${hitung.total_dibalas}`)
  console.log(`  percakapan      : ${RENCANA.filter(r => r.balas).length}, pesan: ${jmlPesan}`)
  console.log(`  kunjungan konversi: ${noVisit - 1}`)
}

main()
  .catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
  .finally(() => db.$disconnect())
