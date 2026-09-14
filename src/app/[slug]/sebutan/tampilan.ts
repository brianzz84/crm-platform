/**
 * Nama, warna, dan pemformat yang dipakai bersama layar Peninjauan dan Ringkasan.
 *
 * Dipisahkan bukan demi kerapian melainkan demi kebenaran: bila NEGATIF merah di
 * satu tab dan oranye di tab sebelahnya, orang akan menyimpulkan keduanya
 * menghitung hal yang berbeda. Warna di sini adalah bagian dari maknanya.
 */

export const NAMA_SUMBER: Record<string, string> = {
  IG_TAG: 'Instagram', FB_TAG: 'Facebook', FB_RATING: 'Rekomendasi FB',
  YOUTUBE: 'YouTube', GOOGLE_ULASAN: 'Ulasan Google',
  KOMENTAR_IG: 'Komentar IG', KOMENTAR_FB: 'Komentar FB',
}

export const WARNA_SUMBER: Record<string, string> = {
  IG_TAG: '#E1306C', FB_TAG: '#1877F2', FB_RATING: '#1877F2',
  YOUTUBE: '#FF0000', GOOGLE_ULASAN: '#0F9D58',
  KOMENTAR_IG: '#E1306C', KOMENTAR_FB: '#1877F2',
}

export const WARNA_SENTIMEN: Record<string, string> = {
  POSITIF: '#16A34A', NETRAL: '#64748B', NEGATIF: '#DC2626',
}

export const WARNA_RISIKO: Record<string, string> = {
  RENDAH: '#16A34A', SEDANG: '#D97706', TINGGI: '#DC2626',
}

export const angka = (n: number) => Math.round(n).toLocaleString('id-ID')

export const tanggal = (iso: string | Date) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

export const kartu: React.CSSProperties = {
  background: 'white', border: '1px solid var(--c-border)',
  borderRadius: 'var(--r-lg)', padding: 'var(--sp-5)', marginBottom: 'var(--sp-4)',
}

/**
 * Tingkat keandalan laporan menurut cakupan peninjauan.
 *
 * Ditaruh di sini, bukan di satu tab, karena Ringkasan dan Jaringan sama-sama
 * memakainya. Dua ambang yang berbeda untuk hal yang sama akan membuat satu tab
 * menyebut data "cukup" sementara tab sebelahnya menyebutnya "kurang" — dan
 * pembacanya tidak punya cara tahu mana yang benar.
 *
 * Menggantikan ambang biner 60%. Kelemahan versi biner bukan angkanya,
 * melainkan bahwa ia MENUMPAHKAN KEADAAN TENGAH: 55% dan 5% sama-sama jatuh ke
 * satu ember "belum layak", padahal yang pertama sudah cukup untuk melihat arah
 * dan yang kedua tidak berarti apa-apa.
 *
 * Ambang dan penamaannya mengikuti pedoman konsultan (12 Sep 2026). Istilahnya
 * diterjemahkan karena yang membacanya direksi, bukan analis.
 */
export const TINGKAT = [
  { min: 80, kunci: 'andal', nama: 'Andal',
    warna: 'var(--c-success)', latar: '#F0FDF4', garis: '#BBF7D0',
    arti: 'Sebagian besar sebutan sudah ditinjau. Angka di bawah bisa dipakai '
        + 'sebagai dasar keputusan.' },
  { min: 50, kunci: 'indikatif', nama: 'Indikatif',
    warna: '#B45309', latar: '#FFFBEB', garis: '#FDE68A',
    arti: 'Cukup untuk melihat ARAH, belum cukup untuk menyebut jumlah. '
        + 'Perbandingan antar kategori masih bisa dipercaya; angka mutlaknya belum.' },
  { min: 0, kunci: 'kurang', nama: 'Belum Memadai',
    warna: '#B91C1C', latar: '#FEF2F2', garis: '#FECACA',
    arti: 'Terlalu sedikit yang ditinjau. Angka di bawah adalah batas bawah yang '
        + 'jauh dari jumlah sebenarnya — jangan dikutip ke luar.' },
] as const

export const tingkatDari = (persen: number) =>
  TINGKAT.find(t => persen >= t.min) ?? TINGKAT[TINGKAT.length - 1]
