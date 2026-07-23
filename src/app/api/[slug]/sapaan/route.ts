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

const FilterConditionSchema = z.object({
  type:               z.enum(['tag', 'asal_pasien', 'keterlibatan']),
  tagId:              z.string().optional(),
  tagName:            z.string().optional(),
  sumber:             z.string().optional(),
  sumberKeterlibatan: z.array(z.enum(['SIMRS_VISIT', 'KEGIATAN'])).optional(),
  min:                z.number().int().min(1).optional(),
  periodeAwal:        z.string().optional(),
  periodeAkhir:       z.string().optional(),
})
const FilterGroupSchema = z.object({ conditions: z.array(FilterConditionSchema) })

const BaseSchema = z.object({
  jenis:     z.enum(['ULTAH', 'HARI_RAYA', 'KONTROL_REMINDER', 'VAKSIN_REMINDER']),
  aktif:     z.boolean(),
  jam_kirim: z.number().int().min(0).max(23).default(7),
})

// Semua jenis sapaan kini berbasis template approved Meta (proaktif = wajib template).
// filter_groups opsional (dipakai ULTAH & HARI_RAYA; KONTROL audiensnya dari rencana).
const TemplateConfigSchema = BaseSchema.extend({
  jenis:           z.enum(['ULTAH', 'HARI_RAYA', 'KONTROL_REMINDER', 'VAKSIN_REMINDER']),
  template_id:     z.string().uuid('Pilih template terlebih dahulu'),
  template_params: z.record(z.string(), z.string()).default({}),
  filter_groups:   z.array(FilterGroupSchema).default([]),
})

// PUT /api/[slug]/sapaan — upsert konfigurasi satu jenis sapaan
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageSapaan')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = TemplateConfigSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })

    const db = await getTenantDb(params.slug)

    // Template harus benar-benar approved milik tenant ini
    const tmpl = await db.broadcastTemplate.findFirst({
      where: { id: parsed.data.template_id, tenant_slug: params.slug, meta_status: 'APPROVED' },
    })
    if (!tmpl) return NextResponse.json({ error: 'Template tidak ditemukan atau belum approved' }, { status: 400 })

    const data = {
      aktif: parsed.data.aktif, jam_kirim: parsed.data.jam_kirim,
      template_id: parsed.data.template_id, template_params: parsed.data.template_params,
      filter_groups: parsed.data.filter_groups, template: null,
    }
    const cfg = await db.sapaanConfig.upsert({
      where:  { tenant_slug_jenis: { tenant_slug: params.slug, jenis: parsed.data.jenis } },
      create: { tenant_slug: params.slug, jenis: parsed.data.jenis, ...data },
      update: data,
    })
    return NextResponse.json({ success: true, data: cfg })
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
