import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'

type Ctx = { params: { slug: string } }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const db      = await getTenantDb(params.slug)
  const profile = await db.tenantProfile.findUnique({
    where:  { tenant_slug: params.slug },
    select: { nama_klinik: true, logo_url: true },
  })

  const appName   = profile?.nama_klinik ? `CRM 360 — ${profile.nama_klinik}` : 'CRM 360'
  const logoUrl   = profile?.logo_url || null

  // Icon: pakai logo tenant jika ada, fallback ke icon default
  const icons = logoUrl
    ? [
        { src: logoUrl, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: logoUrl, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ]
    : [
        { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ]

  const manifest = {
    name:             appName,
    short_name:       'CRM 360',
    description:      `Customer Relationship Management 360° — ${profile?.nama_klinik || params.slug}`,
    start_url:        `/${params.slug}/dashboard`,
    scope:            `/${params.slug}/`,
    display:          'standalone',
    background_color: '#0F2744',
    theme_color:      '#0F2744',
    orientation:      'portrait-primary',
    lang:             'id',
    icons,
    shortcuts: [
      {
        name:        'Inbox',
        short_name:  'Inbox',
        description: 'Buka percakapan masuk',
        url:         `/${params.slug}/inbox`,
        icons:       [{ src: logoUrl || '/icons/icon-96x96.png', sizes: '96x96' }],
      },
    ],
  }

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
