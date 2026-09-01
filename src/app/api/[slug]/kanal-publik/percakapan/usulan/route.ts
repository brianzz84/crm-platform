/**
 * Usulan label percakapan oleh AI — topik (keperluan) dan poli (bidang layanan).
 *
 * Memakai penyedia AI yang SUDAH dikonfigurasi tenant lewat `getAiProviderForTenant`
 * — tidak ada kunci API baru dan tidak ada pengaturan tambahan.
 *
 * Hasilnya lahir sebagai `disetujui: false` dan TIDAK dihitung laporan apa pun
 * sampai manusia menyetujuinya. Alasannya sama dengan usulan sifat konten: angka
 * di laporan triwulan dibaca direksi, dan satu salah label yang tak pernah
 * diperiksa manusia meruntuhkan kepercayaan pada seluruh dokumen.
 *
 * SATUAN ANALISISNYA PERCAKAPAN, BUKAN PESAN. Rata-rata pesan masuk hanya 21–28
 * huruf — "halo", "iya", "berapa ya". Diklasifikasi satu per satu, hampir
 * semuanya jadi tebakan; keperluannya baru terbaca kalau percakapan dibaca utuh.
 *
 * DUA DIMENSI, bukan satu daftar panjang. Digabung, kategorinya menjadi perkalian
 * keduanya dan "Jadwal Dokter Jantung" akan bersaing dengan "Tarif Jantung".
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
import { semaiPoli } from '@/lib/percakapan-poli'

type Ctx = { params: { slug: string } }

/** Batas sekali panggil — cukup besar untuk hemat, cukup kecil agar jawabannya utuh. */
const MAKS_PERCAKAPAN = 25
const MAKS_PESAN      = 20
/** Pemenggalan per pesan: melindungi dari satu pesan raksasa yang menghabiskan
 *  seluruh jendela dan membuat percakapan lain di batch yang sama terpotong. */
const MAKS_HURUF_PESAN = 500

export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewKanalPublik')
  if (error) return error

  // `ulangi` membuang usulan AI yang BELUM ditinjau lalu mengusulkannya kembali.
  // Ada karena memperbaiki daftar kategori tidak ada gunanya bila usulan lama —
  // yang dibuat ketika kategori itu belum ada — tetap menempel selamanya.
  // Label yang sudah DISETUJUI manusia tidak pernah disentuh.
  const body   = await req.json().catch(() => ({})) as { ulangi?: unknown }
  const ulangi = body.ulangi === true

  try {
    const db = await getTenantDb(params.slug)

    if (ulangi) {
      const perlu = await db.conversation.findMany({
        where: {
          tenant_slug: params.slug,
          labels: { none: { disetujui: true }, some: { disetujui: false } },
        },
        select: { id: true },
      })
      await db.conversationLabel.deleteMany({
        where: {
          conversation_id: { in: perlu.map((k: { id: string }) => k.id) },
          disetujui: false,
        },
      })
    }
    await semaiTopik(db, params.slug)
    await semaiPoli(db, params.slug)

    const [topik, poli] = await Promise.all([
      db.percakapanTopikLibrary.findMany({
        where:   { tenant_slug: params.slug, aktif: true },
        orderBy: [{ urutan: 'asc' }],
        select:  { kode: true, nama: true, deskripsi: true },
      }),
      db.percakapanPoliLibrary.findMany({
        where:   { tenant_slug: params.slug, aktif: true },
        orderBy: [{ urutan: 'asc' }],
        select:  { kode: true, nama: true, kelompok: true },
      }),
    ])
    if (!topik.length) {
      return NextResponse.json(
        { success: false, error: 'Belum ada topik percakapan di Library.' }, { status: 400 })
    }

    // Hanya yang belum punya label sama sekali — mengusulkan ulang untuk yang
    // sudah ditinjau akan menimpa keputusan manusia, dan untuk yang sudah punya
    // usulan hanya membakar token tanpa menambah apa pun.
    const percakapan = await db.conversation.findMany({
      where: {
        tenant_slug: params.slug,
        labels: { none: {} },
        // Percakapan tanpa satu pun pesan masuk bukan pertanyaan siapa-siapa.
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
      .map((t: { kode: string; nama: string; deskripsi: string | null }) =>
        `- ${t.kode}: ${t.nama}${t.deskripsi ? ` — ${t.deskripsi}` : ''}`)
      .join('\n')
    const daftarPoli = poli
      .map((p: { kode: string; nama: string; kelompok: string | null }) =>
        `- ${p.kode}: ${p.nama}${p.kelompok ? ` (${p.kelompok})` : ''}`)
      .join('\n')

    const systemPrompt = [
      'Anda menggolongkan PERCAKAPAN MASUK ke rumah sakit dalam DUA dimensi terpisah.',
      '',
      'DIMENSI 1 — KEPERLUAN (topik). Orang itu mau apa? Pakai KODE persis:',
      daftarTopik,
      '',
      'DIMENSI 2 — POLI/LAYANAN. Bidang apa yang disinggung? Pakai KODE persis:',
      daftarPoli || '(belum ada daftar poli — kosongkan dimensi ini)',
      '',
      'Aturan:',
      '1. Jawab HANYA dengan JSON array, tanpa penjelasan dan tanpa pagar kode.',
      '2. Bentuk tiap elemen:',
      '   {"id":"<id percakapan>","topik":["KODE",…],"poli":["KODE",…],"alasan":"<maksimal 15 kata>"}',
      '3. Kode WAJIB dari daftar dimensinya masing-masing. Dilarang mengarang kode baru,',
      '   dan dilarang memakai kode poli di "topik" atau sebaliknya.',
      '4. BOLEH lebih dari satu per dimensi bila percakapan memang membahas beberapa hal.',
      '   Tetapi jangan menumpuk label yang tidak benar-benar dibicarakan — daftar panjang',
      '   yang serampangan lebih merusak laporan daripada satu label yang tepat.',
      '5. "poli" dikosongkan ([]) bila percakapan tidak menyangkut bidang layanan tertentu —',
      '   lamaran kerja, penawaran vendor, dan spam hampir selalu begitu.',
      '6. Yang digolongkan adalah KEPERLUAN PENGIRIM, bukan isi jawaban petugas.',
      '   Baris "PETUGAS" hanya konteks untuk memahami maksud pertanyaan.',
      '6b. INFO_UMUM adalah KATEGORI SISA. Sebelum memakainya, telusuri ulang seluruh',
      '   daftar dari atas. Pemeriksaan atas hasil sebelumnya menemukan INFO_UMUM dipakai',
      '   tiga kali lebih sering daripada seharusnya — itu kekeliruan yang paling perlu',
      '   dihindari di sini. Bila percakapan menyebut keluhan, gejala, tindakan medis,',
      '   nama layanan, nama spesialisasi, pelatihan, ibadah, atau berisi pujian —',
      '   kategorinya BUKAN INFO_UMUM.',
      '6c. Beberapa perbandingan yang sudah terbukti membingungkan:',
      '   - "konsultasi diet ke dokter spesialis apa?" -> KONSULTASI_KESEHATAN (+ poli terkait)',
      '   - "apakah bisa pembersihan telinga anak 1,5 tahun?" -> LAYANAN_KLINIK (+ poli terkait)',
      '   - "apakah RS mengadakan pelatihan NICU bagi perawat?" -> PELATIHAN, bukan LOWONGAN',
      '   - "terima kasih atas segala bantuan, Tuhan memberkati" -> APRESIASI, bukan INFO_UMUM',
      '   - "hari Minggu ada misa pagi?" -> PELAYANAN_ROHANI',
      '   - "jam besuk sampai jam berapa?" -> INFO_UMUM (inilah pemakaian yang benar)',
      '7. Kosongkan "topik" ([]) bila percakapan terlalu singkat atau kabur untuk dipastikan —',
      '   misalnya hanya sapaan tanpa kelanjutan. Ketidakpastian yang jujur lebih berguna',
      '   daripada tebakan yang percaya diri, karena hasilnya akan diperiksa manusia dan',
      '   kekosongan mengarahkan perhatian mereka ke sana.',
      '   Gunakan LAINNYA hanya bila maksudnya JELAS tetapi tidak ada kategori yang cocok.',
      '8. "alasan" ditulis dalam bahasa Indonesia, menyebut apa yang ditanyakan —',
      '   bukan mengulang nama kategori.',
    ].join('\n')

    const daftarPercakapan = percakapan
      .map((p: { id: string; channel: string; messages: { direction: string; content: string | null }[] }) => {
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
    let usul: { id?: string; topik?: unknown; poli?: unknown; alasan?: string }[]
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

    const kodeTopik = new Set(topik.map((t: { kode: string }) => t.kode))
    const kodePoli  = new Set(poli.map((p: { kode: string }) => p.kode))
    const idSah     = new Set(percakapan.map((p: { id: string }) => p.id))

    let berlabel = 0, labelTopik = 0, labelPoli = 0, ditolak = 0
    for (const u of usul) {
      if (!u?.id || !idSah.has(u.id)) continue           // id di luar batch — abaikan
      const alasan = typeof u.alasan === 'string' ? u.alasan.slice(0, 200) : null

      let ada = false
      for (const [dimensi, nilai, sah] of [
        ['TOPIK', u.topik, kodeTopik] as const,
        ['POLI',  u.poli,  kodePoli]  as const,
      ]) {
        if (!Array.isArray(nilai)) continue
        for (const kode of nilai) {
          if (typeof kode !== 'string') continue
          if (!sah.has(kode)) { ditolak++; continue }    // kode karangan / salah dimensi
          await db.conversationLabel.upsert({
            where:  { conversation_id_dimensi_kode: { conversation_id: u.id, dimensi, kode } },
            create: { conversation_id: u.id, dimensi, kode, sumber: 'AI', disetujui: false, alasan },
            update: {},
          })
          ada = true
          if (dimensi === 'TOPIK') labelTopik++; else labelPoli++
        }
      }
      if (ada) berlabel++
    }

    return NextResponse.json({
      success:   true,
      diperiksa: percakapan.length,
      berlabel,
      labelTopik,
      labelPoli,
      // Dilaporkan apa adanya: kalau model sering mengarang kode, itu pertanda
      // uraian kategori di Library perlu dipertajam.
      ditolak,
      ragu: percakapan.length - berlabel,
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
