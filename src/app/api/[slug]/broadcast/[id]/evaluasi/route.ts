import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { hitungEvaluasiCampaign } from '@/lib/campaign-evaluasi'

type Ctx = { params: { slug: string; id: string } }

const HARI_DEFAULT = 30

// GET /api/[slug]/broadcast/[id]/evaluasi?hari=30 — funnel, sentimen, konversi, baseline.
// `hari` menentukan panjang jendela KONVERSI & BASELINE saja — funnel (terkirim/
// dibaca/dibalas) selalu seumur hidup campaign, tidak dibatasi jendela.
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageBroadcast')
  if (error) return error

  try {
    const hariParam = req.nextUrl.searchParams.get('hari')
    const hari = hariParam ? Number(hariParam) : HARI_DEFAULT
    if (!Number.isFinite(hari) || hari < 1 || hari > 730) {
      return NextResponse.json({ success: false, error: 'Parameter hari harus angka 1–730.' }, { status: 400 })
    }

    const db     = await getTenantDb(params.slug)
    const exists = await db.campaign.findFirst({ where: { id: params.id, tenant_slug: params.slug }, select: { id: true } })
    if (!exists) return NextResponse.json({ success: false, error: 'Campaign tidak ditemukan' }, { status: 404 })

    const data = await hitungEvaluasiCampaign(db, params.slug, params.id, hari)
    return NextResponse.json({ success: true, data })
  } catch (e) {
    const pesan = e instanceof Error ? e.message : 'Server error'
    console.error('[GET /api/[slug]/broadcast/[id]/evaluasi]', e)
    return NextResponse.json({ success: false, error: pesan }, { status: 500 })
  }
}
