'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  slug: string
  personId: string
  punyaNoRm: boolean
  lastSyncIso: string | null
}

function labelTerakhir(iso: string | null): string {
  if (!iso) return 'Belum pernah disinkron dari SIMRS'
  const d = new Date(iso)
  return `Sinkron terakhir: ${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

export default function SegarkanSimrsButton({ slug, personId, punyaNoRm, lastSyncIso }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Pasien tanpa No. RM (mis. hanya dari kegiatan) tidak bisa disegarkan dari SIMRS.
  if (!punyaNoRm) return null

  async function segarkan() {
    setLoading(true); setError('')
    try {
      const res  = await fetch(`/api/${slug}/pasien/${personId}/segarkan-simrs`, { method: 'POST' })
      const json = await res.json()
      if (!json.success) { setError(json.error || 'Gagal menyegarkan'); return }
      router.refresh()   // muat ulang data pasien tanpa reload penuh
    } catch { setError('Gagal menghubungi server') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <button onClick={segarkan} disabled={loading} title={labelTerakhir(lastSyncIso)}
        style={{
          padding: '9px 14px', borderRadius: 'var(--r-md)',
          border: '1.5px solid var(--c-border)', background: 'white',
          color: loading ? 'var(--c-text-faint)' : 'var(--c-text)',
          fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
          textAlign: 'center', whiteSpace: 'nowrap', fontFamily: 'inherit',
        }}>
        {loading ? '⏳ Menyegarkan…' : '🔄 Segarkan dari SIMRS'}
      </button>
      {error && <div style={{ fontSize: 11, color: '#C0392B' }}>{error}</div>}
    </div>
  )
}
