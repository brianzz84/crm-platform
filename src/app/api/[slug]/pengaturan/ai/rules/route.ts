import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { z } from 'zod'

type Ctx = { params: { slug: string } }

// GET — daftar rule AI Partner tenant ini
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  const db    = await getTenantDb(params.slug)
  const rules = await db.aiPartnerRule.findMany({
    where:   { tenant_slug: params.slug },
    orderBy: [{ kategori: 'asc' }, { created_at: 'asc' }],
  })

  return NextResponse.json({ success: true, data: rules })
}

const RuleSchema = z.object({
  kategori: z.enum(['PERILAKU', 'PERSONA', 'BATASAN']),
  teks:     z.string().min(3, 'Teks rule terlalu pendek'),
})

// POST — tambah rule baru
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error, session } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = RuleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 })
    }

    const db   = await getTenantDb(params.slug)
    const rule = await db.aiPartnerRule.create({
      data: {
        tenant_slug: params.slug,
        kategori:    parsed.data.kategori,
        teks:        parsed.data.teks,
        created_by:  session!.userId,
      },
    })

    return NextResponse.json({ success: true, data: rule })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
