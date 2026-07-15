import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { masterDb } from '@/lib/tenant'
import { z } from 'zod'

type Ctx = { params: { slug: string } }

// GET — baca config AI
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  const tenant = await masterDb.tenant.findUnique({
    where:  { slug: params.slug },
    select: { config: { select: { ai_enabled: true, ai_provider: true, ai_model: true, ai_api_key: true } } },
  })

  const cfg = tenant?.config
  return NextResponse.json({
    success: true,
    data: {
      ai_enabled:  cfg?.ai_enabled ?? false,
      ai_provider: cfg?.ai_provider ?? 'CLAUDE',
      ai_model:    cfg?.ai_model ?? '',
      has_api_key: !!(cfg?.ai_api_key),
    },
  })
}

const AiSchema = z.object({
  ai_enabled:  z.boolean(),
  ai_provider: z.enum(['CLAUDE', 'GEMINI']),
  ai_model:    z.string().optional(),
  ai_api_key:  z.string().optional(),
})

// PUT — simpan config AI
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = AiSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 })
    }

    const tenant = await masterDb.tenant.findUnique({
      where:  { slug: params.slug },
      select: { id: true, config: { select: { id: true } } },
    })
    if (!tenant) return NextResponse.json({ error: 'Tenant tidak ditemukan' }, { status: 404 })

    const data: any = {
      ai_enabled:  parsed.data.ai_enabled,
      ai_provider: parsed.data.ai_provider,
      ai_model:    parsed.data.ai_model || null,
    }
    if (parsed.data.ai_api_key) {
      data.ai_api_key = parsed.data.ai_api_key
    }

    if (tenant.config) {
      await masterDb.tenantConfig.update({ where: { tenant_id: tenant.id }, data })
    } else {
      await masterDb.tenantConfig.create({ data: { ...data, tenant_id: tenant.id } })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
