import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { z } from 'zod'

type Ctx = { params: { slug: string } }

// GET /api/[slug]/sapaan — ambil semua SapaanConfig tenant ini
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageSapaan')
  if (error) return error

  const db      = await getTenantDb(params.slug)
  const configs = await db.sapaanConfig.findMany({ where: { tenant_slug: params.slug } })

  // Log 7 hari terakhir per jenis
  const logs = await db.sapaanLog.groupBy({
    by:     ['jenis', 'status'],
    where:  { tenant_slug: params.slug, sent_at: { gte: new Date(Date.now() - 7 * 86400_000) } },
    _count: { _all: true },
  })

  return NextResponse.json({ success: true, data: configs, logs })
}

const ConfigSchema = z.object({
  jenis:     z.enum(['ULTAH', 'HARI_RAYA', 'KONTROL_REMINDER']),
  aktif:     z.boolean(),
  template:  z.string().min(1, 'Template pesan wajib diisi'),
  jam_kirim: z.number().int().min(0).max(23).default(7),
})

// PUT /api/[slug]/sapaan — upsert konfigurasi satu jenis sapaan
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageSapaan')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = ConfigSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })

    const db = await getTenantDb(params.slug)
    const cfg = await db.sapaanConfig.upsert({
      where:  { tenant_slug_jenis: { tenant_slug: params.slug, jenis: parsed.data.jenis } },
      create: { tenant_slug: params.slug, ...parsed.data },
      update: { aktif: parsed.data.aktif, template: parsed.data.template, jam_kirim: parsed.data.jam_kirim },
    })
    return NextResponse.json({ success: true, data: cfg })
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
