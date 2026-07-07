import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'

type Ctx = { params: { slug: string } }

// GET /api/[slug]/library?tab=icd|layanan&q=...&versi=ICD10&bab=...&terjemahan=id|en&page=1
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error, session } = await requireAuth(req)
  if (error) return error
  if (session!.tenantSlug !== params.slug && !session!.roles.includes('SUPER_ADMIN'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url         = new URL(req.url)
  const tab         = url.searchParams.get('tab') ?? 'icd'
  const q           = url.searchParams.get('q')?.trim() ?? ''
  const page        = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'))
  const limit       = 50
  const skip        = (page - 1) * limit

  try {
    const db = await getTenantDb(params.slug)

    if (tab === 'layanan') {
      const where: any = { aktif: true }
      if (q) where.OR = [
        { kode_barang: { contains: q, mode: 'insensitive' } },
        { nama:        { contains: q, mode: 'insensitive' } },
      ]
      const kelompok = url.searchParams.get('kelompok')
      if (kelompok) where.kelompok = kelompok
      const jenis = url.searchParams.get('jenis')
      if (jenis) where.jenis = jenis

      const [total, data] = await Promise.all([
        db.simrsLayananLibrary.count({ where }),
        db.simrsLayananLibrary.findMany({
          where,
          select: { id: true, kode_barang: true, nama: true, kelompok: true, jenis: true, aktif: true },
          orderBy: [{ kelompok: 'asc' }, { nama: 'asc' }],
          skip, take: limit,
        }),
      ])
      return NextResponse.json({ data, total, page, limit })
    }

    // tab === 'icd'
    const where: any = { aktif: true }
    if (q) where.OR = [
      { kode:    { startsWith: q.toUpperCase() } },
      { nama_id: { contains: q, mode: 'insensitive' } },
      { nama:    { contains: q, mode: 'insensitive' } },
    ]
    const versi = url.searchParams.get('versi')
    if (versi) where.versi = versi

    const bab = url.searchParams.get('bab')
    if (bab) where.bab = { contains: bab, mode: 'insensitive' }


const [total, data] = await Promise.all([
      db.icdLibrary.count({ where }),
      db.icdLibrary.findMany({
        where,
        select: { kode: true, nama_id: true, nama: true, bab: true, versi: true },
        orderBy: [{ kode: 'asc' }],
        skip, take: limit,
      }),
    ])

    return NextResponse.json({ data, total, page, limit })
  } catch (e) {
    console.error('[GET /api/library]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
