import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { getTenantDb } from '@/lib/tenant'
import { getMasterDb } from '@/lib/tenant'
import { createSession, sessionCookieOptions } from '@/lib/session'

const schema = z.object({
  email:      z.string().email(),
  password:   z.string().min(6),
  tenantSlug: z.string().min(3),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password, tenantSlug } = schema.parse(body)

    // Verifikasi tenant ada
    const masterDb = await getMasterDb()
    const tenant = await masterDb.tenant.findUnique({ where: { slug: tenantSlug } })
    if (!tenant || !tenant.aktif) {
      return NextResponse.json({ error: 'Tenant tidak ditemukan' }, { status: 404 })
    }

    // Cari user di DB tenant
    const db = await getTenantDb(tenantSlug)
    const user = await db.appUser.findFirst({
      where: { email, aktif: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Email atau password salah' }, { status: 401 })
    }

    // Verifikasi password
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Email atau password salah' }, { status: 401 })
    }

    // Update last_login_at
    await db.appUser.update({
      where: { id: user.id },
      data:  { last_login_at: new Date() },
    })

    // Buat JWT session
    const token = await createSession({
      userId:     user.id,
      tenantSlug,
      name:       user.name,
      email:      user.email,
      roles:      user.roles as string[],
    })

    const res = NextResponse.json({
      success:    true,
      tenantSlug,
      name:       user.name,
      roles:      user.roles,
    })

    res.cookies.set(sessionCookieOptions(token))
    return res

  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Input tidak valid' }, { status: 400 })
    }
    console.error('[auth/login]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
