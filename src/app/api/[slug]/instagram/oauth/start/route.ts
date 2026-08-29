/**
 * GET /api/[slug]/instagram/oauth/start
 *
 * Memulai Business Login for Instagram. Menyiapkan nonce, menaruhnya di cookie
 * bersama slug, lalu mengalihkan admin ke layar izin Instagram.
 *
 * Kredensial Instagram BERBEDA dari kredensial app Meta: ID dan secret aplikasi
 * Instagram punya nilainya sendiri di Dasbor App → Instagram. Memakai App ID Meta
 * di sini akan ditolak dengan galat client_id yang membingungkan.
 */
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { requireTenantPermission } from '@/lib/auth'
import { alamatAplikasi } from '@/lib/google-oauth'
import { urlOtorisasi } from '@/lib/instagram-messaging'

type Ctx = { params: { slug: string } }

export const COOKIE_STATE_IG = 'ig_msg_oauth_state'

/** Satu alamat untuk seluruh tenant — Instagram menuntut redirect URI terdaftar
 *  secara literal, jadi slug tidak boleh ada di dalam path. */
export function alamatCallbackIg(): string {
  return `${alamatAplikasi()}/api/instagram/oauth/callback`
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  const appId = process.env.INSTAGRAM_APP_ID
  if (!appId) {
    return NextResponse.json(
      { success: false, error: 'INSTAGRAM_APP_ID belum diset. Ambil dari Dasbor App → Instagram → ID aplikasi Instagram.' },
      { status: 500 },
    )
  }

  const nonce = randomBytes(24).toString('hex')
  const tujuan = urlOtorisasi(appId, alamatCallbackIg(), nonce)

  const res = new NextResponse(null, { status: 307, headers: { Location: tujuan } })
  // Slug ikut di cookie karena callback tidak punya slug di path-nya.
  res.cookies.set(COOKIE_STATE_IG, `${nonce}:${params.slug}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
    path:     '/',
    maxAge:   600, // sepuluh menit; otorisasi yang lebih lama dari ini pantas diulang
  })
  return res
}
