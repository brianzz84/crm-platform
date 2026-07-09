import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { PLATFORM_DOMAIN } from './constants'

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/aktivasi',
  '/forgot-password',
  '/reset-password',
  '/api/auth',
  '/api/register',
  '/api/webhook',
  '/api/health',     // Railway health check
  '/kegiatan',       // public check-in page
  '/api/kegiatan',   // public check-in API
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const hostname = req.headers.get('host') || ''

  // Lewati asset statis
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next()
  }

  // Halaman publik — tidak perlu auth
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Tentukan tenant slug dari hostname
  const isCustomDomain = !hostname.includes(PLATFORM_DOMAIN) && !hostname.includes('localhost')
  let tenantSlug: string | null = null

  if (isCustomDomain) {
    tenantSlug = req.cookies.get('tenant-slug')?.value ?? null
  } else {
    // Hapus port dulu sebelum split (localhost:3002 → localhost)
    const hostWithoutPort = hostname.split(':')[0]
    const sub = hostWithoutPort.split('.')[0]
    if (sub && sub !== 'www' && sub !== 'localhost') {
      tenantSlug = sub
    }
  }

  // Verifikasi JWT session
  const session = await getSessionFromRequest(req)
  if (!session) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Jika sudah login tapi akses /login → redirect ke dashboard
  if (pathname === '/login') {
    return NextResponse.redirect(new URL(`/${session.tenantSlug}/dashboard`, req.url))
  }

  // Inject data session ke header untuk server component
  const headers = new Headers(req.headers)
  headers.set('x-tenant-slug', tenantSlug || session.tenantSlug)
  headers.set('x-user-id', session.userId)
  headers.set('x-user-name', session.name)
  headers.set('x-user-roles', session.roles.join(','))

  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
