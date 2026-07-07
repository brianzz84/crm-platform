import { NextRequest, NextResponse } from 'next/server'
import { getMasterDb, getTenantDb, copyGlobalToTenant } from '@/lib/tenant'
import { randomUUID } from 'crypto'
import { z } from 'zod'

const Schema = z.object({
  orgName:   z.string().min(3, 'Nama organisasi minimal 3 karakter'),
  slug:      z.string().min(2, 'Kode minimal 2 karakter').max(20).regex(/^[a-z0-9-]+$/, 'Hanya huruf kecil, angka, dan tanda hubung'),
  adminName: z.string().min(2, 'Nama minimal 2 karakter'),
  email:     z.string().email('Format email tidak valid'),
  phone:     z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body   = await req.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0]
      return NextResponse.json({ error: firstError || 'Data tidak valid' }, { status: 400 })
    }

    const { orgName, slug, adminName, email } = parsed.data

    const masterDb = await getMasterDb()

    // Cek slug unik
    const existing = await masterDb.tenant.findUnique({ where: { slug } })
    if (existing) {
      return NextResponse.json({ error: 'Kode organisasi sudah digunakan. Pilih kode lain.' }, { status: 409 })
    }

    // Database URL untuk tenant baru — gunakan template dari env
    // Production: provisioning service yang buat DB baru
    // Development: gunakan pola dari DATABASE_URL (ganti nama DB)
    const dbUrlTemplate = process.env.TENANT_DB_URL_TEMPLATE
    if (!dbUrlTemplate) {
      return NextResponse.json({ error: 'Konfigurasi server belum lengkap. Hubungi administrator.' }, { status: 503 })
    }
    const tenantDbUrl = dbUrlTemplate.replace('{slug}', slug)

    // Buat tenant
    const tenant = await masterDb.tenant.create({
      data: {
        slug,
        name:         orgName,
        database_url: tenantDbUrl,
        plan:         'TRIAL',
        aktif:        true,
      },
    })

    // Copy library global (ICD, dll) ke tenant DB
    try {
      await copyGlobalToTenant(tenant.id)
    } catch (e) {
      console.warn('[register] copyGlobalToTenant gagal (DB mungkin belum diinisialisasi):', e)
    }

    // Buat user ADMIN_IT pertama via invite flow
    const inviteToken   = randomUUID()
    const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    let tenantDb
    try {
      tenantDb = await getTenantDb(slug)
      await tenantDb.appUser.create({
        data: {
          tenant_slug:       slug,
          name:              adminName,
          email,
          password_hash:     '',
          roles:             ['ADMIN_IT'],
          aktif:             false,
          invite_token:      inviteToken,
          invite_expires_at: inviteExpires,
        },
      })
    } catch (e) {
      console.warn('[register] Buat AppUser gagal — DB tenant belum ready:', e)
    }

    const activateUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/aktivasi?token=${inviteToken}`
    await sendWelcomeEmail(email, adminName, orgName, slug, activateUrl)

    return NextResponse.json({
      success: true,
      data: {
        slug,
        orgName,
        activateUrl, // Kembalikan URL — berguna jika email tidak terkirim
      },
    }, { status: 201 })
  } catch (e) {
    console.error('[POST /api/register]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

async function sendWelcomeEmail(
  to: string, name: string, orgName: string, slug: string, activateUrl: string
) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[register] RESEND_API_KEY tidak ada. Activate URL:', activateUrl)
    return
  }

  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    'CRM Platform <noreply@meditech.my.id>',
      to:      [to],
      subject: `Selamat datang di CRM Platform — ${orgName}`,
      html: `
        <p>Halo <strong>${name}</strong>,</p>
        <p>Akun organisasi <strong>${orgName}</strong> (kode: <code>${slug}</code>) berhasil didaftarkan di CRM Platform.</p>
        <p>Aktifkan akun Admin IT Anda dan buat password dengan mengklik tautan berikut (berlaku 7 hari):</p>
        <p><a href="${activateUrl}" style="background:#0F52BA;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;">Aktifkan Akun Saya</a></p>
        <p>Atau salin URL ini:<br/><code>${activateUrl}</code></p>
        <p>Setelah aktivasi, masuk ke dashboard Anda di:<br/>
           <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/${slug}/dashboard">
             ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/${slug}/dashboard
           </a>
        </p>
        <hr/>
        <small style="color:#888;">CRM Platform • Masa trial aktif 30 hari</small>
      `,
    }),
  })
}
