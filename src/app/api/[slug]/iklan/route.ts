import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { rakitLaporanIklan, JENDELA_BAWAAN_HARI } from '@/lib/laporan-iklan'

type Ctx = { params: { slug: string } }

/**
 * Laporan atribusi iklan → kunjungan.
 *
 * Memakai izin `manageBroadcast`, sama seperti Kanal Publik: audiensnya tim
 * pemasaran yang sama. Isinya agregat — jumlah orang dan kunjungan per iklan,
 * tanpa identitas siapa pun.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageBroadcast')
  if (error) return error

  try {
    const sp = req.nextUrl.searchParams

    // Bawaan 90 hari: iklan rumah sakit jarang dievaluasi mingguan, dan jendela
    // pendek pada volume kecil menghasilkan angka yang naik-turun tanpa arti.
    const selesai = sp.get('selesai') ? new Date(sp.get('selesai')!) : new Date()
    const mulai   = sp.get('mulai')
      ? new Date(sp.get('mulai')!)
      : new Date(selesai.getTime() - 90 * 86_400_000)

    const jendelaMentah = Number(sp.get('jendela') ?? JENDELA_BAWAAN_HARI)
    // Dibatasi supaya jendela tak masuk akal tidak diam-diam mengembungkan
    // konversi — pada jendela setahun hampir semua pasien lama akan "terkonversi".
    const jendela = Number.isFinite(jendelaMentah)
      ? Math.min(Math.max(Math.round(jendelaMentah), 1), 180)
      : JENDELA_BAWAAN_HARI

    if (isNaN(mulai.getTime()) || isNaN(selesai.getTime())) {
      return NextResponse.json({ success: false, error: 'Tanggal tidak valid' }, { status: 400 })
    }

    const data = await rakitLaporanIklan(params.slug, mulai, selesai, jendela)
    return NextResponse.json({ success: true, data })
  } catch (e) {
    console.error(`[GET /api/${params.slug}/iklan]`, e)
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
