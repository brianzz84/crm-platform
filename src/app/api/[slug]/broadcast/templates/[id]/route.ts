import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { z } from 'zod'

type Ctx = { params: { slug: string; id: string } }

const UpdateSchema = z.object({
  nama:               z.string().min(1).optional(),
  template_name:      z.string().min(1).optional(),
  template_namespace: z.string().optional(),
  template_language:  z.string().optional(),
  components_schema:  z.array(z.any()).optional(),
  preview_text:       z.string().optional(),
  aktif:              z.boolean().optional(),
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
      if (dup) return NextResponse.json({ error: 'Nama Wappin template sudah dipakai template lain' }, { status: 409 })
    }

    const updated = await db.broadcastTemplate.update({
      where: { id: params.id },
      data:  parsed.data,
    })
    return NextResponse.json({ success: true, data: updated })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
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
