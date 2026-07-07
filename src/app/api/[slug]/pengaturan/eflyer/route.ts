import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { z } from 'zod'

type Ctx = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  const db  = await getTenantDb(params.slug)
  const cfg = await db.eflyerConfig.findUnique({ where: { tenant_slug: params.slug } })

  if (!cfg) return NextResponse.json({ success: true, data: null })

  const { api_key, ...safe } = cfg as any
  return NextResponse.json({ success: true, data: { ...safe, has_api_key: !!api_key } })
}

const EflyerSchema = z.object({
  aktif:   z.boolean().default(false),
  api_url: z.string().url().optional().or(z.literal('')),
  api_key: z.string().optional(),
})

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = EflyerSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })

    const db       = await getTenantDb(params.slug)
    const existing = await db.eflyerConfig.findUnique({ where: { tenant_slug: params.slug } })

    const data: any = { ...parsed.data }
    if (!data.api_url) data.api_url = null
    if (!data.api_key) delete data.api_key   // jangan overwrite dengan string kosong

    const cfg = existing
      ? await db.eflyerConfig.update({ where: { tenant_slug: params.slug }, data })
      : await db.eflyerConfig.create({ data: { ...data, tenant_slug: params.slug } })

    const { api_key, ...safe } = cfg as any
    return NextResponse.json({ success: true, data: { ...safe, has_api_key: !!api_key } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
