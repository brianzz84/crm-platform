'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RefreshSegmenBtn({
  slug,
  segmenId,
}: {
  slug: string
  segmenId: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleRefresh() {
    setLoading(true)
    setMsg('')
    try {
      const res  = await fetch(`/api/${slug}/segmen/${segmenId}/refresh`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { setMsg(json.error || 'Gagal refresh'); return }
      setMsg(`✓ ${json.total} anggota`)
      router.refresh()
      setTimeout(() => setMsg(''), 3000)
    } catch {
      setMsg('Gagal terhubung')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={handleRefresh}
        disabled={loading}
        title="Jalankan ulang filter untuk perbarui anggota segmen"
        style={{
          padding: '9px 18px', borderRadius: 'var(--r-md)',
          background: 'transparent', border: '1.5px solid var(--c-secondary)',
          color: 'var(--c-secondary)', fontWeight: 600,
          fontSize: 'var(--font-size-sm)', cursor: loading ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {loading ? '⏳ Menyegarkan...' : '🔄 Refresh Anggota'}
      </button>
      {msg && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)' }}>{msg}</span>}
    </div>
  )
}
