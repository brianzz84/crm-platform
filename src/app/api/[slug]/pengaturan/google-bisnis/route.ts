import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { lupakanTokenTenant } from '@/lib/google-business-client'
import { z } from 'zod'

type Ctx = { params: { slug: string } }

const SimpanSchema = z.object({
  client_id:      z.string().min(1, 'Client ID wajib diisi'),
  // Rahasia: string kosong berarti "pertahankan yang tersimpan", bukan "kosongkan".
  client_secret:  z.string().optional().default(''),
  refresh_token:  z.string().optional().default(''),
  account_id:     z.string().optional().nullable(),
  location_utama: z.string().optional().nullable(),
  aktif:          z.boolean().default(true),
})

/** Bentuk aman untuk klien — rahasia tidak pernah ikut, hanya penanda ada/tidak. */
function bentukAman(cfg: any) {
  if (!cfg) return null
  return {
    id:                 cfg.id,
    client_id:          cfg.client_id,
    account_id:         cfg.account_id,
    location_utama:     cfg.location_utama,
    aktif:              cfg.aktif,
    has_client_secret:  !!cfg.client_secret,
    has_refresh_token:  !!cfg.refresh_token,
    tested_at:          cfg.tested_at?.toISOString() ?? null,
  }
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  const db  = await getTenantDb(params.slug)
  const cfg = await db.googleBisnisConfig.findUnique({ where: { tenant_slug: params.slug } })
  return NextResponse.json({ success: true, data: bentukAman(cfg) })
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const parsed = SimpanSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 })
    }
    const d  = parsed.data
    const db = await getTenantDb(params.slug)
    const lama = await db.googleBisnisConfig.findUnique({ where: { tenant_slug: params.slug } })

    const clientSecret = d.client_secret.trim() || lama?.client_secret || ''
    const refreshToken = d.refresh_token.trim() || lama?.refresh_token || ''
    if (!clientSecret || !refreshToken) {
      return NextResponse.json(
        { success: false, error: 'Client Secret dan Refresh Token wajib diisi pada penyimpanan pertama.' },
        { status: 400 },
      )
    }

    const isi = {
      client_id:      d.client_id.trim(),
      client_secret:  clientSecret,
      refresh_token:  refreshToken,
      account_id:     d.account_id?.trim()     || null,
      location_utama: d.location_utama?.trim() || null,
      aktif:          d.aktif,
    }

    const cfg = await db.googleBisnisConfig.upsert({
      where:  { tenant_slug: params.slug },
      create: { tenant_slug: params.slug, ...isi },
      update: isi,
    })

    // Kredensial berubah → access token hasil cache tidak lagi sah.
    lupakanTokenTenant(params.slug)

    return NextResponse.json({ success: true, data: bentukAman(cfg) })
  } catch (e) {
    const pesan = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ success: false, error: pesan }, { status: 500 })
  }
}
