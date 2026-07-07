import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'

type Ctx = { params: { slug: string } }

// GET /api/[slug]/icd?q=diabetes&versi=ICD10&limit=10
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error, session } = await requireAuth(req)
  if (error) return error
  if (session!.tenantSlug !== params.slug && !session!.roles.includes('SUPER_ADMIN'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url   = new URL(req.url)
  const q     = url.searchParams.get('q')?.trim() ?? ''
  const versi = url.searchParams.get('versi') ?? 'ICD10'
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '10'), 30)

  if (q.length < 2) return NextResponse.json({ data: [] })

  try {
    const db = await getTenantDb(params.slug)

    // Cari berdasarkan: kode prefix (exact-ish) ATAU nama_id ATAU nama (english)
    const results = await db.icdLibrary.findMany({
      where: {
        aktif: true,
        versi,
        OR: [
          { kode:    { startsWith: q.toUpperCase() } },
          { nama_id: { contains: q, mode: 'insensitive' } },
          { nama:    { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { kode: true, nama_id: true, nama: true, bab: true, versi: true },
      orderBy: [
        // kode yang persis cocok muncul pertama
        { kode: 'asc' },
      ],
      take: limit,
    })

    return NextResponse.json({ data: results })
  } catch (e) {
    console.error('[GET /api/icd]', e)
    return NextResponse.json({ error: 'Gagal mencari kode ICD' }, { status: 500 })
  }
}
