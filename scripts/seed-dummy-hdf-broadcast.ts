/**
 * DUMMY broadcast "D - Event HDF Forum 2026" untuk demo funnel konversi jenis KEGIATAN.
 *
 * Skenario: broadcast (undangan HDF Forum) ke alumni 6 kegiatan RKZ; 8 di antaranya
 * mendaftar HDF Forum = KONVERSI NYATA (dari data keikutsertaan, TANPA fabrikasi).
 * ~20 membalas chat (disimulasikan lewat replied_at + sentimen; sentimen hanya
 * tertarik/tanya/menolak). TIDAK ada WhatsApp yang benar-benar dikirim.
 *
 * TANGGAL: tanggal pendaftaran HDF diselaraskan ke timestamp Google Form asli
 * (17 Jun–3 Jul 2026). Broadcast tiap penerima H-1 dari pendaftaran; anchor campaign =
 * pendaftaran paling awal −1 hari.
 *
 * Menulis: 1 Campaign + N CampaignRecipient, dan MEMPERBAIKI created_at KegiatanPeserta
 * HDF ke tanggal pendaftaran asli. Reversible (campaign): hapus by nama 'D - %'.
 *
 * Jalankan: DATABASE_URL="<public url prod>" npx tsx scripts/seed-dummy-hdf-broadcast.ts
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as XLSX from 'xlsx'
import { normalizePhone } from '../src/lib/phone'

const SLUG = 'rkz'
const HDF  = '5067a426-2a1c-4dcb-ab21-260835f7c5d5'
const NAMA = 'D - Event HDF Forum 2026'
const FILE = '/Users/brian/Downloads/HDF FORUM 2026 (Responses).xlsx'
const HARI = 86_400_000
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

type Sentimen = 'tertarik' | 'tanya' | 'menolak'
const ser2date = (s: any) => new Date(Math.round((Number(s) - 25569) * 86400 * 1000))

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib (public url prod)')
  const admin = await db.appUser.findFirst({ where: { tenant_slug: SLUG }, orderBy: { created_at: 'asc' }, select: { id: true } })
  if (!admin) throw new Error('AppUser admin tidak ditemukan')

  // ── Timestamp Google Form: no_hp → tanggal daftar ──
  const rowsX = XLSX.utils.sheet_to_json<any>(XLSX.readFile(FILE).Sheets['Form Responses 1'], { defval: '' })
  const phoneToReg = new Map<string, Date>()
  for (const r of rowsX) {
    const ph = normalizePhone(String(r['NOMOR HANDPHONE (081*******)'] ?? ''))
    const ts = Number(r['Timestamp'])
    if (ph && !isNaN(ts) && ts > 0) phoneToReg.set(ph, ser2date(ts))
  }

  // ── Selaraskan created_at KegiatanPeserta HDF ke tanggal pendaftaran asli ──
  const hdfPes = await db.kegiatanPeserta.findMany({ where: { kegiatan_id: HDF }, select: { id: true, person_id: true, person: { select: { no_hp: true } } } })
  let diperbaiki = 0
  for (const kp of hdfPes) {
    const reg = kp.person?.no_hp ? phoneToReg.get(kp.person.no_hp) : undefined
    if (reg) { await db.kegiatanPeserta.update({ where: { id: kp.id }, data: { created_at: reg } }); diperbaiki++ }
  }
  console.log(`created_at HDF diselaraskan ke tanggal daftar: ${diperbaiki}`)
  const hdfSet = new Set(hdfPes.map(k => k.person_id))

  // ── Penerima = peserta 6 event yg berbagi peserta dg HDF, punya Person valid + no_hp ──
  const hdfPersonIds = Array.from(hdfSet)
  const shared = await db.kegiatanPeserta.findMany({ where: { person_id: { in: hdfPersonIds }, kegiatan_id: { not: HDF } }, select: { kegiatan_id: true } })
  const eventIds = Array.from(new Set(shared.map(x => x.kegiatan_id)))
  const pesertaRows = await db.kegiatanPeserta.findMany({ where: { kegiatan_id: { in: eventIds } }, select: { person_id: true } })
  const persons = await db.person.findMany({
    where: { id: { in: Array.from(new Set(pesertaRows.map(x => x.person_id))) }, tenant_slug: SLUG, no_hp: { not: null } },
    select: { id: true, name: true, no_hp: true },
  })
  const converters = persons.filter(p => hdfSet.has(p.id))
  console.log(`Penerima valid: ${persons.length} | Konversi nyata: ${converters.length}`)

  // ── Anchor = pendaftaran konverter paling awal −1 hari ──
  const regKonv = converters.map(c => phoneToReg.get(c.no_hp!) ?? new Date('2026-07-03T00:00:00Z'))
  const minReg = new Date(Math.min(...regKonv.map(d => d.getTime())))
  const started = new Date(minReg.getTime() - HARI)   // H-1 pendaftaran paling awal
  const regByPerson = new Map(converters.map((c, i) => [c.id, regKonv[i]]))

  // ── Bersihkan dummy lama ──
  const lama = await db.campaign.findMany({ where: { tenant_slug: SLUG, nama: NAMA }, select: { id: true } })
  if (lama.length) {
    await db.campaignRecipient.deleteMany({ where: { campaign_id: { in: lama.map(c => c.id) } } })
    await db.campaign.deleteMany({ where: { id: { in: lama.map(c => c.id) } } })
  }

  // ── Pembalas: 8 konverter (tertarik) + 12 lain (tanya/menolak/tertarik) ──
  const converterIds = new Set(converters.map(c => c.id))
  const lain12 = persons.filter(p => !converterIds.has(p.id)).slice(0, 12)
  const sentimenLain: Sentimen[] = ['tanya','tanya','tanya','tanya','tanya','tanya','tanya','menolak','menolak','menolak','tertarik','tertarik']
  const balasMap = new Map<string, Sentimen>()
  for (const c of converters) balasMap.set(c.id, 'tertarik')
  lain12.forEach((p, i) => balasMap.set(p.id, sentimenLain[i] ?? 'tanya'))

  const camp = await db.campaign.create({
    data: {
      tenant_slug: SLUG, nama: NAMA, status: 'DONE',
      template_params: {}, kode_layanan_promo: [], kirim_dua_nomor: false,
      jenis_konversi: 'KEGIATAN', konversi_kegiatan_id: HDF,
      jadwal_kirim: started, started_at: started, finished_at: new Date(started.getTime() + 3600_000),
      created_by: admin.id,
    },
  })

  let terkirim = 0, diterima = 0, dibaca = 0, gagal = 0, dibalas = 0
  const rows = persons.map((p, idx) => {
    const gagalRow = idx % 16 === 0
    const reg = regByPerson.get(p.id)                          // konverter → tanggal daftar
    const sentAt = reg ? new Date(reg.getTime() - HARI)        // konverter: H-1 pendaftarannya
                       : new Date(started.getTime() + idx * 1000)
    let status = 'SENT', error_code: string | null = null
    let delivered_at: Date | null = null, read_at: Date | null = null, replied_at: Date | null = null
    let sentimen: Sentimen | null = null, sentimen_at: Date | null = null

    if (gagalRow) {
      status = 'FAILED'; error_code = idx % 32 === 0 ? '131047' : '131026'; gagal++
    } else {
      terkirim++
      if (idx % 7 !== 0) { delivered_at = new Date(sentAt.getTime() + 120_000); diterima++ }
      if (delivered_at && idx % 2 === 0) { read_at = new Date(delivered_at.getTime() + 3600_000); dibaca++ }
      const s = balasMap.get(p.id)
      if (s) { replied_at = new Date(sentAt.getTime() + 6 * 3600_000); sentimen = s; sentimen_at = replied_at; dibalas++ }
    }
    return {
      campaign_id: camp.id, person_id: p.id, no_hp: p.no_hp!, nomor_ke: 'utama', nama: p.name,
      status: status as any, error_code, sent_at: gagalRow ? null : sentAt, delivered_at, read_at, replied_at,
      sentimen, sentimen_at,
    }
  })
  await db.campaignRecipient.createMany({ data: rows })
  await db.campaign.update({ where: { id: camp.id }, data: { total_penerima: persons.length, total_terkirim: terkirim, total_diterima: diterima, total_dibaca: dibaca, total_dibalas: dibalas, total_gagal: gagal } })

  console.log('\n=== SELESAI ===')
  console.log(`  Campaign : ${NAMA} (${camp.id})`)
  console.log(`  Anchor (broadcast) : ${started.toISOString().slice(0,10)} (H-1 pendaftaran paling awal ${minReg.toISOString().slice(0,10)})`)
  console.log(`  Penerima ${persons.length} | Terkirim ${terkirim} | Diterima ${diterima} | Dibaca ${dibaca} | Dibalas ${dibalas} | Gagal ${gagal}`)
  console.log(`  Konversi(HDF) : ${converters.length}`)
}

main().catch(e => { console.error('GAGAL:', e.message); process.exit(1) }).finally(() => db.$disconnect())
