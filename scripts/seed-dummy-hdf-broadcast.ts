/**
 * DUMMY broadcast "D - Event HDF Forum 2026" untuk demo funnel konversi jenis KEGIATAN.
 *
 * Skenario: broadcast (undangan HDF Forum) ke alumni 6 kegiatan RKZ; 8 di antaranya
 * mendaftar HDF Forum = KONVERSI NYATA (dibaca dari data keikutsertaan, TANPA fabrikasi).
 * 20 orang membalas chat (disimulasikan lewat replied_at + sentimen, TANPA menyentuh
 * inbox nyata). TIDAK ada WhatsApp yang benar-benar dikirim.
 *
 * Menulis HANYA: 1 Campaign + N CampaignRecipient. Reversible penuh:
 *   DELETE FROM crm_campaign_recipients WHERE campaign_id IN (SELECT id FROM crm_campaigns WHERE tenant_slug='rkz' AND nama LIKE 'D - %');
 *   DELETE FROM crm_campaigns WHERE tenant_slug='rkz' AND nama LIKE 'D - %';
 *
 * Jalankan: DATABASE_URL="<public url prod>" npx tsx scripts/seed-dummy-hdf-broadcast.ts
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const SLUG = 'rkz'
const HDF  = '5067a426-2a1c-4dcb-ab21-260835f7c5d5'
const NAMA = 'D - Event HDF Forum 2026'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

type Sentimen = 'tertarik' | 'tanya' | 'menolak' | 'komplain' | 'salah_sasaran'

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib (public url prod)')

  const admin = await db.appUser.findFirst({ where: { tenant_slug: SLUG }, orderBy: { created_at: 'asc' }, select: { id: true } })
  if (!admin) throw new Error('AppUser admin tidak ditemukan')

  // ── Tentukan 6 kegiatan = event yang berbagi peserta dengan HDF ──
  const hdfPeserta = await db.kegiatanPeserta.findMany({ where: { kegiatan_id: HDF }, select: { person_id: true } })
  const hdfPersonIds = Array.from(new Set(hdfPeserta.map(x => x.person_id)))
  const shared = await db.kegiatanPeserta.findMany({ where: { person_id: { in: hdfPersonIds }, kegiatan_id: { not: HDF } }, select: { kegiatan_id: true } })
  const eventIds = Array.from(new Set(shared.map(x => x.kegiatan_id)))
  console.log(`Event sumber penerima: ${eventIds.length}`)

  // ── Penerima = peserta 6 event itu, punya Person valid + no_hp ──
  const pesertaRows = await db.kegiatanPeserta.findMany({ where: { kegiatan_id: { in: eventIds } }, select: { person_id: true } })
  const candidateIds = Array.from(new Set(pesertaRows.map(x => x.person_id)))
  const persons = await db.person.findMany({
    where: { id: { in: candidateIds }, tenant_slug: SLUG, no_hp: { not: null } },
    select: { id: true, name: true, no_hp: true },
  })
  console.log(`Penerima valid (Person + HP): ${persons.length}`)

  const hdfSet = new Set(hdfPersonIds)
  const converters = persons.filter(p => hdfSet.has(p.id))    // konversi nyata
  console.log(`Konversi nyata (penerima yg juga peserta HDF): ${converters.length}`)

  // ── Bersihkan dummy lama (idempotent) ──
  const lama = await db.campaign.findMany({ where: { tenant_slug: SLUG, nama: NAMA }, select: { id: true } })
  if (lama.length) {
    await db.campaignRecipient.deleteMany({ where: { campaign_id: { in: lama.map(c => c.id) } } })
    await db.campaign.deleteMany({ where: { id: { in: lama.map(c => c.id) } } })
    console.log(`Hapus ${lama.length} dummy lama.`)
  }

  const now = Date.now()
  const started = new Date(now - 3 * 86_400_000)   // anchor: 3 hari lalu

  // ── Tentukan 20 pembalas: 8 konverter (tertarik) + 12 lain (sentimen campur) ──
  const converterIds = new Set(converters.map(c => c.id))
  const nonKonv = persons.filter(p => !converterIds.has(p.id))
  const lain12 = nonKonv.slice(0, 12)
  const sentimenLain: Sentimen[] = ['tanya','tanya','tanya','tanya','tanya','menolak','menolak','menolak','komplain','komplain','salah_sasaran','tertarik']
  const balasMap = new Map<string, Sentimen>()
  for (const c of converters) balasMap.set(c.id, 'tertarik')
  lain12.forEach((p, i) => balasMap.set(p.id, sentimenLain[i] ?? 'tanya'))

  // ── Bangun campaign ──
  const camp = await db.campaign.create({
    data: {
      tenant_slug: SLUG, nama: NAMA, status: 'DONE',
      template_params: {}, kode_layanan_promo: [], kirim_dua_nomor: false,
      jenis_konversi: 'KEGIATAN', konversi_kegiatan_id: HDF,
      jadwal_kirim: started, started_at: started, finished_at: new Date(now - 2 * 86_400_000),
      created_by: admin.id,
    },
  })

  // ── Bangun baris penerima (deterministik) ──
  let terkirim = 0, diterima = 0, dibaca = 0, gagal = 0, dibalas = 0
  const rows = persons.map((p, idx) => {
    const gagalRow = idx % 16 === 0                     // ~6% gagal
    const sentAt = new Date(started.getTime() + idx * 1000)
    let status = 'SENT', error_code: string | null = null
    let delivered_at: Date | null = null, read_at: Date | null = null, replied_at: Date | null = null
    let sentimen: Sentimen | null = null, sentimen_at: Date | null = null

    if (gagalRow) {
      status = 'FAILED'; error_code = idx % 32 === 0 ? '131047' : '131026'; gagal++
    } else {
      terkirim++
      if (idx % 7 !== 0) { delivered_at = new Date(sentAt.getTime() + 120_000); diterima++ }        // ~85%
      if (delivered_at && idx % 2 === 0) { read_at = new Date(delivered_at.getTime() + 3_600_000); dibaca++ } // ~50% dr delivered
      const s = balasMap.get(p.id)
      if (s) { replied_at = new Date(sentAt.getTime() + 4 * 3_600_000); sentimen = s; sentimen_at = replied_at; dibalas++ }
    }
    return {
      campaign_id: camp.id, person_id: p.id, no_hp: p.no_hp!, nomor_ke: 'utama', nama: p.name,
      status: status as any, error_code, sent_at: gagalRow ? null : sentAt, delivered_at, read_at, replied_at,
      sentimen, sentimen_at,
    }
  })
  await db.campaignRecipient.createMany({ data: rows })

  await db.campaign.update({
    where: { id: camp.id },
    data: { total_penerima: persons.length, total_terkirim: terkirim, total_diterima: diterima, total_dibaca: dibaca, total_dibalas: dibalas, total_gagal: gagal },
  })

  console.log('\n=== SELESAI ===')
  console.log(`  Campaign     : ${NAMA} (${camp.id})`)
  console.log(`  Penerima     : ${persons.length} | Terkirim ${terkirim} | Diterima ${diterima} | Dibaca ${dibaca} | Dibalas ${dibalas} | Gagal ${gagal}`)
  console.log(`  Konversi(HDF): ${converters.length} (nyata, dari data keikutsertaan)`)
}

main().catch(e => { console.error('GAGAL:', e.message); process.exit(1) }).finally(() => db.$disconnect())
