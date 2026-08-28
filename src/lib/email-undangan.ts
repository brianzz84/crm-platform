/**
 * Pengiriman email undangan akses.
 *
 * Dipindah keluar dari route pembuatan pengguna supaya route "kirim ulang
 * undangan" bisa memakainya juga. Sebelumnya fungsi ini terkurung di dalam
 * `users/route.ts`, dan akibatnya tombol kirim ulang hanya membuat token baru
 * tanpa mengirim apa pun — undangan lama jadi tidak berlaku, sementara yang baru
 * tidak pernah sampai ke siapa pun.
 */

export interface HasilKirimUndangan {
  sent:  boolean
  error?: string
}

/**
 * Alamat pengirim.
 *
 * `RESEND_FROM` boleh kosong; cadangannya memakai domain yang sudah terverifikasi
 * di akun Resend. Domain yang BELUM terverifikasi akan ditolak Resend untuk
 * penerima di luar pemilik akun — gejalanya persis seperti email hilang, jadi
 * periksa itu lebih dulu sebelum menuduh kotak masuk penerima.
 */
function alamatPengirim(brandName: string): string {
  return process.env.RESEND_FROM || `${brandName} <noreply@meditech.my.id>`
}

export async function kirimEmailUndangan(
  to: string,
  name: string,
  invitedBy: string,
  brandName: string,
  inviteUrl: string,
): Promise<HasilKirimUndangan> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[undangan] RESEND_API_KEY tidak ada — email tidak dikirim, pakai inviteUrl')
    return { sent: false, error: 'RESEND_API_KEY belum dikonfigurasi' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    alamatPengirim(brandName),
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
      // Isinya dicatat utuh: pesan penolakan Resend menyebut sebabnya (domain
      // belum terverifikasi, alamat tidak sah, kuota habis), dan tanpa itu
      // kegagalan kirim tidak bisa dibedakan satu sama lain dari luar.
      console.error('[undangan] Resend menolak:', JSON.stringify(j))
      return { sent: false, error: msg }
    }
    return { sent: true }
  } catch (e) {
    console.error('[undangan] Gagal kirim email:', e)
    return { sent: false, error: e instanceof Error ? e.message : 'network error' }
  }
}
