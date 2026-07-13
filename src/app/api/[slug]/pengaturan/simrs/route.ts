import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { masterDb } from '@/lib/tenant'
import { z } from 'zod'

type Ctx = { params: { slug: string } }

// GET — baca config SIMRS
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  const tenant = await masterDb.tenant.findUnique({
    where:  { slug: params.slug },
    select: { config: { select: { simrs_base_url: true, simrs_jam_sync: true, simrs_api_key: true } } },
  })

  const cfg = tenant?.config
  return NextResponse.json({
    success: true,
    data: {
      simrs_base_url: cfg?.simrs_base_url ?? '',
      simrs_jam_sync: cfg?.simrs_jam_sync ?? 0,
      has_api_key:    !!(cfg?.simrs_api_key),
    },
  })
}

const SimrsSchema = z.object({
  simrs_base_url: z.string().url('URL tidak valid').or(z.literal('')),
  simrs_api_key:  z.string().optional(),
  simrs_jam_sync: z.number().int().min(0).max(23),
})

// PUT — simpan config SIMRS
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = SimrsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Input tidak valid' }, { status: 400 })
    }

    const tenant = await masterDb.tenant.findUnique({
      where:  { slug: params.slug },
      select: { id: true, config: { select: { id: true } } },
    })
    if (!tenant) return NextResponse.json({ error: 'Tenant tidak ditemukan' }, { status: 404 })

    const data: any = {
      simrs_base_url: parsed.data.simrs_base_url || null,
      simrs_jam_sync: parsed.data.simrs_jam_sync,
    }
    if (parsed.data.simrs_api_key) {
      data.simrs_api_key = parsed.data.simrs_api_key
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
