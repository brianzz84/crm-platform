/**
 * Normalisasi nomor HP ke format lokal Indonesia (08xxxxxxxxx) — SATU sumber
 * kebenaran, dipakai semua jalur input: import Excel, webhook Meta/Wappin, dan sync
 * SIMRS. Sebelumnya logika ini terduplikasi (dan jalur SIMRS bahkan tidak
 * menormalisasi sama sekali), sehingga nomor bisa tersimpan dalam bentuk berbeda dan
 * gagal dicocokkan saat matching balasan chat.
 *
 * Tidak bisa dipastikan sumber memakai '62' atau '0' — jadi CRM yang menyeragamkan:
 * buang spasi & tanda baca, ubah +62/62 jadi 0.
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return ''
  const s = String(raw).replace(/\s+/g, '').replace(/[^0-9+]/g, '')
  if (s.startsWith('+62')) return '0' + s.slice(3)
  if (s.startsWith('62'))  return '0' + s.slice(2)
  return s
}

/** Seperti normalizePhone tapi mengembalikan null untuk input kosong — untuk kolom
 * opsional (mis. nomor HP alternatif) supaya tidak menyimpan string kosong. */
export function normalizePhoneOrNull(raw: string | null | undefined): string | null {
  const n = normalizePhone(raw)
  return n || null
}
