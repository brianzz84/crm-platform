import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { z } from 'zod'
import { randomUUID } from 'crypto'

type Ctx = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  const db  = await getTenantDb(params.slug)
  const cfg = await db.wappinConfig.findUnique({ where: { tenant_slug: params.slug } })

  if (!cfg) return NextResponse.json({ success: true, data: null })

  // Jangan kirim password/secret_key ke client
  const { password, secret_key, ...safe } = cfg as any
  return NextResponse.json({ success: true, data: { ...safe, has_password: !!password, has_secret_key: !!secret_key } })
}

const WappinSchema = z.object({
  api_version:  z.enum(['v1', 'v2']).default('v2'),
  client_id:    z.string().optional(),
  project_id:   z.string().optional(),
  secret_key:   z.string().optional(),
  username:     z.string().optional(),
  password:     z.string().optional(),
  base_url:     z.string().url().default('https://api.chat.wappin.app'),
  login_url:    z.string().default('/auth/login'),
  messages_url: z.string().default('/v1/messages'),
  namespace:    z.string().optional(),
  aktif:        z.boolean().default(true),
})

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = WappinSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })

    const db  = await getTenantDb(params.slug)
    const existing = await db.wappinConfig.findUnique({ where: { tenant_slug: params.slug } })

    // Hapus field kosong agar tidak overwrite password lama dengan string kosong
    const data: any = { ...parsed.data }
    if (!data.password)   delete data.password
    if (!data.secret_key) delete data.secret_key

    const cfg = existing
      ? await db.wappinConfig.update({ where: { tenant_slug: params.slug }, data })
      : await db.wappinConfig.create({ data: { ...data, tenant_slug: params.slug, webhook_secret: randomUUID() } })

    const { password, secret_key, ...safe } = cfg as any
    return NextResponse.json({ success: true, data: { ...safe, has_password: !!password, has_secret_key: !!secret_key } })
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST /api/[slug]/pengaturan/wappin/test — test koneksi
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  const db  = await getTenantDb(params.slug)
  const cfg = await db.wappinConfig.findUnique({ where: { tenant_slug: params.slug } })
  if (!cfg) return NextResponse.json({ error: 'Konfigurasi belum ada' }, { status: 400 })

  try {
    const resp = await fetch(`${cfg.base_url}${cfg.login_url}`, {
      method:  'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64'),
        'Content-Type':  'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    })
    const json = await resp.json().catch(() => ({}))

    if (resp.ok && json.users?.[0]?.token) {
      await db.wappinConfig.update({ where: { tenant_slug: params.slug }, data: { tested_at: new Date() } })
      return NextResponse.json({ success: true, message: 'Koneksi berhasil! Token berhasil didapatkan.' })
    } else {
      return NextResponse.json({ success: false, error: `Koneksi gagal: ${json.errors?.[0]?.title || resp.statusText}` })
    }
  } catch (e: any) {
    return NextResponse.json({ success: false, error: `Timeout / network error: ${e.message}` })
  }
}
