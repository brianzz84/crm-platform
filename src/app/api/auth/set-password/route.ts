import { NextRequest, NextResponse } from 'next/server'
import { getMasterDb, getTenantDb } from '@/lib/tenant'
import { hashPassword } from '@/lib/password'
import { createSession, sessionCookieOptions } from '@/lib/session'
import { z } from 'zod'

const Schema = z.object({
  token:    z.string().uuid(),
  password: z.string().min(8),
})

// POST: aktivasi akun dengan set password via invite token
export async function POST(req: NextRequest) {
  try {
    const body   = await req.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Token atau password tidak valid' }, { status: 400 })
    }

    const { token, password } = parsed.data

    // Cari user dengan token ini di master DB (untuk tau tenant_slug)
    // Karena user ada di tenant DB, kita cari dari master tenant list dulu
    // Approach: query semua tenant, cari yang punya invite_token ini
    // Lebih efisien: simpan mapping token→tenant_slug di master DB
    // Untuk sekarang: cari via brute force karena jumlah tenant terbatas
    const masterDb = await getMasterDb()
    const tenants  = await masterDb.tenant.findMany({
      select: { slug: true },
    })

    let foundUser: any = null
    let foundSlug = ''

    for (const t of tenants) {
      try {
        const db   = await getTenantDb(t.slug)
        const user = await db.appUser.findFirst({
          where: { invite_token: token },
        })
        if (user) {
          foundUser = user
          foundSlug = t.slug
          break
        }
      } catch {
        // skip tenant yg DB-nya tidak bisa diakses
      }
    }

    if (!foundUser) {
      return NextResponse.json({ error: 'Link tidak valid atau sudah kadaluarsa' }, { status: 404 })
    }

    // Cek expiry
    if (foundUser.invite_expires_at && new Date() > new Date(foundUser.invite_expires_at)) {
      return NextResponse.json({ error: 'Link undangan sudah kadaluarsa. Minta admin untuk kirim ulang.' }, { status: 410 })
    }

    const passwordHash = await hashPassword(password)
    const db = await getTenantDb(foundSlug)

    await db.appUser.update({
      where: { id: foundUser.id },
      data: {
        password_hash:     passwordHash,
        aktif:             true,
        invite_token:      null,
        invite_expires_at: null,
        last_login_at:     new Date(),
      },
    })

    // Auto-login: buat session langsung → user tak perlu login manual
    const token = await createSession({
      userId:     foundUser.id,
      tenantSlug: foundSlug,
      name:       foundUser.name,
      email:      foundUser.email,
      roles:      foundUser.roles as string[],
    })

    const res = NextResponse.json({
      success:    true,
      tenantSlug: foundSlug,
      email:      foundUser.email,
      redirect:   `/${foundSlug}`,
    })
    res.cookies.set(sessionCookieOptions(token))
    return res
  } catch (e) {
    console.error('[POST /api/auth/set-password]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// GET: validasi token (untuk pre-fill nama di halaman aktivasi)
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')
    if (!token) return NextResponse.json({ error: 'Token diperlukan' }, { status: 400 })

    const masterDb = await getMasterDb()
    const tenants  = await masterDb.tenant.findMany({ select: { slug: true } })

    for (const t of tenants) {
      try {
        const db   = await getTenantDb(t.slug)
        const user = await db.appUser.findFirst({
          where: { invite_token: token },
          select: { id: true, name: true, email: true, invite_expires_at: true },
        })
        if (user) {
          const expired = user.invite_expires_at && new Date() > new Date(user.invite_expires_at)
          return NextResponse.json({
            success: true,
            data: { name: user.name, email: user.email, expired, tenantSlug: t.slug },
          })
        }
      } catch { /* skip */ }
    }

    return NextResponse.json({ error: 'Token tidak ditemukan' }, { status: 404 })
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
