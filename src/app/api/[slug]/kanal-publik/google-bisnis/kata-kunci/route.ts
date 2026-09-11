/**
 * GET /api/[slug]/kanal-publik/google-bisnis/kata-kunci?lokasi=locations/123
 *
 * Istilah yang diketik orang di Google & Maps sampai menemukan listing RKZ.
 *
 * `lokasi` WAJIB diisi dan diperiksa terhadap daftar lokasi milik akun yang
 * tersambung — bukan diteruskan mentah ke Google. Tanpa pemeriksaan itu, nama
 * lokasi mana pun bisa dititipkan lewat URL, dan tenant ini akan membacakan data
 * profil bisnis milik orang lain yang kebetulan ada di akun yang sama.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { daftarLokasi, siapkanKlien } from '@/lib/google-ulasan'
import { ambilKataKunciGbp, BULAN_DEFAULT } from '@/lib/google-kata-kunci'

type Ctx = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewKanalPublik')
  if (error) return error

  const q      = req.nextUrl.searchParams
  const diminta = (q.get('lokasi') ?? '').trim()
  const bulan   = Math.min(18, Math.max(1, Number(q.get('bulan')) || BULAN_DEFAULT))

  try {
    const klien = await siapkanKlien(params.slug)
    if (!klien.ok) {
      return NextResponse.json({ success: false, error: klien.pesan }, { status: klien.status })
    }

    const lokasi = await daftarLokasi(klien.token, klien.accountId)
    if (!lokasi.length) {
      return NextResponse.json({ success: false, error: 'Tidak ada lokasi pada akun ini.' }, { status: 404 })
    }

    // Lokasi pertama dipakai bila tidak diminta — halaman bisa dibuka tanpa
    // memilih apa pun lebih dulu.
    const dipilih = diminta
      ? lokasi.find(l => l.nama === diminta)
      : lokasi[0]
    if (!dipilih) {
      return NextResponse.json(
        { success: false, error: 'Lokasi tidak dikenali pada akun ini.' }, { status: 403 })
    }

    const hasil = await ambilKataKunciGbp(klien.token, dipilih.nama, bulan)

    return NextResponse.json({
      success: !hasil.galat,
      error:   hasil.galat,
      lokasi:  { nama: dipilih.nama, judul: dipilih.judul },
      ...hasil,
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
