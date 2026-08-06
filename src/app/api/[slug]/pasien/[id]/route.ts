import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { requireTenantPermission } from '@/lib/auth'

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } }
) {
  // Middleware sengaja tidak mencakup /api/, jadi penjaga di sini satu-satunya
  // yang ada. Tanpanya rekam pasien — identitas, kunjungan, percakapan — terbuka
  // bagi siapa pun yang tahu id-nya, tanpa perlu masuk sama sekali.
  const { error } = await requireTenantPermission(req, params.slug, 'viewPatients')
  if (error) return error

  try {
    const db = await getTenantDb(params.slug)

    const person = await db.person.findFirst({
      where: { id: params.id, tenant_slug: params.slug, aktif: true },
      include: {
        tags: {
          where: { aktif: true },
          include: { tag: true },
          orderBy: { assigned_at: 'desc' },
        },
        visits: {
          where: { aktif: true },
          orderBy: { tanggal: 'desc' },
          take: 20,
        },
        conversations: {
          orderBy: { last_message_at: 'desc' },
          take: 5,
          select: {
            id: true, channel: true, status: true,
            last_message_at: true, unread_count: true,
          },
        },
        campaign_recipients: {
          orderBy: { sent_at: 'desc' },
          take: 10,
          include: {
            campaign: { select: { id: true, nama: true, status: true } },
          },
        },
      },
    })

    if (!person) {
      return NextResponse.json({ error: 'Pasien tidak ditemukan' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: person })
  } catch (err) {
    console.error('[GET /api/[slug]/pasien/[id]]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } }
) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewPatients')
  if (error) return error

  try {
    const db   = await getTenantDb(params.slug)
    const body = await req.json()

    // Hanya field yang boleh diedit manual oleh admin
    const allowed = ['name', 'email', 'tanggal_lahir', 'no_hp', 'agama', 'jenis_kelamin', 'alamat', 'nik', 'no_rm', 'kategori']
    const data: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) data[key] = body[key]
    }

    // `updateMany` DIPAKAI SENGAJA, bukan `update`.
    //
    // `update` menuntut kunci unik, jadi ia hanya bisa menyaring `id` — dan id
    // saja tidak menyebut tenant. Slug di URL akhirnya tidak berpengaruh apa pun
    // pada baris mana yang tersentuh: pasien tenant lain ikut bisa disunting
    // asal id-nya diketahui. Di produksi seluruh tenant berbagi satu database,
    // jadi tidak ada batas lain yang menahannya.
    //
    // `updateMany` menerima penyaring gabungan, dan `count === 0` sekaligus
    // menjadi jawaban 404 tanpa perlu membaca dulu — jadi tidak ada celah antara
    // memeriksa dan mengubah.
    const hasil = await db.person.updateMany({
      where: { id: params.id, tenant_slug: params.slug },
      data:  { ...data, updated_at: new Date() },
    })

    if (hasil.count === 0) {
      return NextResponse.json({ error: 'Pasien tidak ditemukan' }, { status: 404 })
    }

    const person = await db.person.findFirst({
      where: { id: params.id, tenant_slug: params.slug },
    })

    return NextResponse.json({ success: true, data: person })
  } catch (err) {
    console.error('[PATCH /api/[slug]/pasien/[id]]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
