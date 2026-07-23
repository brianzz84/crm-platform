'use client'

import UltahCard from './UltahCard'

type Jenis = 'ULTAH' | 'HARI_RAYA' | 'KONTROL_REMINDER' | 'VAKSIN_REMINDER'

interface Props {
  slug:           string
  wappinAktif:    boolean
  metaAktif:      boolean
  initialConfigs: Record<Jenis, any>
  statsMap:       Record<string, Record<string, number>>
}

// Ketiga jenis sapaan memakai kartu berbasis template approved Meta yang sama
// (UltahCard tergeneralisasi lewat prop `jenis`). Kirim lewat template message —
// pesan proaktif di luar 24 jam wajib pakai template approved.
const JENIS: Jenis[] = ['ULTAH', 'HARI_RAYA', 'KONTROL_REMINDER', 'VAKSIN_REMINDER']

export default function SapaanClient({ slug, metaAktif, initialConfigs, statsMap }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      {JENIS.map(j => (
        <UltahCard
          key={j}
          slug={slug}
          jenis={j}
          metaAktif={metaAktif}
          initialConfig={initialConfigs[j]}
          stats={statsMap[j] ?? {}}
        />
      ))}
    </div>
  )
}
