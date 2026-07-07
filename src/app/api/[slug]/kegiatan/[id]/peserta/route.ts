import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'

type Ctx = { params: { slug: string; id: string } }

// GET ?no_hp=xxx — cari pasien by nomor HP untuk tambah peserta
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageKegiatan')
  if (error) return error

  const noHp = req.nextUrl.searchParams.get('no_hp')?.replace(/\D/g, '') || ''
  if (noHp.length < 8) return NextResponse.json({ found: false })

  const db = await getTenantDb(params.slug)

  // Cari via PersonContact
  const contact = await db.personContact.findFirst({
    where: { tenant_slug: params.slug, nilai: { contains: noHp } },
    include: {
      person: {
        include: {
          _count: { select: { kegiatan_diikuti: true } },
        },
      },
    },
  })

  if (!contact?.person) return NextResponse.json({ found: false })

  const p = contact.person

  // Cek apakah sudah terdaftar di kegiatan ini
  const sudahDaftar = await db.kegiatanPeserta.findFirst({
    where: { kegiatan_id: params.id, person_id: p.id },
  })

  return NextResponse.json({
    found: true,
    sudah_daftar: !!sudahDaftar,
    person: {
      id:              p.id,
      name:            p.name,
      no_hp:           contact.nilai,
      total_kegiatan:  p._count.kegiatan_diikuti,
    },
  })
}

// POST — tambah peserta ke kegiatan
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageKegiatan')
  if (error) return error

  const { person_id } = await req.json()
  if (!person_id) return NextResponse.json({ error: 'person_id wajib' }, { status: 400 })

  const db = await getTenantDb(params.slug)

  const kegiatan = await db.kegiatan.findFirst({ where: { id: params.id, tenant_slug: params.slug } })
  if (!kegiatan) return NextResponse.json({ error: 'Kegiatan tidak ditemukan' }, { status: 404 })

  const existing = await db.kegiatanPeserta.findFirst({ where: { kegiatan_id: params.id, person_id } })
  if (existing) return NextResponse.json({ error: 'Pasien sudah terdaftar di kegiatan ini' }, { status: 409 })

  await db.kegiatanPeserta.create({
    data: {
      kegiatan_id:    params.id,
      person_id,
      tenant_slug:    params.slug,
      hadir:          true,
      poin_diberikan: kegiatan.poin_kegiatan,
      sumber:         'admin',
    },
  })

  // Catat loyalty transaction jika ada poin
  if (kegiatan.poin_kegiatan > 0) {
    await db.loyaltyTransaction.create({
      data: {
        tenant_slug: params.slug,
        person_id,
        jenis:       'KEGIATAN',
        poin:        kegiatan.poin_kegiatan,
        ref_id:      params.id,
        keterangan:  `Hadir: ${kegiatan.nama}`,
      },
    })
  }

  return NextResponse.json({ success: true })
}
