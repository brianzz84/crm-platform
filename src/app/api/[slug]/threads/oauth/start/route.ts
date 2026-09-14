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
import { alamatAplikasi } from '@/lib/google-oauth'
import { urlOtorisasiThreads } from '@/lib/threads-api'

type Ctx = { params: { slug: string } }

export const COOKIE_STATE_THREADS = 'threads_oauth_state'

/** Satu alamat untuk seluruh tenant — Threads menuntut redirect URI terdaftar
 *  secara literal, jadi slug tidak boleh ada di dalam path. */
export function alamatCallbackThreads(): string {
  return `${alamatAplikasi()}/api/threads/oauth/callback`
}

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

  const nonce  = randomBytes(24).toString('hex')
  const tujuan = urlOtorisasiThreads(appId, alamatCallbackThreads(), nonce)

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
