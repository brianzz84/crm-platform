import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { requireTenantPermission } from '@/lib/auth'
import { randomUUID } from 'crypto'
import { z } from 'zod'

type Ctx = { params: { slug: string; userId: string } }

const UpdateSchema = z.object({
  roles: z.array(z.enum(['SUPER_ADMIN', 'ADMIN_IT', 'ADMIN_OPS', 'SUPERVISOR', 'AGEN'])).min(1).optional(),
  aktif: z.boolean().optional(),
  name:  z.string().min(2).optional(),
})

// PATCH: update role / aktif / nama
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { session, error } = await requireTenantPermission(req, params.slug, 'manageUsers')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = UpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Data tidak valid' }, { status: 400 })
    }

    const db   = await getTenantDb(params.slug)
    const user = await db.appUser.findFirst({
      where: { id: params.userId, tenant_slug: params.slug },
    })
    if (!user) return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 })

    // Safeguard: jangan nonaktifkan diri sendiri
    if (parsed.data.aktif === false && params.userId === session!.userId) {
      return NextResponse.json({ error: 'Tidak bisa menonaktifkan akun sendiri' }, { status: 409 })
    }

    // Safeguard: jangan nonaktifkan ADMIN_IT terakhir yang aktif
    if (parsed.data.aktif === false && user.roles.includes('ADMIN_IT' as any)) {
      const activeAdminItCount = await db.appUser.count({
        where: {
          tenant_slug: params.slug,
          aktif: true,
          id: { not: params.userId },
          roles: { has: 'ADMIN_IT' as any },
        },
      })
      if (activeAdminItCount === 0) {
        return NextResponse.json({
          error: 'Tidak bisa menonaktifkan ADMIN_IT terakhir yang aktif di tenant ini',
        }, { status: 409 })
      }
    }

    const updated = await db.appUser.update({
      where: { id: params.userId },
      data: {
        ...(parsed.data.name  !== undefined ? { name: parsed.data.name }   : {}),
        ...(parsed.data.roles !== undefined ? { roles: parsed.data.roles as any } : {}),
        ...(parsed.data.aktif !== undefined ? { aktif: parsed.data.aktif } : {}),
      },
      select: { id: true, name: true, email: true, roles: true, aktif: true },
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (e) {
    console.error('[PATCH /pengaturan/users/:id]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST: kirim ulang link undangan
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageUsers')
  if (error) return error

  try {
    const db   = await getTenantDb(params.slug)
    const user = await db.appUser.findFirst({
      where: { id: params.userId, tenant_slug: params.slug, aktif: false },
    })
    if (!user) return NextResponse.json({ error: 'User tidak ditemukan atau sudah aktif' }, { status: 404 })

    const inviteToken   = randomUUID()
    const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    await db.appUser.update({
      where: { id: params.userId },
      data:  { invite_token: inviteToken, invite_expires_at: inviteExpires },
    })

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/aktivasi?token=${inviteToken}`
    return NextResponse.json({ success: true, inviteUrl })
  } catch (e) {
    console.error('[POST resend /pengaturan/users/:id]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
