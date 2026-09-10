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
