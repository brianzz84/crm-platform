import { NextRequest, NextResponse } from 'next/server'
import { getMasterDb, getTenantDb } from '@/lib/tenant'
import { hashPassword } from '@/lib/password'
import { z } from 'zod'

// GET: validasi token sebelum tampilkan form
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
          where:  { reset_token: token },
          select: { id: true, name: true, email: true, reset_expires_at: true },
        })
        if (user) {
          const expired = user.reset_expires_at && new Date() > new Date(user.reset_expires_at)
          return NextResponse.json({ success: true, data: { name: user.name, email: user.email, expired } })
        }
      } catch { /* skip tenant tidak terjangkau */ }
    }

    return NextResponse.json({ error: 'Token tidak ditemukan' }, { status: 404 })
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

const Schema = z.object({
  token:    z.string().uuid(),
  password: z.string().min(8),
})

// POST: set password baru
export async function POST(req: NextRequest) {
  try {
    const body   = await req.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Token atau password tidak valid' }, { status: 400 })
    }

    const { token, password } = parsed.data

    const masterDb = await getMasterDb()
    const tenants  = await masterDb.tenant.findMany({ select: { slug: true } })

    let foundUser: any = null
    let foundSlug = ''

    for (const t of tenants) {
      try {
        const db   = await getTenantDb(t.slug)
        const user = await db.appUser.findFirst({ where: { reset_token: token } })
        if (user) { foundUser = user; foundSlug = t.slug; break }
      } catch { /* skip */ }
    }

    if (!foundUser) {
      return NextResponse.json({ error: 'Link tidak valid atau sudah kadaluarsa' }, { status: 404 })
    }

    if (foundUser.reset_expires_at && new Date() > new Date(foundUser.reset_expires_at)) {
      return NextResponse.json({ error: 'Link reset sudah kadaluarsa. Minta link baru.' }, { status: 410 })
    }

    const passwordHash = await hashPassword(password)
    const db = await getTenantDb(foundSlug)

    await db.appUser.update({
      where: { id: foundUser.id },
      data:  { password_hash: passwordHash, reset_token: null, reset_expires_at: null },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[POST /api/auth/reset-password]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
