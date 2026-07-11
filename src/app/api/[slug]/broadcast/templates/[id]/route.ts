import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { createMetaTemplate } from '@/lib/meta-client'
import { z } from 'zod'

type Ctx = { params: { slug: string; id: string } }

const UpdateSchema = z.object({
  nama:               z.string().min(1).optional(),
  template_name:      z.string().min(1).optional(),
  template_namespace: z.string().optional(),
  template_language:  z.string().optional(),
  meta_category:      z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']).optional(),
  components_schema:  z.array(z.any()).optional(),
  preview_text:       z.string().optional(),
  aktif:              z.boolean().optional(),
  submit_to_meta:     z.boolean().optional(),
})

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageBroadcast')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = UpdateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })

    const db   = await getTenantDb(params.slug)
    const tmpl = await db.broadcastTemplate.findFirst({
      where: { id: params.id, tenant_slug: params.slug },
    })
    if (!tmpl) return NextResponse.json({ error: 'Template tidak ditemukan' }, { status: 404 })

    // Cek duplikat template_name jika diubah
    if (parsed.data.template_name && parsed.data.template_name !== tmpl.template_name) {
      const dup = await db.broadcastTemplate.findFirst({
        where: { tenant_slug: params.slug, template_name: parsed.data.template_name, id: { not: params.id } },
      })
      if (dup) return NextResponse.json({ error: 'Nama template sudah dipakai template lain' }, { status: 409 })
    }

    const { submit_to_meta, ...saveData } = parsed.data

    let meta_template_id: string | undefined
    let meta_status: string | undefined

    if (submit_to_meta) {
      const metaCfg = await db.metaConfig.findUnique({ where: { tenant_slug: params.slug } })
      if (!metaCfg?.waba_id) {
        return NextResponse.json({ error: 'WABA ID belum diatur di Pengaturan › Integrasi Meta' }, { status: 400 })
      }
      const components = (saveData.components_schema ?? tmpl.components_schema) as any[]
      const metaComponents = buildMetaComponents(components)
      const result = await createMetaTemplate(
        { phone_number_id: metaCfg.phone_number_id, access_token: metaCfg.access_token },
        metaCfg.waba_id,
        {
          name:       saveData.template_name ?? tmpl.template_name,
          category:   (saveData.meta_category ?? (tmpl as any).meta_category ?? 'MARKETING') as any,
          language:   saveData.template_language ?? tmpl.template_language,
          components: metaComponents,
        },
      )
      meta_template_id = result.id
      meta_status      = result.status
    }

    const updated = await db.broadcastTemplate.update({
      where: { id: params.id },
      data: {
        ...saveData,
        ...(meta_template_id ? { meta_template_id } : {}),
        ...(meta_status      ? { meta_status }      : {}),
        ...(meta_status === 'APPROVED' ? { aktif: true } : {}),
      },
    })
    return NextResponse.json({ success: true, data: updated, meta_status })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

function buildMetaComponents(schema: any[]): any[] {
  const result: any[] = []
  for (const comp of schema) {
    const metaComp: any = { type: comp.type.toUpperCase() }
    if (comp.type === 'header') {
      const format = comp.format || 'TEXT'
      metaComp.format = format
      if (format === 'TEXT') {
        if (comp.text) metaComp.text = comp.text
        if (comp.parameters?.length > 0)
          metaComp.example = { header_text: comp.parameters.map((p: any) => p.example || `[${p.param_key}]`) }
      } else {
        if (comp.media_url) metaComp.example = { header_handle: [comp.media_url] }
      }
    } else if (comp.type === 'body') {
      if (!comp.text) continue
      metaComp.text = comp.text
      if (comp.parameters?.length > 0)
        metaComp.example = { body_text: [comp.parameters.map((p: any) => p.example || `[${p.param_key}]`)] }
    } else if (comp.type === 'footer') {
      if (!comp.text) continue
      metaComp.text = comp.text
    } else {
      continue
    }
    result.push(metaComp)
  }
  return result
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageBroadcast')
  if (error) return error

  const db   = await getTenantDb(params.slug)
  const tmpl = await db.broadcastTemplate.findFirst({
    where: { id: params.id, tenant_slug: params.slug },
  })
  if (!tmpl) return NextResponse.json({ error: 'Template tidak ditemukan' }, { status: 404 })

  // Cek apakah template sedang dipakai campaign aktif
  const inUse = await db.campaign.findFirst({
    where: { template_id: params.id, status: { in: ['RUNNING', 'SCHEDULED'] } },
  })
  if (inUse) return NextResponse.json(
    { error: 'Template sedang dipakai campaign yang sedang berjalan atau terjadwal' },
    { status: 409 },
  )

  // Soft delete: set aktif = false (supaya campaign lama masih bisa referensi)
  await db.broadcastTemplate.update({ where: { id: params.id }, data: { aktif: false } })
  return NextResponse.json({ success: true })
}
