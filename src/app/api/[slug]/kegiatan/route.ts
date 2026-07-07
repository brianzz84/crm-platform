import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'

type Ctx = { params: { slug: string } }

// POST — buat kegiatan baru
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageKegiatan')
  if (error) return error

  const body = await req.json()
  const { nama, jenis, tanggal_mulai, tanggal_selesai, lokasi, penyelenggara, keterangan, poin_kegiatan, status } = body

  if (!nama?.trim())     return NextResponse.json({ error: 'Nama kegiatan wajib diisi' }, { status: 400 })
  if (!tanggal_mulai)    return NextResponse.json({ error: 'Tanggal mulai wajib diisi' }, { status: 400 })

  const db   = await getTenantDb(params.slug)
  const last = await db.kegiatan.findFirst({
    where:   { tenant_slug: params.slug, kode: { startsWith: 'KGT' } },
    orderBy: { created_at: 'desc' },
    select:  { kode: true },
  })
  const seq  = last ? (parseInt(last.kode.replace('KGT', '')) || 0) + 1 : 1
  const kode = `KGT${String(seq).padStart(4, '0')}`

  const kegiatan = await db.kegiatan.create({
    data: {
      tenant_slug:    params.slug,
      kode,
      nama:           nama.trim(),
      jenis:          jenis || 'Lainnya',
      tanggal_mulai:  new Date(tanggal_mulai),
      tanggal_selesai: tanggal_selesai ? new Date(tanggal_selesai) : null,
      lokasi:         lokasi?.trim() || null,
      penyelenggara:  penyelenggara?.trim() || null,
      keterangan:     keterangan?.trim() || null,
      poin_kegiatan:  parseInt(poin_kegiatan) || 0,
      status:         status === 'selesai' ? 'selesai' : 'aktif',
      qr_token:       crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    },
  })

  return NextResponse.json({ id: kegiatan.id })
}
