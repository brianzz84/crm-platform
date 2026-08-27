/**
 * GET  /api/[slug]/kanal-publik/google-bisnis/ulasan?lokasi=locations/123
 *        [&urutan=terbaru|terburuk|terbaik][&token=<pageToken>]
 * POST /api/[slug]/kanal-publik/google-bisnis/ulasan
 *        { lokasi, reviewId, teks }   → kirim balasan
 *
 * Membaca memakai izin yang sama dengan seluruh Kanal Publik (`manageBroadcast`),
 * tetapi MEMBALAS memakai `balasUlasan` yang lebih sempit — balasan tayang publik
 * di Maps dan Search atas nama rumah sakit.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import {
  MAKS_PANJANG_BALASAN, ambilUlasan, hapusBalasan, kirimBalasan, siapkanKlien,
  type UrutanUlasan,
} from '@/lib/google-ulasan'

type Ctx = { params: { slug: string } }

/**
 * Nama lokasi datang dari URL dan disambung menjadi path ke API Google. Tanpa
 * penyaringan ini, nilai seperti "locations/../../x" akan ikut terbentuk menjadi
 * URL yang berbeda dari yang dimaksud.
 */
const POLA_LOKASI = /^locations\/\d+$/
const POLA_REVIEW = /^[A-Za-z0-9_-]{1,255}$/

const URUTAN: readonly UrutanUlasan[] = ['terbaru', 'terburuk', 'terbaik']

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageBroadcast')
  if (error) return error

  const q      = req.nextUrl.searchParams
  const lokasi = q.get('lokasi') ?? ''
  if (!POLA_LOKASI.test(lokasi)) {
    return NextResponse.json({ success: false, error: 'Parameter lokasi tidak sah.' }, { status: 400 })
  }

  const minta  = q.get('urutan') ?? ''
  const urutan: UrutanUlasan = (URUTAN as readonly string[]).includes(minta)
    ? minta as UrutanUlasan
    : 'terbaru'

  try {
    const klien = await siapkanKlien(params.slug)
    if (!klien.ok) {
      return NextResponse.json({ success: false, error: klien.pesan }, { status: klien.status })
    }

    const hasil = await ambilUlasan(klien.token, klien.accountId, lokasi, {
      urutan,
      tokenHalaman: q.get('token') ?? undefined,
    })
    if (!hasil.ok) {
      return NextResponse.json({ success: false, error: hasil.pesan }, { status: hasil.status })
    }

    return NextResponse.json({ success: true, lokasi, urutan, ...hasil.data })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { session, error } = await requireTenantPermission(req, params.slug, 'balasUlasan')
  if (error) return error

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Body bukan JSON.' }, { status: 400 })
  }

  const lokasi   = String(body?.lokasi ?? '')
  const reviewId = String(body?.reviewId ?? '')
  const teks     = String(body?.teks ?? '')

  if (!POLA_LOKASI.test(lokasi)) {
    return NextResponse.json({ success: false, error: 'Parameter lokasi tidak sah.' }, { status: 400 })
  }
  if (!POLA_REVIEW.test(reviewId)) {
    return NextResponse.json({ success: false, error: 'reviewId tidak sah.' }, { status: 400 })
  }
  if (!teks.trim()) {
    return NextResponse.json({ success: false, error: 'Balasan tidak boleh kosong.' }, { status: 400 })
  }
  if (teks.trim().length > MAKS_PANJANG_BALASAN) {
    return NextResponse.json(
      { success: false, error: `Balasan melebihi ${MAKS_PANJANG_BALASAN} karakter.` },
      { status: 400 },
    )
  }

  try {
    const klien = await siapkanKlien(params.slug)
    if (!klien.ok) {
      return NextResponse.json({ success: false, error: klien.pesan }, { status: klien.status })
    }

    const hasil = await kirimBalasan(klien.token, klien.accountId, lokasi, reviewId, teks)
    if (!hasil.ok) {
      return NextResponse.json({ success: false, error: hasil.pesan }, { status: hasil.status })
    }

    // Dicatat karena balasan ini publik dan menimpa balasan sebelumnya tanpa
    // menyisakan riwayat di sisi Google — kalau ada pertanyaan "siapa yang
    // mengubah balasan itu", jawabannya hanya ada di log kita sendiri.
    console.info(
      `[ulasan] balasan terkirim tenant=${params.slug} lokasi=${lokasi} review=${reviewId} oleh=${session?.userId ?? '-'}`,
    )

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/[slug]/kanal-publik/google-bisnis/ulasan?lokasi=…&reviewId=…
 *
 * Menarik balasan yang sudah tayang. Memakai izin yang sama dengan mengirim:
 * menghapus balasan sama-sama mengubah apa yang dilihat publik.
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { session, error } = await requireTenantPermission(req, params.slug, 'balasUlasan')
  if (error) return error

  const q        = req.nextUrl.searchParams
  const lokasi   = q.get('lokasi') ?? ''
  const reviewId = q.get('reviewId') ?? ''

  if (!POLA_LOKASI.test(lokasi)) {
    return NextResponse.json({ success: false, error: 'Parameter lokasi tidak sah.' }, { status: 400 })
  }
  if (!POLA_REVIEW.test(reviewId)) {
    return NextResponse.json({ success: false, error: 'reviewId tidak sah.' }, { status: 400 })
  }

  try {
    const klien = await siapkanKlien(params.slug)
    if (!klien.ok) {
      return NextResponse.json({ success: false, error: klien.pesan }, { status: klien.status })
    }

    const hasil = await hapusBalasan(klien.token, klien.accountId, lokasi, reviewId)
    if (!hasil.ok) {
      return NextResponse.json({ success: false, error: hasil.pesan }, { status: hasil.status })
    }

    console.info(
      `[ulasan] balasan dihapus tenant=${params.slug} lokasi=${lokasi} review=${reviewId} oleh=${session?.userId ?? '-'}`,
    )

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 },
    )
  }
}
