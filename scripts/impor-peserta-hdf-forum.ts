/**
 * Impor peserta HDF Forum 2026 dari Excel Google Form ke Person + KegiatanPeserta.
 * DEFAULT DRY-RUN (hitung tanpa menulis). Untuk benar-benar menulis: DRY_RUN=false.
 *
 * Pemetaan: NAMA LENGKAP→Person.name, ALAMAT LENGKAP→Person.alamat,
 *   NOMOR HANDPHONE→Person.no_hp (dinormalisasi), KETERANGAN→KegiatanPeserta.catatan.
 * Person dicocokkan by no_hp/no_hp_2 (dedup); kalau belum ada → dibuat (sumber KEGIATAN).
 * Idempotent: peserta yang sudah tertaut dilewati. Poin & loyalty mengikuti kegiatan.
 *
 * Jalankan (dry):  DATABASE_URL="<public url>" npx tsx scripts/impor-peserta-hdf-forum.ts
 * Jalankan (tulis): DRY_RUN=false DATABASE_URL="<public url>" npx tsx scripts/impor-peserta-hdf-forum.ts
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as XLSX from 'xlsx'
import { normalizePhone } from '../src/lib/phone'

const FILE        = '/Users/brian/Downloads/HDF FORUM 2026 (Responses).xlsx'
const SLUG        = 'rkz'
const KEGIATAN_ID = '5067a426-2a1c-4dcb-ab21-260835f7c5d5'
const DRY         = process.env.DRY_RUN !== 'false'   // default: dry-run

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

const COL = { nama: 'NAMA LENGKAP', alamat: 'ALAMAT LENGKAP', hp: 'NOMOR HANDPHONE (081*******)', ket: 'KETERANGAN' }
const validPhone = (p: string) => /^08\d{7,13}$/.test(p)

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib diisi (public url prod)')
  console.log(`Mode: ${DRY ? 'DRY-RUN (tidak menulis)' : '⚠️  MENULIS ke DB'}`)

  const kegiatan = await db.kegiatan.findFirst({ where: { id: KEGIATAN_ID, tenant_slug: SLUG } })
  if (!kegiatan) throw new Error('Kegiatan HDF Forum 2026 tidak ditemukan di DB ini')
  console.log(`Kegiatan: "${kegiatan.nama}" | poin/peserta: ${kegiatan.poin_kegiatan}\n`)

  // ── Baca Excel ──
  const wb = XLSX.readFile(FILE)
  const ws = wb.Sheets['Form Responses 1']
  const raw = XLSX.utils.sheet_to_json<any>(ws, { defval: '' })
  const rows = raw.map((r: any, i: number) => {
    const name    = String(r[COL.nama] ?? '').trim()
    const alamat  = String(r[COL.alamat] ?? '').trim() || null
    const noHp    = normalizePhone(String(r[COL.hp] ?? ''))
    const catatan = String(r[COL.ket] ?? '').trim() || null
    return { baris: i + 2, name, alamat, noHp: noHp || null, phoneOk: validPhone(noHp), catatan }
  }).filter((r) => r.name)   // lewati baris tanpa nama

  console.log(`Baris berdata (ada nama): ${rows.length}`)

  // ── Cocokkan Person by phone (1 kueri batch) ──
  const phones = Array.from(new Set(rows.filter((r) => r.phoneOk).map((r) => r.noHp!)))
  const found = phones.length
    ? await db.person.findMany({
        where: { tenant_slug: SLUG, OR: [{ no_hp: { in: phones } }, { no_hp_2: { in: phones } }] },
        select: { id: true, no_hp: true, no_hp_2: true },
      })
    : []
  const resolved = new Map<string, string>()   // phone -> personId
  for (const p of found) { if (p.no_hp) resolved.set(p.no_hp, p.id); if (p.no_hp_2) resolved.set(p.no_hp_2, p.id) }

  const linked = new Set(
    (await db.kegiatanPeserta.findMany({ where: { kegiatan_id: KEGIATAN_ID }, select: { person_id: true } })).map((x) => x.person_id),
  )

  // ── Proses tiap baris ──
  let personBaru = 0, pesertaBaru = 0, dilewati = 0, tanpaHp = 0
  const flag: string[] = []

  for (const r of rows) {
    let personId = r.phoneOk ? resolved.get(r.noHp!) : undefined

    if (!personId) {
      // perlu buat Person baru
      if (!r.phoneOk) { tanpaHp++; flag.push(`  baris ${r.baris}: "${r.name}" — no HP tidak valid ("${r.noHp ?? ''}"), dibuat tanpa HP`) }
      if (DRY) {
        personId = `NEW:${r.phoneOk ? r.noHp : 'b' + r.baris}`
      } else {
        const np = await db.person.create({
          data: { tenant_slug: SLUG, name: r.name, alamat: r.alamat, no_hp: r.phoneOk ? r.noHp : null, sumber: 'KEGIATAN', aktif: true },
        })
        personId = np.id
      }
      personBaru++
      if (r.phoneOk) resolved.set(r.noHp!, personId)
    }

    if (linked.has(personId)) { dilewati++; continue }   // sudah jadi peserta (idempotent / dupe dalam file)

    if (!DRY) {
      await db.kegiatanPeserta.create({
        data: { kegiatan_id: KEGIATAN_ID, person_id: personId, tenant_slug: SLUG, hadir: true, poin_diberikan: kegiatan.poin_kegiatan, sumber: 'import', catatan: r.catatan },
      })
      if (kegiatan.poin_kegiatan > 0) {
        await db.loyaltyTransaction.create({
          data: { tenant_slug: SLUG, person_id: personId, jenis: 'KEGIATAN', poin: kegiatan.poin_kegiatan, ref_id: KEGIATAN_ID, keterangan: `Hadir: ${kegiatan.nama}` },
        })
      }
    }
    linked.add(personId)
    pesertaBaru++
  }

  console.log('\n=== RINGKASAN ===')
  console.log(`  Person baru dibuat   : ${personBaru}`)
  console.log(`  Peserta baru ditaut  : ${pesertaBaru}`)
  console.log(`  Dilewati (sudah ada) : ${dilewati}`)
  console.log(`  Tanpa HP valid       : ${tanpaHp}`)
  if (flag.length) { console.log('\n=== PERLU DIPERHATIKAN ==='); flag.forEach((f) => console.log(f)) }
  console.log(`\n${DRY ? '🔎 DRY-RUN selesai — belum ada yang ditulis. Jalankan lagi dengan DRY_RUN=false untuk eksekusi.' : '✅ SELESAI menulis.'}`)
}

main().catch((e) => { console.error('GAGAL:', e.message); process.exit(1) }).finally(() => db.$disconnect())
