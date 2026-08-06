/**
 * Daftar segmen — KEMBARAN LAMA dari `/api/[slug]/segmen`.
 *
 * Tidak ada satu pun pemanggil di antarmuka; seluruhnya memakai ejaan Indonesia.
 * Route ini dibiarkan hidup tanpa penjaga apa pun, sehingga nama segmen,
 * deskripsi, dan jumlah anggotanya terbuka bagi siapa saja yang menebak slug —
 * tanpa perlu masuk. Penjaga di bawah menutupnya; menghapus route-nya sama
 * sekali lebih baik lagi, tapi itu keputusan tersendiri.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { requireTenantPermission } from '@/lib/auth'

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageSegments')
  if (error) return error

  try {
    const db = await getTenantDb(params.slug)
    const items = await db.segment.findMany({
      where: { tenant_slug: params.slug },
      orderBy: { created_at: 'desc' },
      select: {
        id: true, nama: true, deskripsi: true, last_refresh_at: true,
        _count: { select: { segment_persons: true } },
      },
    })
    return NextResponse.json({ success: true, data: items })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
