/**
 * Ringkasan sebutan publik — angka yang dibaca manajemen, bukan daftar kerja.
 *
 * HANYA MENGHITUNG LABEL YANG SUDAH DISETUJUI MANUSIA. Usulan AI yang belum
 * ditinjau tidak masuk satu pun angka di sini. Itu keseluruhan gunanya pola
 * usul-lalu-tetapkan: satu salah label yang tak pernah diperiksa, muncul di
 * laporan triwulan, meruntuhkan kepercayaan pada seluruh dokumen.
 *
 * KARENA ITU CAKUPAN IKUT DILAPORKAN. "12 sebutan negatif" berarti sangat
 * berbeda bila 400 sebutan lain belum ditinjau — dan pembacanya tidak punya cara
 * mengetahui itu kecuali diberitahu. `belumDitinjau` dan `persenDitinjau` ada di
 * respons supaya layar bisa menahan diri menyajikan angka sebagai kesimpulan
 * selama cakupannya masih rendah.
 *
 * Rentang defaultnya 90 hari. Riwayat sebutan mundur sampai Desember 2015, dan
 * membuka halaman ini langsung dengan sepuluh tahun data akan menyamakan akun
 * yang aktif 2016 dengan yang aktif pekan ini.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'

type Ctx = { params: { slug: string } }

const HARI_DEFAULT = 90
/** Akun penyebut teratas yang ditampilkan. Cukup untuk mengenali pola, tidak
 *  cukup untuk berubah jadi daftar kerja kedua. */
const MAKS_AKUN = 15
/** Sebutan berisiko TINGGI yang diangkat ke atas. Bila lebih dari ini muncul
 *  sekaligus, masalahnya bukan lagi soal daftar. */
const MAKS_SOROT = 20

interface BarisLabel { sebutan_id: string; dimensi: string; kode: string }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewKanalPublik')
  if (error) return error

  const q = req.nextUrl.searchParams

  // Tanggal yang tak terbaca diperlakukan sebagai tidak dikirim, bukan sebagai
  // Invalid Date — yang akan diteruskan ke Prisma dan menggagalkan kuerinya.
  const urai = (s: string | null) => {
    if (!s) return null
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d
  }
  const sampai = urai(q.get('sampai')) ?? new Date()
  const dari   = urai(q.get('dari'))
    ?? new Date(sampai.getTime() - HARI_DEFAULT * 86_400_000)

  try {
    const db = await getTenantDb(params.slug)

    const rentang = {
      tenant_slug: params.slug,
      terbit_pada: { gte: dari, lte: sampai },
    }

    const [total, belumDitinjau, perSumber, labels, akun, sorotMentah] = await Promise.all([
      db.sebutan.count({ where: rentang }),
      db.sebutan.count({ where: { ...rentang, labels: { none: { disetujui: true } } } }),
      db.sebutan.groupBy({
        by: ['sumber'], where: rentang, _count: { _all: true },
      }),

      // Seluruh label yang disetujui dalam rentang, ditarik sekali lalu dihitung
      // di memori. Empat groupBy terpisah berarti empat gabungan tabel untuk
      // menjawab hal yang sama, dan jumlahnya tetap ratusan — bukan jutaan.
      db.sebutanLabel.findMany({
        where:  { disetujui: true, sebutan: rentang },
        select: { sebutan_id: true, dimensi: true, kode: true },
      }),

      db.sebutan.groupBy({
        by: ['username'], where: rentang, _count: { _all: true },
        orderBy: { _count: { username: 'desc' } },
        take: MAKS_AKUN,
      }),

      // Yang berisiko TINGGI diangkat utuh: inilah satu-satunya bagian halaman
      // ini yang menuntut tindakan, dan mengubur ia di dalam angka membuat
      // seluruh ringkasan tidak ada gunanya.
      db.sebutan.findMany({
        where: {
          ...rentang,
          labels: { some: { disetujui: true, dimensi: 'RISIKO', kode: 'TINGGI' } },
        },
        orderBy: { terbit_pada: 'desc' },
        take:    MAKS_SOROT,
        select: {
          id: true, sumber: true, username: true, teks: true,
          tautan: true, terbit_pada: true,
        },
      }),
    ])

    // Hitung per dimensi. `Set` per kode supaya sebutan yang punya dua label di
    // dimensi sama tidak terhitung dua kali pada dimensi itu.
    const per: Record<string, Map<string, Set<string>>> = {
      TOPIK: new Map(), SENTIMEN: new Map(), UNIT: new Map(), RISIKO: new Map(),
    }
    const ditinjau = new Set<string>()
    for (const l of labels as BarisLabel[]) {
      ditinjau.add(l.sebutan_id)
      const d = per[l.dimensi]
      if (!d) continue
      ;(d.get(l.kode) ?? d.set(l.kode, new Set()).get(l.kode)!).add(l.sebutan_id)
    }
    const keluarkan = (d: string) =>
      [...per[d].entries()]
        .map(([kode, set]) => ({ kode, jumlah: set.size }))
        .sort((a, b) => b.jumlah - a.jumlah)

    return NextResponse.json({
      success: true,
      dari, sampai,
      total,
      belumDitinjau,
      // Dibulatkan ke bawah: 99% yang sebetulnya 99,6% lebih baik daripada 100%
      // yang membuat orang berhenti memeriksa.
      persenDitinjau: total ? Math.floor((ditinjau.size / total) * 100) : 0,
      perSumber: (perSumber as { sumber: string; _count: { _all: number } }[])
        .map(s => ({ sumber: s.sumber, jumlah: s._count._all }))
        .sort((a, b) => b.jumlah - a.jumlah),
      topik:    keluarkan('TOPIK'),
      sentimen: keluarkan('SENTIMEN'),
      unit:     keluarkan('UNIT'),
      risiko:   keluarkan('RISIKO'),
      akun: (akun as { username: string | null; _count: { _all: number } }[])
        .filter(a => a.username)
        .map(a => ({ username: a.username, jumlah: a._count._all })),
      sorot: (sorotMentah as {
        id: string; sumber: string; username: string | null
        teks: string | null; tautan: string | null; terbit_pada: Date
      }[]).map(s => ({
        id: s.id, sumber: s.sumber, username: s.username,
        teks: (s.teks ?? '').slice(0, 300),
        tautan: s.tautan, terbitPada: s.terbit_pada,
      })),
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
