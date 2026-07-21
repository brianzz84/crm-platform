import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { z } from 'zod'

type Ctx = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  const db  = await getTenantDb(params.slug)
  const cfg = await db.metaConfig.findUnique({ where: { tenant_slug: params.slug } })

  if (!cfg) return NextResponse.json({ success: true, data: null })

  const { access_token, ...safe } = cfg as any
  return NextResponse.json({ success: true, data: { ...safe, has_token: !!access_token } })
}

const MetaSchema = z.object({
  phone_number_id: z.string().min(1),
  access_token:    z.string().optional(),
  waba_id:         z.string().optional(),
  app_id:          z.string().optional(),
  aktif:           z.boolean().default(true),
})

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = MetaSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })

    const db       = await getTenantDb(params.slug)
    const existing = await db.metaConfig.findUnique({ where: { tenant_slug: params.slug } })

    const data: any = { ...parsed.data }
    if (!data.access_token) delete data.access_token

    const cfg = existing
      ? await db.metaConfig.update({ where: { tenant_slug: params.slug }, data })
      : await db.metaConfig.create({ data: { ...data, tenant_slug: params.slug } })

    const { access_token, ...safe } = cfg as any
    return NextResponse.json({ success: true, data: { ...safe, has_token: !!access_token } })
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  const db  = await getTenantDb(params.slug)
  const cfg = await db.metaConfig.findUnique({ where: { tenant_slug: params.slug } })
  if (!cfg) return NextResponse.json({ success: false, error: 'Konfigurasi belum ada' }, { status: 400 })

  try {
    const res  = await fetch(
      `https://graph.facebook.com/v22.0/${cfg.phone_number_id}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${cfg.access_token}` }, signal: AbortSignal.timeout(10_000) },
    )
    const json = await res.json()

    if (res.ok && json.display_phone_number) {
      await db.metaConfig.update({ where: { tenant_slug: params.slug }, data: { tested_at: new Date() } })
      return NextResponse.json({
        success: true,
        message: `Koneksi berhasil! Nomor: ${json.display_phone_number} (${json.verified_name})`,
      })
    }
    return NextResponse.json({ success: false, error: json.error?.message ?? 'Token tidak valid' })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: `Timeout / network error: ${e.message}` })
  }
}
