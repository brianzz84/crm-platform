/**
 * GET /api/[slug]/kanal-publik/laporan?kanal=IG|FB|YOUTUBE|GA4&mulai=YYYY-MM-DD&selesai=YYYY-MM-DD
 *
 * Tabel Laporan Triwulanan. Membaca TABEL SNAPSHOT, bukan API Meta — periode
 * triwulan sudah jauh melewati jendela riwayat yang disediakan Instagram, jadi
 * hanya salinan lokal yang bisa menjawabnya.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { periksaRentang } from '@/lib/google-kanal'
import { rakitLaporan, type KanalLaporan } from '@/lib/laporan-medsos'

type Ctx = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewKanalPublik')
  if (error) return error

  const q     = req.nextUrl.searchParams
  const diminta = q.get('kanal') ?? ''

  // Percakapan berdiri sendiri seperti Google: subjeknya orang yang menghubungi,
  // bukan konten yang diterbitkan. Memaksanya ke bentuk LaporanMedsos membuat
  // keduanya sulit dibaca — kesalahan yang sudah sekali terjadi pada Google.
  if (diminta === 'PERCAKAPAN') {
    const cekP = periksaRentang(q.get('mulai') ?? '', q.get('selesai') ?? '')
    if (!cekP.ok) return NextResponse.json({ success: false, error: cekP.pesan }, { status: 400 })
    try {
      const { rakitLaporanPercakapan } = await import('@/lib/laporan-percakapan')
      const data = await rakitLaporanPercakapan(params.slug, cekP.rentang.mulai, cekP.rentang.selesai)
      return NextResponse.json({ success: true, kanal: 'PERCAKAPAN', data })
    } catch (e) {
      return NextResponse.json(
        { success: false, error: e instanceof Error ? e.message : 'Server error' },
        { status: 500 },
      )
    }
  }

  // Google punya bentuk laporan yang berbeda sama sekali dari kanal medsos —
  // lokasi, bukan konten — jadi dirakit oleh modulnya sendiri alih-alih dipaksa
  // masuk ke bentuk LaporanMedsos.
  if (diminta === 'GOOGLE') {
    const cekG = periksaRentang(q.get('mulai') ?? '', q.get('selesai') ?? '')
    if (!cekG.ok) return NextResponse.json({ success: false, error: cekG.pesan }, { status: 400 })
    try {
      const { rakitLaporanGoogle } = await import('@/lib/laporan-google')
      const data = await rakitLaporanGoogle(params.slug, cekG.rentang.mulai, cekG.rentang.selesai)
      return NextResponse.json({ success: true, kanal: 'GOOGLE', data })
    } catch (e) {
      return NextResponse.json(
        { success: false, error: e instanceof Error ? e.message : 'Server error' },
        { status: 500 },
      )
    }
  }

  const kanal: KanalLaporan =
    (['IG', 'FB', 'YOUTUBE', 'GA4'] as const).includes(diminta as any) ? diminta as KanalLaporan : 'IG'

  // Rentang tetap divalidasi walau sumbernya tabel lokal: nilainya datang dari URL
  // dan langsung menjadi kueri rentang tanggal.
  const cek = periksaRentang(q.get('mulai') ?? '', q.get('selesai') ?? '')
  if (!cek.ok) return NextResponse.json({ success: false, error: cek.pesan }, { status: 400 })

  try {
    const data = await rakitLaporan(params.slug, cek.rentang.mulai, cek.rentang.selesai, kanal)
    return NextResponse.json({ success: true, kanal, data })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 },
    )
  }
}
