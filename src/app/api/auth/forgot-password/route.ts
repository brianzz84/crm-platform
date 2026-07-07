import { NextRequest, NextResponse } from 'next/server'
import { getMasterDb, getTenantDb } from '@/lib/tenant'
import { randomUUID } from 'crypto'
import { z } from 'zod'

const Schema = z.object({
  tenantSlug: z.string().min(1),
  email:      z.string().email(),
})

export async function POST(req: NextRequest) {
  try {
    const body   = await req.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Data tidak valid' }, { status: 400 })
    }

    const { tenantSlug, email } = parsed.data

    // Verifikasi tenant ada
    const masterDb = await getMasterDb()
    const tenant   = await masterDb.tenant.findUnique({ where: { slug: tenantSlug }, select: { slug: true } })
    if (!tenant) {
      // Jangan bocorkan info: tenant tidak ada → respons sama seperti berhasil
      return NextResponse.json({ success: true })
    }

    const db   = await getTenantDb(tenantSlug)
    const user = await db.appUser.findFirst({
      where: { tenant_slug: tenantSlug, email, aktif: true },
      select: { id: true, name: true, email: true },
    })

    if (!user) {
      // User tidak ada atau belum aktif — respons sama (mencegah user enumeration)
      return NextResponse.json({ success: true })
    }

    const resetToken   = randomUUID()
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000) // 1 jam

    await db.appUser.update({
      where: { id: user.id },
      data:  { reset_token: resetToken, reset_expires_at: resetExpires },
    })

    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`
    await sendResetEmail(user.email, user.name, tenantSlug, resetUrl)

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[POST /api/auth/forgot-password]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

async function sendResetEmail(to: string, name: string, slug: string, resetUrl: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[reset-password] RESEND_API_KEY tidak ada. Reset URL:', resetUrl)
    return
  }

  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    'CRM Platform <noreply@meditech.my.id>',
      to:      [to],
      subject: 'Reset Password — CRM Platform',
      html: `
        <p>Halo <strong>${name}</strong>,</p>
        <p>Anda meminta reset password untuk akun CRM Platform Anda di tenant <strong>${slug}</strong>.</p>
        <p>Klik tautan berikut untuk mengatur password baru (berlaku 1 jam):</p>
        <p><a href="${resetUrl}" style="background:#0F52BA;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Reset Password</a></p>
        <p>Atau salin URL ini:<br/><code>${resetUrl}</code></p>
        <p>Jika Anda tidak merasa meminta reset password, abaikan email ini.</p>
        <hr/>
        <small style="color:#888;">CRM Platform — ${slug}</small>
      `,
    }),
  })
}
