import { KELOMPOK_WARNA_DEFAULT } from '@/constants'

/**
 * Badge kelompok unit kunjungan (mis. "Rawat Jalan", "Pondok Sehat").
 *
 * Nilainya teks bebas dari SimrsUnitLibrary.kelompok — beda tiap RS. Karena itu
 * komponen ini TIDAK boleh memaksa daftar tetap: nilai yang tak dikenal tetap
 * tampil apa adanya dengan warna netral, bukan kosong.
 *
 * `warna` opsional — kirim kalau pemanggil sudah punya warna dari library.
 */
export default function UnitBadge({ unit, warna }: { unit: string; warna?: string | null }) {
  const preset = KELOMPOK_WARNA_DEFAULT[unit]
  const color  = warna ?? preset?.color ?? '#6B7B8D'
  const bg     = preset?.bg ?? (warna ? `${warna}18` : '#F1F3F6')

  return (
    <span style={{
      padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 700,
      color, background: bg,
      whiteSpace: 'nowrap',
    }}>
      {unit}
    </span>
  )
}
