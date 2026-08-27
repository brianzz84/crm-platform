/**
 * GET /api/[slug]/kanal-publik/google-bisnis/lokasi
 *
 * Ringkasan seluruh profil bisnis: judul, rating, jumlah ulasan. Inilah baris
 * kartu di bagian atas tab Google Bisnis.
 *
 * Tidak menerima parameter apa pun — daftar lokasi ditentukan oleh akun Google
 * yang tersambung, bukan oleh URL. Menutup satu kelas kekeliruan sekaligus:
 * tidak ada lokasi milik tenant lain yang bisa diminta lewat query.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { daftarLokasi, ringkasSemuaLokasi, siapkanKlien } from '@/lib/google-ulasan'

type Ctx = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageBroadcast')
  if (error) return error

  try {
    const klien = await siapkanKlien(params.slug)
    if (!klien.ok) {
      return NextResponse.json({ success: false, error: klien.pesan }, { status: klien.status })
    }

    const lokasi = await daftarLokasi(klien.token, klien.accountId)
    if (lokasi.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    const data = await ringkasSemuaLokasi(klien.token, klien.accountId, lokasi)

    // Diurutkan dari yang paling banyak ulasannya: lokasi itu yang paling sering
    // dibuka, jadi ia yang terpilih lebih dulu saat halaman dibuka.
    data.sort((a, b) => b.jumlahUlasan - a.jumlahUlasan)

    return NextResponse.json({ success: true, data })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 },
    )
  }
}
