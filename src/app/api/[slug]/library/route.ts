import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'

type Ctx = { params: { slug: string } }

// GET /api/[slug]/library?tab=icd|layanan|unit&q=...&versi=ICD10&bab=...&terjemahan=id|en&page=1
export async function GET(req: NextRequest, { params }: Ctx) {
  // Sama dengan guard halamannya (/[slug]/library) — ADMIN_IT & SUPER_ADMIN
  const { error } = await requireTenantPermission(req, params.slug, 'icdLibrary')
  if (error) return error

  const url         = new URL(req.url)
  const tab         = url.searchParams.get('tab') ?? 'icd'
  const q           = url.searchParams.get('q')?.trim() ?? ''
  const page        = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'))
  const limit       = 50
  const skip        = (page - 1) * limit

  try {
    const db = await getTenantDb(params.slug)

    if (tab === 'unit') {
      // Master unit per tenant — tampilkan semua (termasuk nonaktif) supaya
      // admin bisa mengaktifkan kembali lewat UI.
      const where: any = { tenant_slug: params.slug }
      if (q) where.OR = [
        { nama:     { contains: q, mode: 'insensitive' } },
        { kelompok: { contains: q, mode: 'insensitive' } },
      ]
      const kelompok = url.searchParams.get('kelompok')
      if (kelompok) where.kelompok = kelompok

      const [total, data] = await Promise.all([
        db.simrsUnitLibrary.count({ where }),
        db.simrsUnitLibrary.findMany({
          where,
          select: { id: true, nama: true, kelompok: true, warna: true, urutan: true, aktif: true },
          orderBy: [{ kelompok: 'asc' }, { urutan: 'asc' }, { nama: 'asc' }],
          skip, take: limit,
        }),
      ])
      // Daftar kelompok yang ada — untuk dropdown filter & form tambah
      const grup = await db.simrsUnitLibrary.groupBy({
        by: ['kelompok'],
        where: { tenant_slug: params.slug },
        _count: { _all: true },
        orderBy: { kelompok: 'asc' },
      })
      return NextResponse.json({
        data, total, page, limit,
        kelompokList: grup.map((g: any) => ({ nama: g.kelompok, jumlah: g._count._all })),
      })
    }

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

// POST /api/[slug]/library?tab=unit — tambah unit baru secara manual
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'icdLibrary')
  if (error) return error

  const tab = new URL(req.url).searchParams.get('tab')
  if (tab !== 'unit') {
    return NextResponse.json({ error: 'Hanya tab=unit yang bisa ditambah manual' }, { status: 400 })
  }

  const { nama, kelompok, warna } = await req.json()
  if (!nama?.trim())     return NextResponse.json({ error: 'Nama unit wajib diisi' }, { status: 400 })
  if (!kelompok?.trim()) return NextResponse.json({ error: 'Kelompok wajib diisi' }, { status: 400 })

  try {
    const db = await getTenantDb(params.slug)
    const unit = await db.simrsUnitLibrary.create({
      data: {
        tenant_slug: params.slug,
        nama:        nama.trim(),
        kelompok:    kelompok.trim(),
        warna:       warna?.trim() || '#0089A8',
      },
      select: { id: true, nama: true, kelompok: true, warna: true, urutan: true, aktif: true },
    })
    return NextResponse.json({ success: true, data: unit })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'Unit dengan nama itu sudah ada' }, { status: 409 })
    }
    console.error('[POST /api/library]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH /api/[slug]/library — update nama_generik layanan, atau edit unit (tab=unit)
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'icdLibrary')
  if (error) return error

  const tab  = new URL(req.url).searchParams.get('tab')
  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: 'id wajib diisi' }, { status: 400 })

  try {
    const db = await getTenantDb(params.slug)

    if (tab === 'unit') {
      // Pastikan unit milik tenant ini — jangan percaya id dari klien
      const existing = await db.simrsUnitLibrary.findUnique({ where: { id: body.id } })
      if (!existing || existing.tenant_slug !== params.slug) {
        return NextResponse.json({ error: 'Unit tidak ditemukan' }, { status: 404 })
      }
      const data: any = {}
      if (body.nama     !== undefined) data.nama     = String(body.nama).trim()
      if (body.kelompok !== undefined) data.kelompok = String(body.kelompok).trim()
      if (body.warna    !== undefined) data.warna    = String(body.warna).trim()
      if (body.aktif    !== undefined) data.aktif    = !!body.aktif   // TIDAK PERNAH DELETE
      if (!Object.keys(data).length) {
        return NextResponse.json({ error: 'Tidak ada perubahan' }, { status: 400 })
      }
      const unit = await db.simrsUnitLibrary.update({
        where: { id: body.id }, data,
        select: { id: true, nama: true, kelompok: true, warna: true, urutan: true, aktif: true },
      })
      return NextResponse.json({ success: true, data: unit })
    }

    await db.simrsLayananLibrary.update({
      where: { id: body.id },
      data:  { nama_generik: body.nama_generik?.trim() || null },
    })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'Unit dengan nama itu sudah ada' }, { status: 409 })
    }
    console.error('[PATCH /api/library]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
