import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { simpanCatatanUmum } from '@/lib/simrs-kontrak'
import { z } from 'zod'

type Ctx = { params: { slug: string } }

const Skema = z.object({ catatan_umum: z.string() })

// PUT /api/[slug]/simrs/kontrak/catatan — simpan blok catatan umum (ringkasan,
// autentikasi, proses perubahan kontrak, dsb — teks bebas satu blok per tenant).
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const parsed = Skema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 })
    }

    const db = await getTenantDb(params.slug)
    await simpanCatatanUmum(db, params.slug, parsed.data.catatan_umum)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
