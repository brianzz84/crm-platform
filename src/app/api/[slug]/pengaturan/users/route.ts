import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb, getMasterDb } from '@/lib/tenant'
import { requireTenantPermission } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { randomUUID } from 'crypto'
import { z } from 'zod'

const InviteSchema = z.object({
  name:  z.string().min(2),
  email: z.string().email(),
  roles: z.array(z.enum(['SUPER_ADMIN', 'ADMIN_IT', 'ADMIN_OPS', 'SUPERVISOR', 'AGEN'])).min(1),
})

// GET: list semua user dalam tenant
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageUsers')
  if (error) return error

  try {
    const db    = await getTenantDb(params.slug)
    const users = await db.appUser.findMany({
      where:   { tenant_slug: params.slug },
      orderBy: { created_at: 'desc' },
      select: {
        id: true, name: true, email: true, roles: true,
        aktif: true, last_login_at: true, created_at: true,
        invite_token: true,
      },
    })

    // Hitung apakah ada minimal 1 ADMIN_IT aktif (untuk safeguard nonaktifkan)
    const activeAdminItCount = users.filter(u =>
      u.aktif && u.roles.includes('ADMIN_IT' as any)
    ).length

    return NextResponse.json({ success: true, data: users, meta: { activeAdminItCount } })
  } catch (e) {
    console.error('[GET /pengaturan/users]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST: undang user baru
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { session, error } = await requireTenantPermission(req, params.slug, 'manageUsers')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = InviteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Data tidak valid', details: parsed.error.flatten() }, { status: 400 })
    }

    const db = await getTenantDb(params.slug)

    // Cek duplikat email dalam tenant
    const existing = await db.appUser.findUnique({
      where: { tenant_slug_email: { tenant_slug: params.slug, email: parsed.data.email } },
    })
    if (existing) {
      return NextResponse.json({ error: 'Email sudah terdaftar di tenant ini' }, { status: 409 })
    }

    const inviteToken   = randomUUID()
    const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 hari

    const user = await db.appUser.create({
      data: {
        tenant_slug:       params.slug,
        name:              parsed.data.name,
        email:             parsed.data.email,
        password_hash:     '',            // kosong sampai user set via invite link
        roles:             parsed.data.roles as any,
        aktif:             false,         // aktif setelah user set password
        invite_token:      inviteToken,
        invite_expires_at: inviteExpires,
      },
      select: { id: true, name: true, email: true, roles: true, aktif: true, created_at: true },
    })

    // Nama brand tenant (bukan slug) untuk narasi email yang eksklusif
    const masterDb   = await getMasterDb()
    const tenant     = await masterDb.tenant.findUnique({ where: { slug: params.slug }, select: { name: true } })
    const brandName  = tenant?.name || 'CRM Platform'

    // Kirim email undangan (jika RESEND_API_KEY ada)
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/aktivasi?token=${inviteToken}`
    const emailResult = await sendInviteEmail(parsed.data.email, parsed.data.name, session!.name, brandName, inviteUrl)

    return NextResponse.json({
      success:    true,
      data:       user,
      inviteUrl,
      emailSent:  emailResult.sent,
      emailError: emailResult.error,
    }, { status: 201 })
  } catch (e) {
    console.error('[POST /pengaturan/users]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

async function sendInviteEmail(
  to: string, name: string, invitedBy: string, brandName: string, inviteUrl: string
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[invite] RESEND_API_KEY tidak ada — email tidak dikirim, gunakan inviteUrl')
    return { sent: false, error: 'RESEND_API_KEY belum dikonfigurasi' }
  }
  const from = process.env.RESEND_FROM || `${brandName} <noreply@meditech.my.id>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to:      [to],
        subject: `Undangan akses ${brandName}`,
        html: `
          <p>Halo <strong>${name}</strong>,</p>
          <p>Anda diundang oleh <strong>${invitedBy}</strong> untuk mengakses <strong>${brandName}</strong>.</p>
          <p>Klik tombol di bawah untuk mengaktifkan akun dan membuat password:</p>
          <p><a href="${inviteUrl}" style="background:#0089A8;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Aktifkan Akun</a></p>
          <p>Link ini berlaku selama 7 hari.</p>
          <p style="color:#999;font-size:12px;">Jika Anda tidak merasa diundang, abaikan email ini.</p>
        `,
      }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      const msg = j?.message || j?.error?.message || `HTTP ${res.status}`
      console.error('[invite] Resend menolak:', JSON.stringify(j))
      return { sent: false, error: msg }
    }
    return { sent: true }
  } catch (e: any) {
    console.error('[invite] Gagal kirim email:', e)
    return { sent: false, error: e?.message || 'network error' }
  }
}
