/**
 * POST /api/threads/hapus-data
 *
 * Dipanggil Meta ketika pengguna meminta DATANYA DIHAPUS. Diwajibkan sebelum
 * konfigurasi aplikasi Threads bisa disimpan.
 *
 * Meta menuntut balasan berbentuk `{ url, confirmation_code }` — `url` adalah
 * halaman tempat pengguna memeriksa status permintaannya.
 *
 * ══ APA YANG SEBENARNYA DIHAPUS ══
 *
 * Seluruh data Threads yang disimpan CRM saat ini hanyalah token akses, id, dan
 * nama akun pada baris konfigurasi tenant. Belum ada satu pun unggahan Threads
 * yang ditarik — kolektornya belum dibangun. Jadi penghapusannya tuntas dan
 * seketika, dan halaman statusnya bisa mengatakan itu apa adanya tanpa
 * menjanjikan proses yang sebenarnya tidak ada.
 *
 * Bila kelak kolektor Threads dibangun, berkas ini WAJIB ikut menghapus baris
 * `Sebutan` bersumber THREADS milik pengguna tersebut.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getMasterDb } from '@/lib/tenant'
import { periksaSignedRequest, ambilSignedRequest } from '@/lib/meta-signed-request'
import { alamatAplikasi } from '@/lib/google-oauth'

export async function POST(req: NextRequest) {
  const secret = process.env.THREADS_APP_SECRET
  if (!secret) {
    return NextResponse.json({ ok: false, pesan: 'THREADS_APP_SECRET belum diset.' })
  }

  const signed = await ambilSignedRequest(req)
  const hasil  = periksaSignedRequest(signed, secret)
  if (!hasil.ok) {
    return NextResponse.json({ ok: false, pesan: hasil.pesan }, { status: 400 })
  }

  const userId = String(hasil.isi.user_id ?? '')
  if (!userId) return NextResponse.json({ ok: false, pesan: 'user_id tidak ada.' }, { status: 400 })

  try {
    const db = await getMasterDb()
    await db.metaConfig.updateMany({
      where: { threads_user_id: userId },
      data: {
        threads_token:        null,
        threads_user_id:      null,
        threads_username:     null,
        threads_expires_at:   null,
        threads_refreshed_at: null,
      },
    })
  } catch {
    // Kegagalan basis data tidak dilaporkan ke Meta sebagai galat: balasan yang
    // bukan {url, confirmation_code} membuat Meta menandai callback rusak.
    // Kegagalannya tetap terlihat di log server.
  }

  // Kode konfirmasi turunan dari user_id + tanggal. Tidak perlu tabel: bagi
  // pengguna ia sekadar nomor rujukan, dan penghapusannya sendiri sudah tuntas
  // saat balasan ini dikirim — tidak ada antrean yang perlu ditelusuri.
  const kode = createHash('sha256')
    .update(`${userId}:${new Date().toISOString().slice(0, 10)}:${secret}`)
    .digest('hex').slice(0, 16)

  return NextResponse.json({
    url: `${alamatAplikasi()}/hapus-data/threads?kode=${kode}`,
    confirmation_code: kode,
  })
}
