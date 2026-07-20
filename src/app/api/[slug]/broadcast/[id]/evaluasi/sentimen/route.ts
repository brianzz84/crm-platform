import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { hitungUlangSentimenCampaign } from '@/lib/campaign-evaluasi'

type Ctx = { params: { slug: string; id: string } }

// POST /api/[slug]/broadcast/[id]/evaluasi/sentimen — hitung ulang sentimen SEMUA
// balasan campaign ini (menimpa nilai lama). Dipicu tombol "Hitung ulang" di UI,
// tidak otomatis saat halaman evaluasi dibuka — supaya AI tidak dipanggil berulang
// tanpa perlu dan angkanya stabil di antara kunjungan halaman.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageBroadcast')
  if (error) return error

  try {
    const db     = await getTenantDb(params.slug)
    const exists = await db.campaign.findFirst({ where: { id: params.id, tenant_slug: params.slug }, select: { id: true } })
    if (!exists) return NextResponse.json({ success: false, error: 'Campaign tidak ditemukan' }, { status: 404 })

    const data = await hitungUlangSentimenCampaign(db, params.slug, params.id)
    return NextResponse.json({ success: true, data })
  } catch (e) {
    const pesan = e instanceof Error ? e.message : 'Server error'
    console.error('[POST /api/[slug]/broadcast/[id]/evaluasi/sentimen]', e)
    return NextResponse.json({ success: false, error: pesan }, { status: 500 })
  }
}
