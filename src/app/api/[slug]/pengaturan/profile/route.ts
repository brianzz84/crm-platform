import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { z } from 'zod'

type Ctx = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  const db      = await getTenantDb(params.slug)
  const profile = await db.tenantProfile.findUnique({ where: { tenant_slug: params.slug } })
  return NextResponse.json({ success: true, data: profile })
}

const ProfileSchema = z.object({
  nama_klinik: z.string().min(1, 'Nama klinik wajib diisi'),
  nama_rs:     z.string().min(1, 'Nama RS (untuk template) wajib diisi'),
  logo_url:    z.string().url().optional().or(z.literal('')),
  alamat:      z.string().optional(),
  telp:        z.string().optional(),
  email:       z.string().email().optional().or(z.literal('')),
  website:     z.string().url().optional().or(z.literal('')),
})

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = ProfileSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })

    const db      = await getTenantDb(params.slug)
    const profile = await db.tenantProfile.upsert({
      where:  { tenant_slug: params.slug },
      create: { tenant_slug: params.slug, ...parsed.data },
      update: parsed.data,
    })
    return NextResponse.json({ success: true, data: profile })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
