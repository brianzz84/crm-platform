import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { simpanItem, updateItem, hapusItem } from '@/lib/simrs-kontrak'
import { z } from 'zod'

type Ctx = { params: { slug: string } }

const SkemaBuat = z.object({
  bagian: z.enum(['non_fungsional', 'kesepakatan', 'pertanyaan_terbuka']),
  judul:  z.string().nullable().optional(),
  isi:    z.string().min(1),
  status: z.string().nullable().optional(),
  urutan: z.number().int().optional(),
})

// POST /api/[slug]/simrs/kontrak/item — tambah baris baru di salah satu bagian bebas
// (aturan non-fungsional, kesepakatan, atau pertanyaan terbuka).
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const parsed = SkemaBuat.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 })
    }

    const db   = await getTenantDb(params.slug)
    const item = await simpanItem(db, params.slug, parsed.data.bagian, parsed.data)
    return NextResponse.json({ success: true, data: item })
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}

const SkemaUbah = z.object({
  id:     z.string().uuid(),
  judul:  z.string().nullable().optional(),
  isi:    z.string().min(1).optional(),
  status: z.string().nullable().optional(),
  urutan: z.number().int().optional(),
})

// PATCH /api/[slug]/simrs/kontrak/item — ubah baris (mis. tandai pertanyaan
// terbuka jadi terjawab, atau edit teksnya).
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const parsed = SkemaUbah.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 })
    }

    const { id, ...data } = parsed.data
    const db = await getTenantDb(params.slug)
    await updateItem(db, params.slug, id, data)
    return NextResponse.json({ success: true })
  } catch (e) {
    const pesan = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ success: false, error: pesan }, { status: 400 })
  }
}

// DELETE /api/[slug]/simrs/kontrak/item?id=... — hapus baris.
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ success: false, error: 'id wajib diisi' }, { status: 400 })

    const db = await getTenantDb(params.slug)
    await hapusItem(db, params.slug, id)
    return NextResponse.json({ success: true })
  } catch (e) {
    const pesan = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ success: false, error: pesan }, { status: 400 })
  }
}
