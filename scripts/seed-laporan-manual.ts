/**
 * Impor angka triwulan lampau RKZ dari dokumen laporan manual.
 *
 * Sumber: "2026 LAPORAN DIGITAL MARKETING DAN EKSPOSUR MEDIA TRIWULAN II Final.odt"
 * Table26 (ringkasan IG), Table2 (format IG), Table20 (format FB).
 *
 * Angka-angka ini DIKETIK ULANG dari dokumen — tidak bisa diverifikasi ulang ke
 * Meta karena periodenya sudah jauh melewati jendela riwayat API. Itu sebabnya
 * baris-baris ini disimpan terpisah dari snapshot dan ditandai berbeda di layar.
 *
 * Idempoten: dijalankan berkali-kali menghasilkan keadaan yang sama.
 *   npx tsx scripts/seed-laporan-manual.ts <slug>
 */
import { getTenantDb } from '../src/lib/tenant'

const SUMBER = 'Laporan Triwulan II 2026 (ODT)'
const SLUG = process.argv[2] || 'rkz'

// urutan: penentu urut tampil — periode tidak bisa diurutkan sebagai teks.
const AKUN_IG = [
  { periode: 'TW I 2026',  urutan: 20261, jumlah_konten: 203, follower: 1038, jangkauan: 1218219, interaksi: 74562 },
  { periode: 'TW II 2026', urutan: 20262, jumlah_konten: 198, follower:  655, jangkauan:  192195, interaksi:  8534 },
]

const FORMAT_IG: Record<string, Record<string, number>> = {
  'TW II 2025': { Carousel: 23, Foto: 18, Reels: 32 },
  'TW I 2026':  { Carousel: 26, Foto: 14, Reels: 22 },
  'TW II 2026': { Carousel: 21, Foto: 16, Reels: 17 },
}
const FORMAT_FB: Record<string, Record<string, number>> = {
  'TW II 2025': { Foto: 41, Link: 0, Teks: 0, Video: 32 },
  'TW I 2026':  { Foto: 44, Link: 0, Teks: 1, Video: 20 },
  'TW II 2026': { Foto: 34, Link: 1, Teks: 0, Video: 14 },
}
const URUTAN: Record<string, number> = { 'TW II 2025': 20252, 'TW I 2026': 20261, 'TW II 2026': 20262 }

async function main() {
  const db = await getTenantDb(SLUG)
  let n = 0

  const tulis = async (kanal: 'IG' | 'FB', periode: string, dimensi: string, nilai_dim: string, data: any) => {
    await db.socialLaporanManual.upsert({
      where: { tenant_slug_kanal_periode_dimensi_nilai_dim: {
        tenant_slug: SLUG, kanal, periode, dimensi, nilai_dim } },
      create: { tenant_slug: SLUG, kanal, periode, dimensi, nilai_dim,
                urutan: URUTAN[periode] ?? 0, sumber: SUMBER, ...data },
      update: { ...data, sumber: SUMBER, diimpor_pada: new Date() },
    })
    n++
  }

  for (const a of AKUN_IG) {
    const { periode, urutan: _u, ...angka } = a
    await tulis('IG', periode, 'AKUN', '', angka)
  }
  for (const [periode, isi] of Object.entries(FORMAT_IG))
    for (const [format, jumlah] of Object.entries(isi))
      await tulis('IG', periode, 'FORMAT', format, { jumlah_konten: jumlah })
  for (const [periode, isi] of Object.entries(FORMAT_FB))
    for (const [format, jumlah] of Object.entries(isi))
      await tulis('FB', periode, 'FORMAT', format, { jumlah_konten: jumlah })

  console.log(`[seed] ${n} baris laporan manual tersimpan untuk tenant ${SLUG}`)
}

main().catch(e => { console.error(e); process.exit(1) })
