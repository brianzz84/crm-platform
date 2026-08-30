/**
 * POST /api/[slug]/instagram/tarik
 *
 * Menarik percakapan Instagram ke Inbox sekarang juga, tanpa menunggu penjadwal.
 *
 * Ada karena tanpanya menguji integrasi berarti menunggu sampai jam berikutnya —
 * dan pada saat itu penyebab kegagalan sudah bercampur dengan hal lain. Berguna
 * juga di luar pengujian: menarik riwayat lebih jauh ke belakang saat pertama
 * disambungkan, karena webhook hanya membawa yang datang setelahnya.
 *
 * Hanya MEMBACA dari Instagram. Tidak ada pesan yang dikirim dari sini.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { tarikDmInstagram } from '@/lib/instagram-dm'

type Ctx = { params: { slug: string } }

export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  const body = await req.json().catch(() => ({})) as { hari?: unknown }
  // Dibatasi 1–90 hari: nilai dari luar langsung menjadi rentang penarikan, dan
  // rentang bertahun-tahun hanya menghabiskan kuota tanpa menambah apa pun —
  // Instagram sendiri membatasi berapa percakapan yang dikembalikan.
  const hari = Math.min(90, Math.max(1, Number(body.hari) || 7))

  try {
    const hasil = await tarikDmInstagram(params.slug, hari)
    return NextResponse.json({
      success: !hasil.galat,
      pesan:   hasil.galat
        ? hasil.galat
        : `${hasil.percakapan} percakapan diperiksa, ${hasil.pesanBaru} pesan baru tersimpan.`,
      ...hasil,
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 },
    )
  }
}
