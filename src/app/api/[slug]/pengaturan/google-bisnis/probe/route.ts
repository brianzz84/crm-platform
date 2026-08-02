import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { jalankanProbeGoogleBisnis } from '@/lib/google-business-diagnostik'

type Ctx = { params: { slug: string } }

// POST /api/[slug]/pengaturan/google-bisnis/probe — verifikasi akses API Google
// Business Profile (akun, lokasi, performa, ulasan). Read-only ke resource milik
// tenant. Guard: configSystem.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const db  = await getTenantDb(params.slug)
    const cfg = await db.googleConfig.findUnique({ where: { tenant_slug: params.slug } })
    if (!cfg) {
      return NextResponse.json(
        { success: false, error: 'Konfigurasi Google Business belum ada. Simpan dulu di form di atas.' },
        { status: 400 },
      )
    }

    const hasil = await jalankanProbeGoogleBisnis(params.slug, {
      client_id:      cfg.client_id,
      client_secret:  cfg.client_secret,
      refresh_token:  cfg.refresh_token,
      account_id:     cfg.account_id,
      location_utama: cfg.location_utama,
    })

    // Catat kapan terakhir diuji — dipakai badge di daftar Pengaturan.
    await db.googleConfig.update({
      where: { tenant_slug: params.slug },
      data:  { tested_at: new Date() },
    }).catch(() => null)

    return NextResponse.json({ success: true, data: hasil })
  } catch (e) {
    const pesan = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ success: false, error: pesan }, { status: 400 })
  }
}
