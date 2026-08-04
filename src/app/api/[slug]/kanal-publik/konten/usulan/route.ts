/**
 * Usulan sifat konten oleh AI.
 *
 * Memakai penyedia AI yang SUDAH dikonfigurasi tenant (Gemini atau Claude) lewat
 * `getAiProviderForTenant` — tidak ada kunci API baru dan tidak ada pengaturan
 * tambahan.
 *
 * Hasilnya masuk ke kolom `sifat_usulan`, TIDAK PERNAH langsung ke `sifat`.
 * Laporan hanya menghitung `sifat`, jadi usulan yang belum disetujui tidak
 * berpengaruh sama sekali pada angka. Ini disengaja: konten berperforma tertinggi
 * di laporan triwulan lalu adalah unggahan duka cita, dan satu kekeliruan
 * menempatkannya sebagai promo layanan akan meruntuhkan kepercayaan pada seluruh
 * angka lain di dokumen yang sama. Biaya menyetujui satu klik; biaya salah jauh
 * lebih mahal.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { getAiProviderForTenant } from '@/lib/ai-provider'

type Ctx = { params: { slug: string } }

/** Batas sekali panggil — cukup besar untuk hemat, cukup kecil agar jawabannya utuh. */
const MAKS_SEKALI = 40

export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageBroadcast')
  if (error) return error

  try {
    const db = await getTenantDb(params.slug)

    const sifat = await db.socialSifatLibrary.findMany({
      where: { tenant_slug: params.slug, aktif: true },
      orderBy: [{ urutan: 'asc' }],
      select: { kode: true, nama: true, deskripsi: true },
    })
    if (!sifat.length) {
      return NextResponse.json({ success: false, error: 'Belum ada sifat konten di Library.' }, { status: 400 })
    }

    // Hanya yang belum ditandai DAN belum punya usulan — mengusulkan ulang untuk
    // yang sudah ada usulannya hanya membakar token tanpa menambah apa pun.
    const konten = await db.socialContent.findMany({
      where: { tenant_slug: params.slug, sifat: null, sifat_usulan: null, NOT: { teks: null } },
      orderBy: { terbit_pada: 'desc' },
      take: MAKS_SEKALI,
      select: { id: true, jenis: true, teks: true, terbit_pada: true },
    })
    if (!konten.length) {
      return NextResponse.json({ success: true, diusulkan: 0, pesan: 'Tidak ada konten yang perlu diusulkan.' })
    }

    const daftarSifat = sifat
      .map(s => `- ${s.kode}: ${s.nama}${s.deskripsi ? ` — ${s.deskripsi}` : ''}`)
      .join('\n')

    const systemPrompt = [
      'Anda mengklasifikasikan konten media sosial rumah sakit ke dalam kategori yang SUDAH DITETAPKAN.',
      '',
      'Kategori yang tersedia (pakai KODE-nya persis):',
      daftarSifat,
      '',
      'Aturan:',
      '1. Jawab HANYA dengan JSON array, tanpa penjelasan dan tanpa pagar kode.',
      '2. Bentuk tiap elemen: {"id":"<id konten>","kode":"<KODE atau null>"}',
      '3. Kode WAJIB salah satu dari daftar di atas. Dilarang mengarang kode baru.',
      '4. Kalau ragu atau isinya tidak cukup jelas, isi kode dengan null.',
      '   Ketidakpastian yang jujur lebih berguna daripada tebakan yang percaya diri,',
      '   karena hasilnya akan diperiksa manusia dan null mengarahkan perhatian mereka.',
      '5. Perhatikan nada. Unggahan duka cita, ucapan belasungkawa, atau obituari',
      '   BUKAN promosi layanan meskipun menyebut nama rumah sakit.',
    ].join('\n')

    const daftarKonten = konten
      .map(k => `id=${k.id} | ${k.jenis} | ${k.terbit_pada.toISOString().slice(0, 10)} | ${k.teks}`)
      .join('\n---\n')

    const ai   = await getAiProviderForTenant(params.slug)
    const jawab = await ai.generateJson(systemPrompt, [{ role: 'user', content: daftarKonten }])

    // Model kadang membungkus JSON dengan pagar kode meski diminta tidak.
    const bersih = jawab.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    let usul: { id?: string; kode?: string | null }[]
    try {
      usul = JSON.parse(bersih)
      if (!Array.isArray(usul)) throw new Error('bukan array')
    } catch {
      return NextResponse.json({
        success: false,
        error: 'Jawaban AI tidak bisa dibaca sebagai JSON. Coba lagi.',
        cuplikan: bersih.slice(0, 200),
      }, { status: 502 })
    }

    const kodeSah = new Set(sifat.map(s => s.kode))
    const idSah   = new Set(konten.map(k => k.id))

    let diusulkan = 0, ditolak = 0
    for (const u of usul) {
      if (!u?.id || !idSah.has(u.id)) continue           // id di luar batch — abaikan
      if (!u.kode) continue                              // model menyatakan ragu
      if (!kodeSah.has(u.kode)) { ditolak++; continue }  // kode karangan — buang
      await db.socialContent.update({ where: { id: u.id }, data: { sifat_usulan: u.kode } })
      diusulkan++
    }

    return NextResponse.json({
      success: true,
      diperiksa: konten.length,
      diusulkan,
      // Dilaporkan apa adanya: kalau model sering mengarang kode, itu pertanda
      // uraian sifat di Library perlu dipertajam.
      ditolak,
      ragu: konten.length - diusulkan - ditolak,
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
