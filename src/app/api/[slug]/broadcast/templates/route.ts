import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { fetchMetaTemplates, createMetaTemplate } from '@/lib/meta-client'
import { z } from 'zod'

type Ctx = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageBroadcast')
  if (error) return error

  const db        = await getTenantDb(params.slug)
  const templates = await db.broadcastTemplate.findMany({
    where:   { tenant_slug: params.slug, aktif: true },
    orderBy: { nama: 'asc' },
  })
  return NextResponse.json({ success: true, data: templates })
}

const ComponentSchema = z.object({
  type:     z.enum(['header', 'body', 'footer', 'button']),
  text:     z.string().optional(),
  sub_type: z.string().optional(),
  index:    z.number().optional(),
  parameters: z.array(z.object({
    param_key: z.string(),
    example:   z.string().optional(),
  })).default([]),
})

const TemplateSchema = z.object({
  nama:               z.string().min(1),
  template_name:      z.string().min(1).regex(/^[a-z0-9_]+$/, 'Hanya huruf kecil, angka, dan underscore'),
  template_language:  z.string().default('id'),
  meta_category:      z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']).default('MARKETING'),
  components_schema:  z.array(ComponentSchema).default([]),
  preview_text:       z.string().optional(),
  submit_to_meta:     z.boolean().default(false),
})

export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageBroadcast')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = TemplateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })

    const db = await getTenantDb(params.slug)

    const existing = await db.broadcastTemplate.findFirst({
      where: { tenant_slug: params.slug, template_name: parsed.data.template_name },
    })
    if (existing) return NextResponse.json({ error: 'Nama template sudah digunakan' }, { status: 409 })

    let meta_template_id: string | undefined
    let meta_status: string | undefined

    // Submit ke Meta jika diminta
    if (parsed.data.submit_to_meta) {
      const metaCfg = await db.metaConfig.findUnique({ where: { tenant_slug: params.slug } })
      if (!metaCfg?.waba_id) {
        return NextResponse.json({ error: 'WABA ID belum diatur di Pengaturan > Integrasi Meta' }, { status: 400 })
      }

      // Bangun komponen format Meta
      const metaComponents = buildMetaComponents(parsed.data.components_schema)
      const result = await createMetaTemplate(
        { phone_number_id: metaCfg.phone_number_id, access_token: metaCfg.access_token },
        metaCfg.waba_id,
        {
          name:       parsed.data.template_name,
          category:   parsed.data.meta_category,
          language:   parsed.data.template_language,
          components: metaComponents,
        },
      )
      meta_template_id = result.id
      meta_status      = result.status
    }

    const { submit_to_meta, ...saveData } = parsed.data
    const tmpl = await db.broadcastTemplate.create({
      data: {
        ...saveData,
        tenant_slug:      params.slug,
        meta_template_id: meta_template_id ?? null,
        meta_status:      meta_status ?? null,
        aktif:            meta_status === 'APPROVED' || !parsed.data.submit_to_meta,
      },
    })
    return NextResponse.json({ success: true, data: tmpl, meta_status }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

function buildMetaComponents(schema: any[]): any[] {
  const result: any[] = []
  for (const comp of schema) {
    if (!comp.text && comp.type !== 'button') continue
    const metaComp: any = { type: comp.type.toUpperCase() }
    if (comp.text) metaComp.text = comp.text

    // Tambah example untuk variabel {{1}} {{2}} dst
    if (comp.parameters?.length > 0) {
      const examples = comp.parameters.map((p: any) => p.example || `[${p.param_key}]`)
      if (comp.type === 'body')   metaComp.example = { body_text: [examples] }
      if (comp.type === 'header') metaComp.example = { header_text: examples }
    }
    result.push(metaComp)
  }
  return result
}

// PUT /api/[slug]/broadcast/templates — sync approved templates dari Meta
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageBroadcast')
  if (error) return error

  try {
    const db      = await getTenantDb(params.slug)
    const metaCfg = await db.metaConfig.findUnique({ where: { tenant_slug: params.slug } })
    if (!metaCfg || !metaCfg.waba_id) {
      return NextResponse.json({ error: 'Meta config belum diatur atau WABA ID tidak ada' }, { status: 400 })
    }

    const metaTemplates = await fetchMetaTemplates(
      { phone_number_id: metaCfg.phone_number_id, access_token: metaCfg.access_token },
      metaCfg.waba_id,
    )

    // Hanya import yang statusnya APPROVED
    const approved = metaTemplates.filter((t: any) => t.status === 'APPROVED')
    let synced = 0, skipped = 0

    for (const t of approved) {
      const existing = await db.broadcastTemplate.findFirst({
        where: { tenant_slug: params.slug, template_name: t.name },
      })
      if (existing) { skipped++; continue }

      // Konversi komponen Meta ke format CRM
      const components_schema = (t.components || []).map((c: any) => ({
        type:       c.type?.toLowerCase(),
        text:       c.text,
        parameters: [],
      }))

      await db.broadcastTemplate.create({
        data: {
          tenant_slug:       params.slug,
          nama:              t.name,
          template_name:     t.name,
          template_language: t.language || 'id',
          meta_category:     t.category || 'MARKETING',
          meta_template_id:  t.id || null,
          meta_status:       t.status || 'APPROVED',
          components_schema,
          preview_text:      (t.components?.find((c: any) => c.type === 'BODY')?.text || '').slice(0, 200),
          aktif:             true,
        },
      })
      synced++
    }

    return NextResponse.json({ success: true, synced, skipped, total: approved.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
