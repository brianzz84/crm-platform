import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { fetchMetaTemplates } from '@/lib/meta-client'
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

const TemplateSchema = z.object({
  nama:               z.string().min(1),
  template_name:      z.string().min(1),
  template_namespace: z.string().optional(),
  template_language:  z.string().default('id'),
  components_schema:  z.array(z.any()).default([]),
  preview_text:       z.string().optional(),
})

export async function POST(req: NextRequest, { params }: Ctx) {
  const { error, session } = await requireTenantPermission(req, params.slug, 'manageBroadcast')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = TemplateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })

    const db = await getTenantDb(params.slug)

    const existing = await db.broadcastTemplate.findFirst({
      where: { tenant_slug: params.slug, template_name: parsed.data.template_name },
    })
    if (existing) return NextResponse.json({ error: 'Template dengan nama Wappin tersebut sudah ada' }, { status: 409 })

    const tmpl = await db.broadcastTemplate.create({
      data: { ...parsed.data, tenant_slug: params.slug },
    })
    return NextResponse.json({ success: true, data: tmpl }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
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
