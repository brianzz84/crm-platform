/**
 * GET  /api/[slug]/instagram/token  — status sambungan & umur token
 * POST /api/[slug]/instagram/token  — segarkan token sekarang juga
 *
 * Token jalur Instagram Login KEDALUWARSA dalam 60 hari, berbeda dari tiga token
 * Meta lain di tabel yang sama yang tidak pernah mati. Sepuluh hari kegagalan
 * senyap pada Agustus 2026 terjadi justru karena tidak ada satu pun layar yang
 * menampilkan tanggal kedaluwarsa. Route ini menutup celah itu.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { segarkanTokenTenant } from '@/lib/instagram-messaging'

type Ctx = { params: { slug: string } }

async function status(slug: string) {
  const db  = await getTenantDb(slug)
  const cfg = await db.metaConfig.findUnique({ where: { tenant_slug: slug } })

  const sisaHari = cfg?.ig_msg_expires_at
    ? Math.floor((cfg.ig_msg_expires_at.getTime() - Date.now()) / 86_400_000)
    : null

  return {
    tersambung:   !!cfg?.ig_msg_token,
    username:     cfg?.ig_msg_username ?? null,
    userId:       cfg?.ig_msg_user_id ?? null,
    kedaluwarsa:  cfg?.ig_msg_expires_at ?? null,
    sisaHari,
    disegarkanPada: cfg?.ig_msg_refreshed_at ?? null,
    aktif:        !!cfg?.ig_msg_aktif,
  }
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error
  try {
    return NextResponse.json({ success: true, data: await status(params.slug) })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    // Ambang 0 hari: penyegaran manual sengaja memaksa, tidak menunggu jadwal.
    // Meta tetap menolak token yang belum berumur 24 jam, dan penolakan itu
    // diteruskan apa adanya alih-alih disamarkan jadi "berhasil".
    const hasil = await segarkanTokenTenant(params.slug, 0)
    return NextResponse.json({
      success: hasil.status !== 'gagal',
      status:  hasil.status,
      pesan:   hasil.pesan,
      data:    await status(params.slug),
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 },
    )
  }
}
