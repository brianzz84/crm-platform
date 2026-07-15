import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'

type Ctx = { params: { slug: string } }

// GET — daftar sesi AI Partner milik user yang login (untuk sidebar)
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error, session } = await requireTenantPermission(req, params.slug, 'manageSegments')
  if (error) return error

  const db       = await getTenantDb(params.slug)
  const sessions = await db.aiPartnerSession.findMany({
    where:   { tenant_slug: params.slug, created_by: session!.userId },
    orderBy: { updated_at: 'desc' },
    select:  { id: true, judul: true, created_at: true, updated_at: true },
  })

  return NextResponse.json({ success: true, data: sessions })
}

// POST — buat sesi baru (kosong, siap terima pesan pertama)
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error, session } = await requireTenantPermission(req, params.slug, 'manageSegments')
  if (error) return error

  const db = await getTenantDb(params.slug)
  const aiSession = await db.aiPartnerSession.create({
    data: { tenant_slug: params.slug, created_by: session!.userId },
  })

  return NextResponse.json({ success: true, data: aiSession })
}
