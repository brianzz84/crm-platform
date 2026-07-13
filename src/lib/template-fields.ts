/**
 * Field data pasien yang boleh dipakai sebagai variabel dinamis di template broadcast.
 * Dipakai di builder template (dropdown), wizard campaign (preview), dan resolver saat kirim.
 */
export interface TemplateField {
  key:   string
  label: string
}

export const TEMPLATE_FIELDS: TemplateField[] = [
  // Identitas dasar
  { key: 'nama',                       label: 'Nama Pasien' },
  { key: 'no_rm',                      label: 'No. RM' },
  { key: 'no_hp',                      label: 'No. HP' },
  // Data SIMRS / klinis
  { key: 'agama',                      label: 'Agama' },
  { key: 'jenis_pembayaran',           label: 'Jenis Pembayaran' },
  { key: 'nama_instansi',              label: 'Penjamin' },
  { key: 'no_bpjs',                    label: 'No. BPJS' },
  { key: 'poli_terakhir',              label: 'Poli Terakhir' },
  { key: 'dokter_terakhir',            label: 'Dokter Terakhir' },
  { key: 'diagnosa_terakhir',          label: 'Diagnosa Terakhir' },
  { key: 'tanggal_kunjungan_terakhir', label: 'Tgl Kunjungan Terakhir' },
]

export const TEMPLATE_FIELD_LABELS: Record<string, string> =
  Object.fromEntries(TEMPLATE_FIELDS.map(f => [f.key, f.label]))

/** Data pasien minimal yang dibutuhkan resolver (person + kunjungan terakhir). */
export interface PersonForTemplate {
  name?:             string | null
  no_rm?:            string | null
  no_hp?:            string | null
  agama?:            string | null
  jenis_pembayaran?: string | null
  nama_instansi?:    string | null
  no_bpjs?:          string | null
  lastVisit?: {
    poli?:          string | null
    dokter?:        string | null
    diagnosa_nama?: string | null
    tanggal?:       Date | string | null
  } | null
}

function fmtTanggal(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Ambil nilai satu field DB untuk seorang pasien. Kembalikan '' jika kosong. */
export function resolveTemplateField(p: PersonForTemplate, key: string): string {
  switch (key) {
    case 'nama':             return p.name ?? ''
    case 'no_rm':            return p.no_rm ?? ''
    case 'no_hp':            return p.no_hp ?? ''
    case 'agama':            return p.agama ?? ''
    case 'jenis_pembayaran': return p.jenis_pembayaran === 'TUNAI' ? 'Tunai' : p.jenis_pembayaran === 'NON_TUNAI' ? 'Non-Tunai' : ''
    case 'nama_instansi':    return p.nama_instansi ?? ''
    case 'no_bpjs':          return p.no_bpjs ?? ''
    case 'poli_terakhir':    return p.lastVisit?.poli ?? ''
    case 'dokter_terakhir':  return p.lastVisit?.dokter ?? ''
    case 'diagnosa_terakhir':return p.lastVisit?.diagnosa_nama ?? ''
    case 'tanggal_kunjungan_terakhir': return fmtTanggal(p.lastVisit?.tanggal)
    default:                 return ''
  }
}
