import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { simpanAnotasiField } from '@/lib/simrs-kontrak'
import { z } from 'zod'

type Ctx = { params: { slug: string } }

const Skema = z.object({
  endpoint:   z.enum(['kunjungan', 'pasien', 'rencana']),
  field_nama: z.string().min(1),
  contoh:     z.string().nullable().optional(),
  catatan:    z.string().nullable().optional(),
})

// PUT /api/[slug]/simrs/kontrak/field — simpan contoh/catatan untuk satu field.
// Nama field divalidasi terhadap DIKENAL_KUNJUNGAN/DIKENAL_PASIEN di
// simrs-kontrak.ts — tidak bisa membuat anotasi untuk field yang tidak nyata ada.
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const parsed = Skema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 })
    }

    const db = await getTenantDb(params.slug)
    await simpanAnotasiField(db, params.slug, parsed.data.endpoint, parsed.data.field_nama, {
      contoh: parsed.data.contoh, catatan: parsed.data.catatan,
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    const pesan = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ success: false, error: pesan }, { status: 400 })
  }
}
