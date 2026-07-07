import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'

type Ctx = { params: { slug: string; id: string } }

// PUT — update kegiatan
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageKegiatan')
  if (error) return error

  const body = await req.json()
  const { nama, jenis, tanggal_mulai, tanggal_selesai, lokasi, penyelenggara, keterangan, poin_kegiatan, status } = body

  if (!nama?.trim())  return NextResponse.json({ error: 'Nama kegiatan wajib diisi' }, { status: 400 })
  if (!tanggal_mulai) return NextResponse.json({ error: 'Tanggal mulai wajib diisi' }, { status: 400 })

  const db = await getTenantDb(params.slug)
  const existing = await db.kegiatan.findFirst({ where: { id: params.id, tenant_slug: params.slug } })
  if (!existing) return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })

  await db.kegiatan.update({
    where: { id: params.id },
    data: {
      nama:           nama.trim(),
      jenis:          jenis || 'Lainnya',
      tanggal_mulai:  new Date(tanggal_mulai),
      tanggal_selesai: tanggal_selesai ? new Date(tanggal_selesai) : null,
      lokasi:         lokasi?.trim() || null,
      penyelenggara:  penyelenggara?.trim() || null,
      keterangan:     keterangan?.trim() || null,
      poin_kegiatan:  parseInt(poin_kegiatan) || 0,
      status:         status === 'selesai' ? 'selesai' : 'aktif',
    },
  })

  return NextResponse.json({ success: true })
}

// DELETE — hapus kegiatan
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageKegiatan')
  if (error) return error

  const db = await getTenantDb(params.slug)
  const existing = await db.kegiatan.findFirst({ where: { id: params.id, tenant_slug: params.slug } })
  if (!existing) return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })

  await db.kegiatanPeserta.deleteMany({ where: { kegiatan_id: params.id } })
  await db.kegiatan.delete({ where: { id: params.id } })

  return NextResponse.json({ success: true })
}
