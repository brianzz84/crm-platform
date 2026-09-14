/**
 * GET /api/[slug]/threads/oauth/start
 *
 * Memulai otorisasi Threads. Menyiapkan nonce, menaruhnya di cookie bersama
 * slug, lalu mengalihkan admin ke layar izin Threads.
 *
 * Kredensial Threads BERBEDA dari kredensial Instagram maupun app Meta — ia
 * punya App ID dan secret sendiri di Dasbor App → Threads API. Memakai ID yang
 * salah akan ditolak dengan galat client_id yang membingungkan, persis seperti
 * yang pernah terjadi pada jalur Instagram.
 */
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { requireTenantPermission } from '@/lib/auth'
import {
  urlOtorisasiThreads, alamatCallbackThreads,
  COOKIE_STATE_THREADS, SCOPE_THREADS, SCOPE_THREADS_DASAR,
} from '@/lib/threads-api'

type Ctx = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  const appId = process.env.THREADS_APP_ID
  if (!appId) {
    return NextResponse.json({
      success: false,
      error: 'THREADS_APP_ID belum diset. Ambil dari Dasbor App → Threads API → ID aplikasi Threads (BUKAN App ID Meta maupun Instagram).',
    }, { status: 500 })
  }

  // `?dasar=1` meminta izin dasar saja. Dipakai bila layar izin menolak karena
  // `threads_keyword_search` belum aktif di dasbor — lihat catatan pada
  // SCOPE_THREADS_DASAR. Penyambungan yang gagal di depan tidak membuktikan
  // apa pun; yang berguna adalah galat dari endpointnya sendiri.
  const dasarSaja = req.nextUrl.searchParams.get('dasar') === '1'
  const nonce  = randomBytes(24).toString('hex')
  const tujuan = urlOtorisasiThreads(
    appId, alamatCallbackThreads(), nonce,
    dasarSaja ? SCOPE_THREADS_DASAR : SCOPE_THREADS,
  )

  const res = new NextResponse(null, { status: 307, headers: { Location: tujuan } })
  res.cookies.set(COOKIE_STATE_THREADS, `${nonce}:${params.slug}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
    path:     '/',
    maxAge:   600,
  })
  return res
}
