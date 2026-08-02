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
  // CATATAN: refresh_token TIDAK lagi diterima di sini. Ia hanya boleh diisi oleh
  // alur "Hubungkan dengan Google" (lihat oauth/start + /api/google/oauth/callback),
  // supaya token tidak pernah melewati form, papan klip, atau riwayat peramban.
  account_id:        z.string().optional().nullable(),
  location_utama:    z.string().optional().nullable(),
  ga4_property_id:   z.string().optional().nullable(),
  youtube_channel_id: z.string().optional().nullable(),
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
    ga4_property_id:    cfg.ga4_property_id,
    youtube_channel_id: cfg.youtube_channel_id,
    aktif:              cfg.aktif,
    has_client_secret:  !!cfg.client_secret,
    has_refresh_token:  !!cfg.refresh_token,
    scopes:             cfg.scopes ?? [],
    connected_at:       cfg.connected_at?.toISOString() ?? null,
    connected_email:    cfg.connected_email ?? null,
    tested_at:          cfg.tested_at?.toISOString() ?? null,
  }
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  const db  = await getTenantDb(params.slug)
  const cfg = await db.googleConfig.findUnique({ where: { tenant_slug: params.slug } })
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
    const lama = await db.googleConfig.findUnique({ where: { tenant_slug: params.slug } })

    const clientSecret = d.client_secret.trim() || lama?.client_secret || ''
    if (!clientSecret) {
      return NextResponse.json(
        { success: false, error: 'Client Secret wajib diisi pada penyimpanan pertama.' },
        { status: 400 },
      )
    }

    // refresh_token sengaja TIDAK disentuh di sini — dipertahankan apa adanya dan
    // hanya ditulis oleh alur OAuth. Menyimpan ulang kredensial tidak boleh
    // memutus sambungan yang sudah jadi.
    //
    // KECUALI Client ID berganti: refresh token terikat pada client yang
    // menerbitkannya, jadi menyimpannya hanya akan menyisakan sambungan yang
    // tampak hijau padahal pasti gagal saat dipakai. Lebih baik dikosongkan
    // supaya admin tahu harus menyambungkan ulang.
    const clientIdBaru = d.client_id.trim()
    const clientIdBerganti = !!lama && lama.client_id !== clientIdBaru
    const resetSambungan = clientIdBerganti
      ? { refresh_token: '', scopes: [], connected_at: null, connected_email: null }
      : {}

    const isi = {
      client_id:      clientIdBaru,
      client_secret:  clientSecret,
      ...resetSambungan,
      account_id:        d.account_id?.trim()        || null,
      location_utama:    d.location_utama?.trim()    || null,
      ga4_property_id:   d.ga4_property_id?.trim()   || null,
      youtube_channel_id: d.youtube_channel_id?.trim() || null,
      aktif:          d.aktif,
    }

    const cfg = await db.googleConfig.upsert({
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
