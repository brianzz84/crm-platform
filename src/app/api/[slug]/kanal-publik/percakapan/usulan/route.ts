/**
 * Usulan topik percakapan oleh AI.
 *
 * Memakai penyedia AI yang SUDAH dikonfigurasi tenant lewat `getAiProviderForTenant`
 * — tidak ada kunci API baru dan tidak ada pengaturan tambahan.
 *
 * Hasilnya masuk ke `topik_usulan`, TIDAK PERNAH langsung ke `topik`. Laporan
 * hanya menghitung `topik`. Alasannya sama persis dengan usulan sifat konten:
 * angka di laporan triwulan dibaca direksi, dan satu salah label yang tak pernah
 * diperiksa manusia meruntuhkan kepercayaan pada seluruh dokumen.
 *
 * SATUAN ANALISISNYA PERCAKAPAN, BUKAN PESAN. Rata-rata pesan masuk di sini
 * hanya 21–28 huruf — "halo", "iya", "berapa ya". Diklasifikasi satu per satu,
 * hampir semuanya akan jadi tebakan; topiknya baru muncul kalau satu percakapan
 * dibaca utuh.
 *
 * Isi percakapan dikirim apa adanya ke penyedia AI — keputusan sadar pemilik
 * sistem, 1 Sep 2026. Yang tetap dijaga di sini: isi percakapan TIDAK PERNAH
 * ikut ke dalam pesan galat, respons, maupun console.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { getAiProviderForTenant } from '@/lib/ai-provider'
import { semaiTopik } from '@/lib/percakapan-topik'

type Ctx = { params: { slug: string } }

/** Batas sekali panggil — cukup besar untuk hemat, cukup kecil agar jawabannya utuh. */
const MAKS_PERCAKAPAN = 25
/** Pesan terakhir yang dibaca per percakapan. Topik ditentukan pembukaan, tapi
 *  ekornya kadang mengubah maksud ("…oh sekalian mau komplain"). */
const MAKS_PESAN = 20
/** Pemenggalan per pesan: melindungi dari satu pesan raksasa yang menghabiskan
 *  seluruh jendela dan membuat percakapan lain di batch yang sama terpotong. */
const MAKS_HURUF_PESAN = 500

export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewKanalPublik')
  if (error) return error

  try {
    const db = await getTenantDb(params.slug)
    await semaiTopik(db, params.slug)

    const topik = await db.percakapanTopikLibrary.findMany({
      where:   { tenant_slug: params.slug, aktif: true },
      orderBy: [{ urutan: 'asc' }],
      select:  { kode: true, nama: true, deskripsi: true },
    })
    if (!topik.length) {
      return NextResponse.json(
        { success: false, error: 'Belum ada topik percakapan di Library.' }, { status: 400 })
    }

    // Hanya yang belum ditinjau DAN belum punya usulan — mengusulkan ulang hanya
    // membakar token tanpa menambah apa pun.
    const percakapan = await db.conversation.findMany({
      where: {
        tenant_slug: params.slug,
        topik:        null,
        topik_usulan: null,
        // Percakapan tanpa satu pun pesan masuk bukan pertanyaan siapa-siapa —
        // tidak ada topik yang bisa dilekatkan padanya.
        messages: { some: { direction: 'incoming', is_internal_note: false } },
      },
      orderBy: { last_message_at: 'desc' },
      take:    MAKS_PERCAKAPAN,
      select: {
        id: true, channel: true,
        messages: {
          where:   { is_internal_note: false },
          orderBy: { created_at: 'asc' },
          take:    MAKS_PESAN,
          select:  { direction: true, content: true },
        },
      },
    })
    if (!percakapan.length) {
      return NextResponse.json({
        success: true, diusulkan: 0, pesan: 'Tidak ada percakapan yang perlu diusulkan.',
      })
    }

    const daftarTopik = topik
      .map(t => `- ${t.kode}: ${t.nama}${t.deskripsi ? ` — ${t.deskripsi}` : ''}`)
      .join('\n')

    const systemPrompt = [
      'Anda menggolongkan PERCAKAPAN MASUK ke rumah sakit menurut keperluan orang yang menghubungi.',
      '',
      'Kategori yang tersedia (pakai KODE-nya persis):',
      daftarTopik,
      '',
      'Aturan:',
      '1. Jawab HANYA dengan JSON array, tanpa penjelasan dan tanpa pagar kode.',
      '2. Bentuk tiap elemen: {"id":"<id percakapan>","kode":"<KODE atau null>","alasan":"<maksimal 12 kata>"}',
      '3. Kode WAJIB salah satu dari daftar di atas. Dilarang mengarang kode baru.',
      '4. Yang digolongkan adalah KEPERLUAN PENGIRIM, bukan isi jawaban petugas.',
      '   Baris "PETUGAS" hanya konteks untuk memahami maksud pertanyaan.',
      '5. Satu percakapan menyentuh beberapa hal? Pilih keperluan yang membuat orang itu',
      '   menghubungi sejak awal, bukan yang paling banyak dibahas.',
      '6. Isi kode dengan null bila percakapan terlalu singkat atau kabur untuk',
      '   dipastikan — misalnya hanya sapaan tanpa kelanjutan. Ketidakpastian yang',
      '   jujur lebih berguna daripada tebakan yang percaya diri, karena hasilnya',
      '   akan diperiksa manusia dan null mengarahkan perhatian mereka ke sana.',
      '   Gunakan LAINNYA hanya bila maksudnya JELAS tetapi tidak ada kategori yang cocok.',
      '7. "alasan" ditulis dalam bahasa Indonesia, menyebut apa yang ditanyakan —',
      '   bukan mengulang nama kategori.',
    ].join('\n')

    const daftarPercakapan = percakapan
      .map(p => {
        const isi = p.messages
          .map(m => `${m.direction === 'incoming' ? 'PENGIRIM' : 'PETUGAS'}: ${(m.content ?? '').slice(0, MAKS_HURUF_PESAN)}`)
          .join('\n')
        return `id=${p.id} | ${p.channel}\n${isi}`
      })
      .join('\n---\n')

    const ai    = await getAiProviderForTenant(params.slug)
    const jawab = await ai.generateJson(systemPrompt, [{ role: 'user', content: daftarPercakapan }])

    // Model kadang membungkus JSON dengan pagar kode meski diminta tidak.
    const bersih = jawab.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    let usul: { id?: string; kode?: string | null; alasan?: string }[]
    try {
      usul = JSON.parse(bersih)
      if (!Array.isArray(usul)) throw new Error('bukan array')
    } catch {
      // Cuplikan jawaban SENGAJA tidak dikembalikan seperti pada usulan konten:
      // di sana isinya unggahan publik, di sini bisa berisi percakapan pasien.
      return NextResponse.json({
        success: false,
        error: 'Jawaban AI tidak bisa dibaca sebagai JSON. Coba lagi.',
      }, { status: 502 })
    }

    const kodeSah = new Set(topik.map(t => t.kode))
    const idSah   = new Set(percakapan.map(p => p.id))

    let diusulkan = 0, ditolak = 0
    for (const u of usul) {
      if (!u?.id || !idSah.has(u.id)) continue           // id di luar batch — abaikan
      if (!u.kode) continue                              // model menyatakan ragu
      if (!kodeSah.has(u.kode)) { ditolak++; continue }  // kode karangan — buang
      await db.conversation.update({
        where: { id: u.id },
        data: {
          topik_usulan:    u.kode,
          topik_alasan:    typeof u.alasan === 'string' ? u.alasan.slice(0, 200) : null,
          topik_usul_pada: new Date(),
        },
      })
      diusulkan++
    }

    return NextResponse.json({
      success:   true,
      diperiksa: percakapan.length,
      diusulkan,
      // Dilaporkan apa adanya: kalau model sering mengarang kode, itu pertanda
      // uraian topik di Library perlu dipertajam.
      ditolak,
      ragu: percakapan.length - diusulkan - ditolak,
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
