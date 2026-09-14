/**
 * POST /api/threads/deauthorize
 *
 * Dipanggil Meta ketika pengguna MENCABUT otorisasi aplikasi dari sisi Threads.
 *
 * Diwajibkan Meta sebelum konfigurasi aplikasi Threads bisa disimpan — tetapi
 * nilainya bukan sekadar memenuhi formulir. Tanpa ini, token yang sudah dicabut
 * tetap tersimpan di basis data, dan pita cakupan Sebutan Publik akan
 * menampilkan sumber yang tampak sehat padahal sudah mati. Kebutaan persis itu
 * yang dibangun untuk dicegah.
 *
 * Terbuka tanpa autentikasi — Meta memanggilnya dari luar. Karena itu tanda
 * tangannya WAJIB diverifikasi; lihat catatan pada `periksaSignedRequest`.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getMasterDb } from '@/lib/tenant'
import { periksaSignedRequest, ambilSignedRequest } from '@/lib/meta-signed-request'

export async function POST(req: NextRequest) {
  const secret = process.env.THREADS_APP_SECRET
  if (!secret) {
    // 200, bukan 500: Meta menandai callback yang membalas galat sebagai rusak
    // dan itu memblokir penyimpanan konfigurasi. Kegagalan konfigurasi kita
    // tidak boleh terbaca sebagai endpoint yang tidak berfungsi.
    return NextResponse.json({ ok: false, pesan: 'THREADS_APP_SECRET belum diset.' })
  }

  const signed = await ambilSignedRequest(req)
  const hasil  = periksaSignedRequest(signed, secret)
  if (!hasil.ok) {
    return NextResponse.json({ ok: false, pesan: hasil.pesan }, { status: 400 })
  }

  const userId = String(hasil.isi.user_id ?? '')
  if (!userId) return NextResponse.json({ ok: false, pesan: 'user_id tidak ada.' }, { status: 400 })

  // Tenant dicari LEWAT user_id, bukan lewat slug: Meta tidak tahu apa pun
  // tentang tenant kita, dan satu-satunya pegangan yang dikirimnya adalah id
  // pengguna Threads.
  try {
    const db = await getMasterDb()
    const cfg = await db.metaConfig.findFirst({
      where: { threads_user_id: userId }, select: { tenant_slug: true },
    })
    if (cfg) {
      await db.metaConfig.updateMany({
        where: { threads_user_id: userId },
        data: {
          threads_token:      null,
          threads_expires_at: null,
          // `threads_user_id` dan `threads_username` SENGAJA dibiarkan: keduanya
          // bukan rahasia, dan menyisakannya membuat layar bisa berkata "pernah
          // tersambung sebagai @x, lalu dicabut" alih-alih diam seolah tidak
          // pernah ada apa-apa.
        },
      })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { ok: false, pesan: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
