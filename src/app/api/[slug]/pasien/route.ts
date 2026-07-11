import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { requireTenantPermission } from "@/lib/auth"
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/constants'

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewPatients')
  if (error) return error

  try {
    const db   = await getTenantDb(params.slug)
    const body = await req.json()

    const { name, no_hp, email, tanggal_lahir, jenis_kelamin, nik, alamat, no_rm, kategori, agama } = body

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: 'Nama wajib diisi' }, { status: 400 })
    }

    const person = await db.person.create({
      data: {
        tenant_slug:    params.slug,
        name:           name.trim(),
        no_hp:          no_hp?.trim()   || null,
        email:          email?.trim()   || null,
        nik:            nik?.trim()     || null,
        alamat:         alamat?.trim()  || null,
        no_rm:          no_rm?.trim()   || null,
        jenis_kelamin:  jenis_kelamin   || null,
        agama:          agama?.trim()   || null,
        kategori:       kategori        || 'pasien',
        tanggal_lahir:  tanggal_lahir   ? new Date(tanggal_lahir) : null,
        aktif: true,
        ...(no_hp?.trim() ? {
          contacts: {
            create: {
              tenant_slug: params.slug,
              jenis:       'WA',
              nilai:       no_hp.trim(),
              is_primary:  true,
              is_wa_aktif: true,
            },
          },
        } : {}),
      },
    })

    return NextResponse.json({ success: true, data: person }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/[slug]/pasien]', err)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { error } = await requireTenantPermission(req, params.slug, "viewPatients")
  if (error) return error

  try {
    const db = await getTenantDb(params.slug)
    const { searchParams } = req.nextUrl

    const page    = Math.max(1, Number(searchParams.get('page') || 1))
    const perPage = Math.min(MAX_PAGE_SIZE, Number(searchParams.get('per_page') || DEFAULT_PAGE_SIZE))
    const q       = searchParams.get('q') || ''
    const unit    = searchParams.get('unit') || ''  // RAWAT_JALAN | RAWAT_INAP | PENUNJANG

    const where = {
      tenant_slug: params.slug,
      aktif: true,
      ...(q && {
        OR: [
          { name:  { contains: q, mode: 'insensitive' as const } },
          { no_hp: { contains: q } },
          { no_rm: { contains: q } },
          { email: { contains: q, mode: 'insensitive' as const } },
        ],
      }),
      ...(unit && {
        visits: { some: { unit: unit as any, aktif: true } },
      }),
    }

    const [persons, total] = await Promise.all([
      db.person.findMany({
        where,
        orderBy: { updated_at: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          tags: {
            where: { aktif: true },
            include: { tag: { select: { name: true, warna: true } } },
            orderBy: { assigned_at: 'desc' },
            take: 5,
          },
          visits: {
            where: { aktif: true },
            orderBy: { tanggal: 'desc' },
            take: 1,
            select: { tanggal: true, poli: true, unit: true, diagnosa_nama: true },
          },
          contacts: {
            where: { is_primary: true },
            select: { jenis: true, nilai: true, is_wa_aktif: true },
            take: 1,
          },
          _count: {
            select: { conversations: true, campaign_recipients: true },
          },
        },
      }),
      db.person.count({ where }),
    ])

    // Normalisasi: sertakan no_hp dari primary contact sebagai fallback
    const data = persons.map(p => ({
      ...p,
      no_hp: p.no_hp ?? p.contacts[0]?.nilai ?? null,
    }))

    return NextResponse.json({
      success: true,
      data,
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    })
  } catch (err) {
    console.error('[GET /api/[slug]/pasien]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
