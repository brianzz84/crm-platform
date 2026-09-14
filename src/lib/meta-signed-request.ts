/**
 * Verifikasi `signed_request` dari Meta.
 *
 * Dipakai callback pembatalan otorisasi dan penghapusan data — dua endpoint yang
 * DIWAJIBKAN Meta sebelum aplikasi Threads bisa disimpan.
 *
 * ══ MENGAPA WAJIB DIVERIFIKASI, BUKAN SEKADAR DIBACA ══
 *
 * Kedua endpoint itu terbuka tanpa autentikasi — Meta memanggilnya dari luar,
 * jadi tidak ada sesi maupun token pembawa. Tanpa verifikasi tanda tangan, siapa
 * pun yang tahu alamatnya bisa mengirim `user_id` karangan dan memaksa CRM
 * menghapus token tenant mana pun.
 *
 * Tanda tangan dihitung dengan HMAC-SHA256 memakai App Secret, yang hanya
 * dimiliki Meta dan kita. Perbandingannya memakai `timingSafeEqual`: pembanding
 * biasa berhenti pada byte pertama yang berbeda, dan selisih waktunya cukup
 * untuk menebak tanda tangan byte demi byte.
 */

import { createHmac, timingSafeEqual } from 'crypto'

export interface IsiSignedRequest {
  user_id?: string
  algorithm?: string
  issued_at?: number
  [k: string]: unknown
}

/** base64url -> Buffer. Meta memakai varian URL-safe tanpa padding. */
function dariBase64Url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

export function periksaSignedRequest(
  signed: string, appSecret: string,
): { ok: true; isi: IsiSignedRequest } | { ok: false; pesan: string } {
  const [tandaB64, isiB64] = (signed ?? '').split('.')
  if (!tandaB64 || !isiB64) return { ok: false, pesan: 'Bentuk signed_request tidak dikenali.' }

  let isi: IsiSignedRequest
  try {
    isi = JSON.parse(dariBase64Url(isiB64).toString('utf8'))
  } catch {
    return { ok: false, pesan: 'Muatan signed_request bukan JSON.' }
  }

  // Meta menyatakan algoritmanya di dalam muatan. Diperiksa, bukan diabaikan:
  // muatan yang menyebut algoritma lain berarti bentuk yang belum kita pahami,
  // dan memvalidasinya dengan HMAC-SHA256 akan memberi rasa aman yang palsu.
  if (isi.algorithm && String(isi.algorithm).toUpperCase() !== 'HMAC-SHA256') {
    return { ok: false, pesan: `Algoritma tidak didukung: ${isi.algorithm}` }
  }

  const diharap = createHmac('sha256', appSecret).update(isiB64).digest()
  const diterima = dariBase64Url(tandaB64)

  // Panjang diperiksa lebih dulu — `timingSafeEqual` melempar bila berbeda.
  if (diterima.length !== diharap.length) {
    return { ok: false, pesan: 'Tanda tangan tidak cocok.' }
  }
  if (!timingSafeEqual(diterima, diharap)) {
    return { ok: false, pesan: 'Tanda tangan tidak cocok.' }
  }

  return { ok: true, isi }
}

/**
 * Ambil `signed_request` dari badan permintaan.
 *
 * Meta mengirimnya sebagai form-encoded, tetapi dokumentasinya tidak konsisten
 * antar produk dan sebagian mengirim JSON. Keduanya diterima — endpoint yang
 * menolak karena bentuk badan akan membuat Meta menandai callback kita rusak,
 * dan itu memblokir penyimpanan konfigurasi aplikasi.
 */
export async function ambilSignedRequest(req: Request): Promise<string> {
  const tipe = req.headers.get('content-type') ?? ''
  try {
    if (tipe.includes('application/json')) {
      const j = await req.json() as Record<string, unknown>
      return String(j.signed_request ?? '')
    }
    const f = await req.formData()
    return String(f.get('signed_request') ?? '')
  } catch {
    return ''
  }
}
