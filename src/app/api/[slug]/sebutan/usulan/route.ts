/**
 * Usulan label sebutan publik oleh AI — empat dimensi sekaligus.
 *
 * Memakai penyedia AI yang SUDAH dikonfigurasi tenant lewat
 * `getAiProviderForTenant` — tidak ada kunci API baru, tidak ada pengaturan
 * tambahan. Hasilnya lahir `disetujui: false` dan tidak dihitung laporan apa pun
 * sampai manusia menetapkannya di layar peninjauan.
 *
 * MENGAPA PELABELAN MANUAL SAJA TIDAK CUKUP. Penarikan pertama membawa 608
 * sebutan sekaligus, dengan riwayat mundur sampai Desember 2015. Diminta
 * melabeli semuanya dari nol, orang akan berhenti di baris keempat puluh —
 * dan yang tersisa bukan data yang belum ditinjau, melainkan modul yang
 * ditinggalkan. AI mengubah pekerjaannya dari MENGARANG menjadi MEMERIKSA.
 *
 * EMPAT DIMENSI, BUKAN SATU DAFTAR PANJANG. Sebutan yang sama punya kategori
 * (apa ini), sentimen (nadanya bagaimana), poli (menyangkut layanan apa), dan
 * risiko (perlu ditangani atau tidak). Digabung jadi satu daftar, kategorinya
 * menjadi perkalian keempatnya dan tak satu pun bisa dijumlahkan sendiri di
 * laporan.
 *
 * BEDA PENTING DARI USULAN PERCAKAPAN: yang diproses di sini adalah takarir
 * unggahan PUBLIK, bukan percakapan pasien. Karena itu cuplikan jawaban AI yang
 * gagal dibaca BOLEH dikembalikan untuk penelusuran galat — di rute percakapan
 * hal itu sengaja ditutup karena isinya bisa memuat keterangan kesehatan
 * seseorang.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { getAiProviderForTenant } from '@/lib/ai-provider'
import { semaiSebutanTopik, SENTIMEN, RISIKO } from '@/lib/sebutan-topik'
import { semaiPoli } from '@/lib/percakapan-poli'

type Ctx = { params: { slug: string } }

/** Sebutan jauh lebih pendek daripada percakapan, jadi muat lebih banyak
 *  sekali jalan. Tetap dibatasi agar jawabannya tidak terpotong di tengah. */
const MAKS_SEBUTAN = 30
/** Takarir sudah dipotong 2.000 huruf saat penarikan. Dipotong lagi di sini
 *  karena yang menentukan kategori ada di kalimat pembuka — sisanya nyaris
 *  selalu tagar. */
const MAKS_HURUF = 900

/** Dimensi yang hanya boleh bernilai SATU — aturan yang sama dengan PATCH.
 *  Ditegakkan DI SINI juga, bukan hanya di sana: usulan AI masuk basis data
 *  lewat jalur ini dan tidak melewati PATCH sama sekali. */
const DIMENSI_TUNGGAL = new Set(['SENTIMEN', 'RISIKO'])

interface Usul {
  id?: string
  topik?: unknown; sentimen?: unknown; poli?: unknown; risiko?: unknown
  alasan?: string
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewKanalPublik')
  if (error) return error

  // `ulangi` membuang usulan yang BELUM ditinjau lalu mengusulkannya kembali.
  // Ada karena memperbaiki uraian kategori tidak ada gunanya bila usulan lama —
  // yang dibuat sebelum perbaikan itu — tetap menempel selamanya. Label yang
  // sudah DISETUJUI manusia tidak pernah disentuh.
  const body   = await req.json().catch(() => ({})) as { ulangi?: unknown }
  const ulangi = body.ulangi === true

  try {
    const db = await getTenantDb(params.slug)

    if (ulangi) {
      const perlu = await db.sebutan.findMany({
        where: {
          tenant_slug: params.slug,
          labels: { none: { disetujui: true }, some: { disetujui: false } },
        },
        select: { id: true },
      })
      await db.sebutanLabel.deleteMany({
        where: { sebutan_id: { in: perlu.map((k: { id: string }) => k.id) }, disetujui: false },
      })
    }

    await semaiSebutanTopik(db, params.slug)
    await semaiPoli(db, params.slug)

    const [topik, poli] = await Promise.all([
      db.sebutanTopikLibrary.findMany({
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
        { success: false, error: 'Belum ada kategori sebutan di Library.' }, { status: 400 })
    }

    // Hanya yang belum punya label sama sekali. Mengusulkan ulang untuk yang
    // sudah ditinjau akan menimpa keputusan manusia; untuk yang sudah punya
    // usulan hanya membakar token tanpa menambah apa pun.
    //
    // `teks` wajib ada: sebutan tanpa takarir tidak bisa dinilai dari teksnya,
    // dan memaksa AI menebak dari nama akun saja hanya melahirkan label percaya
    // diri yang salah. Itu dibiarkan untuk mata manusia.
    //
    // Terbaru dulu: dengan tunggakan ratusan baris, sebutan bulan ini lebih
    // berkonsekuensi daripada sebutan 2015.
    const sebutan = await db.sebutan.findMany({
      where: {
        tenant_slug: params.slug,
        labels: { none: {} },
        teks:   { not: null },
      },
      orderBy: { terbit_pada: 'desc' },
      take:    MAKS_SEBUTAN,
      select:  { id: true, sumber: true, username: true, teks: true },
    })
    if (!sebutan.length) {
      return NextResponse.json({
        success: true, diperiksa: 0, berlabel: 0,
        pesan: 'Tidak ada sebutan yang perlu diusulkan.',
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
      'Anda menggolongkan SEBUTAN PUBLIK tentang sebuah rumah sakit — unggahan yang',
      'dibuat orang LAIN di akun mereka sendiri, yang menandai atau menyebut rumah sakit',
      'ini. Ini BUKAN pesan yang dikirim kepada rumah sakit.',
      '',
      'Empat dimensi terpisah. Pakai KODE persis seperti tertulis.',
      '',
      'DIMENSI 1 — KATEGORI (topik). Unggahan ini apa?',
      daftarTopik,
      '',
      'DIMENSI 2 — SENTIMEN. Nada terhadap rumah sakit. Pilih TEPAT SATU:',
      '- POSITIF: memuji, berterima kasih, merekomendasikan, atau menampilkan',
      '  kerja sama yang berjalan baik.',
      '- NETRAL: menyebut tanpa menilai — penanda lokasi, pengumuman, daftar,',
      '  liputan berimbang, dan SELURUH spam. Ini nilai yang paling sering benar.',
      '- NEGATIF: mengeluh, mengecam, atau menceritakan pengalaman buruk.',
      'Yang dinilai adalah nada terhadap RUMAH SAKIT, bukan suasana unggahannya.',
      'Berita duka yang menyebut rumah sakit sebagai tempat perawatan itu NETRAL —',
      'sedihnya bukan tentang rumah sakitnya.',
      '',
      'DIMENSI 3 — POLI/LAYANAN. Bidang layanan yang disinggung:',
      daftarPoli || '(belum ada daftar poli — kosongkan dimensi ini)',
      '',
      'DIMENSI 4 — RISIKO. Perlukah seseorang MENINDAKLANJUTI? Pilih TEPAT SATU:',
      '- RENDAH: tidak perlu ditindaklanjuti siapa pun. Sebagian besar sebutan',
      '  ada di sini, termasuk seluruh apresiasi dan seluruh spam.',
      '- SEDANG: sebaiknya dijawab atau diketahui humas — keluhan ringan,',
      '  pertanyaan publik yang menggantung, salah informasi yang tidak berbahaya.',
      '- TINGGI: menuntut perhatian hari ini — tuduhan malapraktik, keselamatan',
      '  pasien, sengketa hukum, akun bercakupan luas yang mengecam, atau apa pun',
      '  yang bisa menyebar sebelum sempat ditanggapi.',
      'RISIKO BUKAN PENGULANGAN SENTIMEN. Kritik yang sudah selesai dan tidak lagi',
      'ramai adalah NEGATIF tetapi RENDAH. Pertanyaan bernada datar dari media yang',
      'belum dijawab adalah NETRAL tetapi SEDANG. Bila risiko Anda selalu sejalan',
      'dengan sentimen, berarti dimensi ini tidak sedang dinilai.',
      '',
      'Aturan keluaran:',
      '1. Jawab HANYA dengan JSON array, tanpa penjelasan dan tanpa pagar kode.',
      '2. Bentuk tiap elemen:',
      '   {"id":"<id>","topik":["KODE",…],"sentimen":"KODE","poli":["KODE",…],',
      '    "risiko":"KODE","alasan":"<maksimal 15 kata>"}',
      '3. "sentimen" dan "risiko" masing-masing SATU nilai, bukan array.',
      '   "topik" dan "poli" boleh lebih dari satu.',
      '4. Kode WAJIB dari daftar dimensinya masing-masing. Dilarang mengarang kode',
      '   baru dan dilarang memakai kode satu dimensi di dimensi lain.',
      '5. "poli" dikosongkan ([]) bila tidak menyangkut bidang layanan tertentu.',
      '   Sebutan dari mitra, liputan, dan spam hampir selalu begitu. Jangan',
      '   menebak poli dari nama rumah sakitnya saja.',
      '6. SPAM hampir selalu: sentimen NETRAL, risiko RENDAH, poli kosong.',
      '   Tandanya — isinya tidak menyangkut kesehatan sama sekali (properti,',
      '   dagang, undian), atau menandai banyak pihak tak berkaitan sekaligus.',
      '7. Bedakan INTERNAL dari APRESIASI. Unggahan karyawan, unit, perawat, atau',
      '   sekolah keperawatan afiliasi adalah INTERNAL meski isinya memuji —',
      '   mencampurnya membuat sentimen publik tampak lebih baik dari kenyataan.',
      '8. Kosongkan "topik" ([]) bila unggahan terlalu singkat atau kabur untuk',
      '   dipastikan. Ketidakpastian yang jujur lebih berguna daripada tebakan',
      '   percaya diri: hasilnya akan diperiksa manusia, dan kekosongan justru',
      '   mengarahkan perhatian mereka ke sana. Pakai LAINNYA hanya bila maksudnya',
      '   JELAS tetapi tak ada kategori yang cocok.',
      '9. "alasan" ditulis dalam bahasa Indonesia, menyebut apa isi unggahannya —',
      '   bukan mengulang nama kategori.',
    ].join('\n')

    const daftarSebutan = sebutan
      .map((m: { id: string; sumber: string; username: string | null; teks: string | null }) =>
        `id=${m.id} | ${m.sumber} | @${m.username ?? '-'}\n${(m.teks ?? '').slice(0, MAKS_HURUF)}`)
      .join('\n---\n')

    const ai    = await getAiProviderForTenant(params.slug)
    const jawab = await ai.generateJson(systemPrompt, [{ role: 'user', content: daftarSebutan }])

    // Model kadang membungkus JSON dengan pagar kode meski diminta tidak.
    const bersih = jawab.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    let usul: Usul[]
    try {
      usul = JSON.parse(bersih)
      if (!Array.isArray(usul)) throw new Error('bukan array')
    } catch {
      return NextResponse.json({
        success: false,
        error:   'Jawaban AI tidak bisa dibaca sebagai JSON. Coba lagi.',
        // Isinya takarir publik, jadi cuplikan aman ditampilkan — dan tanpanya
        // kegagalan semacam ini hanya bisa ditebak-tebak.
        cuplikan: bersih.slice(0, 400),
      }, { status: 502 })
    }

    const sah: Record<string, Set<string>> = {
      TOPIK:    new Set(topik.map((t: { kode: string }) => t.kode)),
      UNIT:     new Set(poli.map((p: { kode: string }) => p.kode)),
      SENTIMEN: new Set<string>(SENTIMEN),
      RISIKO:   new Set<string>(RISIKO),
    }
    const idSah = new Set(sebutan.map((m: { id: string }) => m.id))

    let berlabel = 0, ditolak = 0
    const hitung: Record<string, number> = { TOPIK: 0, SENTIMEN: 0, UNIT: 0, RISIKO: 0 }

    for (const u of usul) {
      if (!u?.id || !idSah.has(u.id)) continue           // id di luar batch — abaikan
      const alasan = typeof u.alasan === 'string' ? u.alasan.slice(0, 200) : null

      let ada = false
      for (const [dimensi, nilai] of [
        ['TOPIK',    u.topik]    as const,
        ['SENTIMEN', u.sentimen] as const,
        ['UNIT',     u.poli]     as const,
        ['RISIKO',   u.risiko]   as const,
      ]) {
        // Nilai tunggal diminta sebagai string, tetapi model kerap mengirimnya
        // sebagai array satu isi. Keduanya diterima — menolaknya berarti
        // membuang batch yang sebetulnya benar.
        let kode = (Array.isArray(nilai) ? nilai : [nilai])
          .filter((k): k is string => typeof k === 'string' && k.length > 0)

        if (DIMENSI_TUNGGAL.has(dimensi) && kode.length > 1) {
          // Ambil yang pertama sah, sisanya dicatat ditolak. Menyimpan dua akan
          // membuat penjumlahan laporan melebihi jumlah sebutan — persis yang
          // dicegah aturan yang sama di PATCH.
          const pertama = kode.find(k => sah[dimensi].has(k))
          ditolak += kode.length - (pertama ? 1 : 0)
          kode = pertama ? [pertama] : []
        }

        for (const k of kode) {
          if (!sah[dimensi].has(k)) { ditolak++; continue }  // karangan / salah dimensi
          await db.sebutanLabel.upsert({
            where:  { sebutan_id_dimensi_kode: { sebutan_id: u.id, dimensi, kode: k } },
            create: { sebutan_id: u.id, dimensi, kode: k, sumber: 'AI', disetujui: false, alasan },
            update: {},
          })
          ada = true
          hitung[dimensi]++
        }
      }
      if (ada) berlabel++
    }

    return NextResponse.json({
      success:   true,
      diperiksa: sebutan.length,
      berlabel,
      labelTopik:    hitung.TOPIK,
      labelSentimen: hitung.SENTIMEN,
      labelPoli:     hitung.UNIT,
      labelRisiko:   hitung.RISIKO,
      // Dilaporkan apa adanya: bila model sering mengarang kode, itu pertanda
      // uraian kategori di Library perlu dipertajam — bukan pertanda AI-nya buruk.
      ditolak,
      ragu: sebutan.length - berlabel,
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
