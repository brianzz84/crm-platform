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
        { kode_barang:  { contains: q, mode: 'insensitive' } },
        { nama:         { contains: q, mode: 'insensitive' } },
        { nama_generik: { contains: q, mode: 'insensitive' } },
      ]
      const kelompok = url.searchParams.get('kelompok')
      if (kelompok) where.kelompok = kelompok
      const jenis = url.searchParams.get('jenis')
      if (jenis) where.jenis = jenis
      if (url.searchParams.get('belum_diisi') === '1') where.nama_generik = null

      const [total, data] = await Promise.all([
        db.simrsLayananLibrary.count({ where }),
        db.simrsLayananLibrary.findMany({
          where,
          select: { id: true, kode_barang: true, nama: true, nama_generik: true, kelompok: true, jenis: true, aktif: true },
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

// PATCH /api/[slug]/library — update nama_generik layanan
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { error, session } = await requireAuth(req, 'icdLibrary')
  if (error) return error
  if (session!.tenantSlug !== params.slug && !session!.roles.includes('SUPER_ADMIN'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, nama_generik } = await req.json()
  if (!id) return NextResponse.json({ error: 'id wajib diisi' }, { status: 400 })

  try {
    const db = await getTenantDb(params.slug)
    await db.simrsLayananLibrary.update({
      where: { id },
      data:  { nama_generik: nama_generik?.trim() || null },
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[PATCH /api/library]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
