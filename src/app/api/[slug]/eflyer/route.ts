import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'

type Ctx = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'replyChat')
  if (error) return error

  const db  = await getTenantDb(params.slug)
  const cfg = await db.eflyerConfig.findUnique({ where: { tenant_slug: params.slug } })

  if (!cfg || !cfg.aktif)    return NextResponse.json({ error: 'Fitur e-flyer tidak aktif' }, { status: 403 })
  if (!cfg.api_url || !cfg.api_key) return NextResponse.json({ error: 'Konfigurasi e-flyer belum lengkap' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const q    = searchParams.get('q')    || ''
  const cat  = searchParams.get('cat')  || ''
  const dept = searchParams.get('dept') || ''

  const proxyUrl = new URL(cfg.api_url)
  proxyUrl.searchParams.set('key',   cfg.api_key)
  proxyUrl.searchParams.set('limit', '60')
  if (q)    proxyUrl.searchParams.set('q',        q)
  if (cat)  proxyUrl.searchParams.set('category', cat)
  if (dept) proxyUrl.searchParams.set('dept',     dept)

  try {
    const resp = await fetch(proxyUrl.toString(), {
      signal: AbortSignal.timeout(10_000),
    })
    if (!resp.ok) return NextResponse.json({ error: 'Gagal fetch dari server flyer' }, { status: 502 })
    const json = await resp.json()
    return NextResponse.json(json)
  } catch (e: any) {
    return NextResponse.json({ error: `Timeout / network error: ${e.message}` }, { status: 504 })
  }
}
