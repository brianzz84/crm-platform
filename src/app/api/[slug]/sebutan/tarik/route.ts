/**
 * POST /api/[slug]/sebutan/tarik
 *
 * Menarik sebutan publik sekarang juga, tanpa menunggu penjadwal.
 *
 * Ada karena tanpanya menguji integrasi berarti menunggu sampai jam berikutnya —
 * dan pada saat itu penyebab kegagalan sudah bercampur dengan hal lain. Berguna
 * juga di luar pengujian: penarikan pertama membawa ratusan sebutan lama
 * sekaligus, dan itu harus bisa dipicu sadar.
 *
 * Hanya MEMBACA dari Instagram. Tidak ada yang dikirim keluar.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { tarikSebutanInstagram } from '@/lib/sebutan-instagram'

type Ctx = { params: { slug: string } }

export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewKanalPublik')
  if (error) return error

  try {
    const h = await tarikSebutanInstagram(params.slug)

    // Angka dilaporkan apa adanya, termasuk `tuntas`. Peninjau perlu tahu apakah
    // penelusuran sampai habis — karena hanya pada penelusuran tuntas angka
    // "hilang" punya arti.
    const bagian = [
      `${h.ditemukan} sebutan dibaca`,
      `${h.baru} baru`,
      h.diperbarui ? `${h.diperbarui} diperbarui` : '',
      h.hilang     ? `${h.hilang} ditandai hilang di sumber` : '',
      h.kembali    ? `${h.kembali} muncul kembali` : '',
      h.tuntas ? '' : 'penelusuran BELUM tuntas — penandaan hilang dilewati',
    ].filter(Boolean)

    return NextResponse.json({
      success: !h.galat,
      pesan:   h.galat ? h.galat : bagian.join(', ') + '.',
      ...h,
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 },
    )
  }
}
