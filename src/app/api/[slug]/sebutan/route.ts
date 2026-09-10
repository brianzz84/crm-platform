/**
 * Daftar & penetapan label sebutan publik.
 *
 * GET   — sebutan beserta usulan AI-nya, untuk ditinjau manusia.
 * PATCH — menetapkan label. Hanya lewat sini angka laporan berubah.
 *
 * Bentuknya sengaja meniru /kanal-publik/percakapan yang sudah terbukti: AI
 * mengusulkan dengan `disetujui: false`, laporan hanya menghitung yang `true`.
 * Yang baru di sini — `approved_by` dan `approved_at` — datang dari usulan
 * konsultan: `disetujui` menjawab "sudah ditinjau?" tetapi tidak "oleh siapa?".
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { semaiSebutanTopik, SENTIMEN, RISIKO } from '@/lib/sebutan-topik'
import { semaiPoli } from '@/lib/percakapan-poli'

type Ctx = { params: { slug: string } }

/** 30 per halaman: cukup untuk menilai berturut-turut tanpa harus menggulir
 *  jauh, dan cukup kecil agar kartu berisi teks utuh tetap terbaca. */
const PER_HALAMAN = 30

/** Dimensi yang hanya boleh bernilai SATU. Satu sebutan tidak bisa sekaligus
 *  positif dan negatif; membiarkannya ganda membuat penjumlahan laporan
 *  melebihi jumlah sebutan tanpa ada yang menyadari sebabnya. */
const DIMENSI_TUNGGAL = new Set(['SENTIMEN', 'RISIKO'])

interface LabelMentah { dimensi: string; kode: string; disetujui: boolean; sumber: string; alasan: string | null }
interface BarisMentah {
  id: string; sumber: string; penulis: string | null; username: string | null
  teks: string | null; tautan: string | null
  terbit_pada: Date; hilang_pada: Date | null
  labels: LabelMentah[]
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewKanalPublik')
  if (error) return error

  const q       = req.nextUrl.searchParams
  const saring  = q.get('saring') ?? 'perlu'
  const sumber  = q.get('sumber') ?? ''
  // Dibatasi 1 ke atas: nilainya datang dari URL dan langsung menjadi `skip`.
  const hal     = Math.max(1, Number(q.get('hal')) || 1)

  try {
    const db = await getTenantDb(params.slug)
    await semaiSebutanTopik(db, params.slug)
    await semaiPoli(db, params.slug)

    const where: Record<string, unknown> = { tenant_slug: params.slug }
    if (sumber) where.sumber = sumber
    // 'perlu' = belum ada satu pun label yang disetujui — inilah pekerjaannya.
    if (saring === 'perlu')        where.labels = { none: { disetujui: true } }
    else if (saring === 'selesai') where.labels = { some: { disetujui: true } }
    // 'tanpateks' = unggahan tanpa takarir. Dipisahkan karena inilah satu-satunya
    // kelompok yang TIDAK PERNAH masuk antrean AI — tanpa saringan sendiri, ia
    // tercecer di antara ratusan baris lain dan tak pernah selesai.
    else if (saring === 'tanpateks') {
      where.teks   = null
      where.labels = { none: { disetujui: true } }
    }

    const [topik, poli, rows, total, jumlahPerlu, perSumber] = await Promise.all([
      db.sebutanTopikLibrary.findMany({
        where:   { tenant_slug: params.slug, aktif: true },
        orderBy: [{ urutan: 'asc' }],
        select:  { kode: true, nama: true, warna: true, deskripsi: true },
      }),
      db.percakapanPoliLibrary.findMany({
        where:   { tenant_slug: params.slug, aktif: true },
        orderBy: [{ urutan: 'asc' }],
        select:  { kode: true, nama: true, warna: true, kelompok: true },
      }),
      db.sebutan.findMany({
        where,
        orderBy: { terbit_pada: 'desc' },
        skip:    (hal - 1) * PER_HALAMAN,
        take:    PER_HALAMAN,
        select: {
          id: true, sumber: true, penulis: true, username: true,
          teks: true, tautan: true, terbit_pada: true, hilang_pada: true,
          labels: { select: { dimensi: true, kode: true, disetujui: true, sumber: true, alasan: true } },
        },
      }),
      // Jumlah pada SARINGAN YANG SEDANG AKTIF — inilah pembagi halaman.
      db.sebutan.count({ where }),
      // Jumlah yang perlu ditinjau, LEPAS dari saringan: angka ini tetap
      // menunjukkan sisa pekerjaan meski sedang melihat saringan lain.
      db.sebutan.count({
        where: { tenant_slug: params.slug, labels: { none: { disetujui: true } } },
      }),
      // Dipakai penyaring per sumber di layar — dan sekaligus menunjukkan sumber
      // mana yang sudah benar-benar menghasilkan, bukan sekadar terpasang.
      db.sebutan.groupBy({
        by: ['sumber'], where: { tenant_slug: params.slug }, _count: { _all: true },
      }),
    ])

    return NextResponse.json({
      success: true,
      topik, poli,
      sentimen: SENTIMEN, risiko: RISIKO,
      jumlahPerlu,
      hal, perHalaman: PER_HALAMAN, total,
      totalHalaman: Math.max(1, Math.ceil(total / PER_HALAMAN)),
      perSumber: perSumber.map((s: { sumber: string; _count: { _all: number } }) =>
        ({ sumber: s.sumber, jumlah: s._count._all })),
      data: rows.map((r: BarisMentah) => {
        const ambil = (dimensi: string, disetujui: boolean) =>
          r.labels.filter(l => l.dimensi === dimensi && l.disetujui === disetujui).map(l => l.kode)
        return {
          id: r.id, sumber: r.sumber,
          penulis: r.penulis, username: r.username,
          teks: r.teks, tautan: r.tautan,
          terbitPada: r.terbit_pada, hilangPada: r.hilang_pada,
          // Satu alasan sudah cukup — AI menuliskannya sekali per sebutan.
          alasan: r.labels.find(l => l.sumber === 'AI' && l.alasan)?.alasan ?? null,
          topik:    ambil('TOPIK', true),    topikUsulan:    ambil('TOPIK', false),
          sentimen: ambil('SENTIMEN', true), sentimenUsulan: ambil('SENTIMEN', false),
          unit:     ambil('UNIT', true),     unitUsulan:     ambil('UNIT', false),
          risiko:   ambil('RISIKO', true),   risikoUsulan:   ambil('RISIKO', false),
        }
      }),
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { session, error } = await requireTenantPermission(req, params.slug, 'viewKanalPublik')
  if (error) return error

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Body bukan JSON.' }, { status: 400 })
  }

  const olehSiapa = session?.userId ?? null
  const kapan     = new Date()

  try {
    const db = await getTenantDb(params.slug)

    const [topikSah, poliSah] = await Promise.all([
      db.sebutanTopikLibrary.findMany({
        where: { tenant_slug: params.slug, aktif: true }, select: { kode: true } }),
      db.percakapanPoliLibrary.findMany({
        where: { tenant_slug: params.slug, aktif: true }, select: { kode: true } }),
    ])
    const sah: Record<string, Set<string>> = {
      TOPIK:    new Set(topikSah.map((t: { kode: string }) => t.kode)),
      UNIT:     new Set(poliSah.map((p: { kode: string }) => p.kode)),
      SENTIMEN: new Set<string>(SENTIMEN),
      RISIKO:   new Set<string>(RISIKO),
    }

    // Terima seluruh usulan sekaligus. Penarikan pertama menumpuk ratusan
    // sebutan, dan memaksa satu per satu di situ hanya melahirkan klik tanpa
    // membaca. Hanya menyentuh yang BELUM punya label disetujui.
    if (body.setujuiSemua === true) {
      const kandidat = await db.sebutan.findMany({
        where: {
          tenant_slug: params.slug,
          labels: { none: { disetujui: true }, some: { disetujui: false } },
        },
        select: { id: true },
      })
      const r = await db.sebutanLabel.updateMany({
        where: { sebutan_id: { in: kandidat.map((k: { id: string }) => k.id) }, disetujui: false },
        data:  { disetujui: true, approved_by: olehSiapa, approved_at: kapan },
      })
      return NextResponse.json({ success: true, disetujui: kandidat.length, label: r.count })
    }

    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) return NextResponse.json({ success: false, error: 'id wajib diisi.' }, { status: 400 })

    // Jangan percaya id dari klien — pastikan sebutannya milik tenant ini.
    const ada = await db.sebutan.findFirst({
      where: { id, tenant_slug: params.slug }, select: { id: true } })
    if (!ada) return NextResponse.json({ success: false, error: 'Sebutan tidak ditemukan.' }, { status: 404 })

    // Penetapan MENGGANTI seluruh isi dimensi yang dikirim, bukan menambahi:
    // hanya dengan begitu mencabut satu label bisa dinyatakan dari UI. Dimensi
    // yang tidak dikirim tidak disentuh sama sekali.
    for (const [dimensi, kunci] of [
      ['TOPIK', 'topik'], ['SENTIMEN', 'sentimen'],
      ['UNIT', 'unit'],   ['RISIKO', 'risiko'],
    ] as const) {
      const nilai = body[kunci]
      if (!Array.isArray(nilai)) continue

      const kode  = [...new Set(nilai.filter((k): k is string => typeof k === 'string'))]
      const asing = kode.filter(k => !sah[dimensi].has(k))
      if (asing.length) {
        return NextResponse.json(
          { success: false, error: `Kode tidak dikenal pada ${kunci}: ${asing.join(', ')}` },
          { status: 400 })
      }
      if (DIMENSI_TUNGGAL.has(dimensi) && kode.length > 1) {
        return NextResponse.json(
          { success: false, error: `${kunci} hanya boleh satu nilai.` }, { status: 400 })
      }

      await db.sebutanLabel.deleteMany({ where: { sebutan_id: id, dimensi } })
      for (const k of kode) {
        await db.sebutanLabel.create({
          data: {
            sebutan_id: id, dimensi, kode: k, sumber: 'MANUAL',
            disetujui: true, approved_by: olehSiapa, approved_at: kapan,
          },
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
