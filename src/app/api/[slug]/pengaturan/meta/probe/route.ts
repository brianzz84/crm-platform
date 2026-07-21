import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { jalankanProbeMedsos } from '@/lib/meta-social-diagnostik'

type Ctx = { params: { slug: string } }

// POST /api/[slug]/pengaturan/meta/probe — verifikasi izin analitik FB/IG & iklan.
// Read-only ke akun yang sudah dikonfigurasi tenant. Guard: configSystem.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const db  = await getTenantDb(params.slug)
    const cfg = await db.metaConfig.findUnique({ where: { tenant_slug: params.slug } })
    if (!cfg) {
      return NextResponse.json({ success: false, error: 'Config Meta belum ada. Simpan dulu di form di atas.' }, { status: 400 })
    }

    const hasil = await jalankanProbeMedsos(params.slug, {
      access_token:   cfg.access_token,
      insights_token: cfg.insights_token,
      page_id:        cfg.page_id,
      ig_business_id: cfg.ig_business_id,
      ad_account_id:  cfg.ad_account_id,
    })
    return NextResponse.json({ success: true, data: hasil })
  } catch (e) {
    const pesan = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ success: false, error: pesan }, { status: 400 })
  }
}
