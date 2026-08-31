/**
 * Daftar & penetapan topik percakapan.
 *
 * GET   — percakapan beserta usulan AI-nya, untuk ditinjau manusia.
 * PATCH — menetapkan `topik`. Hanya lewat sini angka laporan berubah.
 *
 * Cuplikan pesan ikut dikembalikan karena tanpa itu peninjauan mustahil: menilai
 * usulan tanpa melihat yang ditanyakan hanya akan jadi stempel. Yang dikirim
 * dibatasi pesan MASUK pertama — cukup untuk menilai, dan tidak menjadikan layar
 * ini salinan kedua dari Inbox.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { semaiTopik } from '@/lib/percakapan-topik'

type Ctx = { params: { slug: string } }

const MAKS_BARIS   = 100
const MAKS_CUPLIKAN = 240

/** Bentuk baris apa adanya dari Prisma, sebelum diubah ke nama yang dipakai UI. */
interface BarisMentah {
  id: string
  channel: string
  channel_user_name: string | null
  last_message_at: Date
  topik: string | null
  topik_usulan: string | null
  topik_alasan: string | null
  messages: { content: string | null }[]
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewKanalPublik')
  if (error) return error

  // `saring`: 'perlu' = belum ditetapkan manusia (inilah pekerjaannya),
  //           'selesai' = sudah ditetapkan, 'semua' = keduanya.
  const saring = req.nextUrl.searchParams.get('saring') ?? 'perlu'

  try {
    const db = await getTenantDb(params.slug)
    await semaiTopik(db, params.slug)

    const where: any = {
      tenant_slug: params.slug,
      messages: { some: { direction: 'incoming', is_internal_note: false } },
    }
    if (saring === 'perlu')        where.topik = null
    else if (saring === 'selesai') where.NOT   = { topik: null }

    const [topik, rows, jumlahPerlu] = await Promise.all([
      db.percakapanTopikLibrary.findMany({
        where:   { tenant_slug: params.slug, aktif: true },
        orderBy: [{ urutan: 'asc' }],
        select:  { kode: true, nama: true, warna: true },
      }),
      db.conversation.findMany({
        where,
        orderBy: { last_message_at: 'desc' },
        take:    MAKS_BARIS,
        select: {
          id: true, channel: true, channel_user_name: true, last_message_at: true,
          topik: true, topik_usulan: true, topik_alasan: true,
          messages: {
            where:   { direction: 'incoming', is_internal_note: false },
            orderBy: { created_at: 'asc' },
            take:    1,
            select:  { content: true },
          },
        },
      }),
      db.conversation.count({
        where: {
          tenant_slug: params.slug, topik: null,
          messages: { some: { direction: 'incoming', is_internal_note: false } },
        },
      }),
    ])

    return NextResponse.json({
      success: true,
      topik,
      jumlahPerlu,
      data: rows.map((r: BarisMentah) => ({
        id:            r.id,
        kanal:         r.channel,
        nama:          r.channel_user_name,
        terakhirPada:  r.last_message_at,
        topik:         r.topik,
        topikUsulan:   r.topik_usulan,
        topikAlasan:   r.topik_alasan,
        cuplikan:      (r.messages[0]?.content ?? '').slice(0, MAKS_CUPLIKAN),
      })),
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewKanalPublik')
  if (error) return error

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Body bukan JSON.' }, { status: 400 })
  }

  try {
    const db = await getTenantDb(params.slug)
    const sah = new Set(
      (await db.percakapanTopikLibrary.findMany({
        where: { tenant_slug: params.slug, aktif: true }, select: { kode: true },
      })).map((t: { kode: string }) => t.kode),
    )

    // Terima semua usulan sekaligus. Ada karena riwayat pertama menumpuk puluhan
    // percakapan, dan memaksa satu per satu di situ hanya melahirkan klik tanpa
    // membaca. Hanya menyentuh yang PUNYA usulan dan BELUM ditetapkan — usulan
    // yang sudah ditolak manusia tidak pernah dihidupkan kembali dari sini.
    if (body.setujuiSemua === true) {
      const kandidat = await db.conversation.findMany({
        where: { tenant_slug: params.slug, topik: null, NOT: { topik_usulan: null } },
        select: { id: true, topik_usulan: true },
      })
      let n = 0
      for (const k of kandidat) {
        if (!k.topik_usulan || !sah.has(k.topik_usulan)) continue
        await db.conversation.update({ where: { id: k.id }, data: { topik: k.topik_usulan } })
        n++
      }
      return NextResponse.json({ success: true, disetujui: n })
    }

    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) return NextResponse.json({ success: false, error: 'id wajib diisi.' }, { status: 400 })

    // null = batalkan penetapan, kembalikan ke daftar yang perlu ditinjau.
    const topik = body.topik === null ? null : String(body.topik ?? '')
    if (topik !== null && !sah.has(topik)) {
      return NextResponse.json({ success: false, error: 'Topik tidak dikenal.' }, { status: 400 })
    }

    // Jangan percaya id dari klien — pastikan percakapannya milik tenant ini.
    const ada = await db.conversation.findFirst({
      where: { id, tenant_slug: params.slug }, select: { id: true },
    })
    if (!ada) return NextResponse.json({ success: false, error: 'Percakapan tidak ditemukan.' }, { status: 404 })

    await db.conversation.update({ where: { id }, data: { topik } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
