'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function HapusSegmenBtn({
  slug,
  segmenId,
  nama,
}: {
  slug: string
  segmenId: string
  nama: string
}) {
  const router  = useRouter()
  const [phase, setPhase] = useState<'idle' | 'confirm' | 'loading'>('idle')
  const [error, setError] = useState('')

  async function handleDelete() {
    setPhase('loading')
    setError('')
    try {
      const res = await fetch(`/api/${slug}/segmen/${segmenId}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json()
        setError(json.error || 'Gagal menghapus.')
        setPhase('confirm')
        return
      }
      router.push(`/${slug}/segmen`)
      router.refresh()
    } catch {
      setError('Tidak dapat terhubung ke server.')
      setPhase('confirm')
    }
  }

  if (phase === 'idle') {
    return (
      <button
        onClick={() => setPhase('confirm')}
        style={{
          padding: '9px 18px', borderRadius: 'var(--r-md)',
          background: 'transparent', border: '1.5px solid #EF4444',
          color: '#EF4444', fontWeight: 600,
          fontSize: 'var(--font-size-sm)', cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Hapus Segmen
      </button>
    )
  }

  if (phase === 'confirm') {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}>
        <div style={{
          background: 'white', borderRadius: 'var(--r-xl)',
          padding: 'var(--sp-8)', maxWidth: 400, width: '90%',
          boxShadow: 'var(--shadow-xl)',
        }}>
          <div style={{ fontWeight: 800, fontSize: 'var(--font-size-lg)', color: 'var(--c-primary)', marginBottom: 'var(--sp-3)' }}>
            Hapus Segmen?
          </div>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', lineHeight: 1.6, marginBottom: 'var(--sp-5)' }}>
            Segmen <strong>"{nama}"</strong> akan dihapus permanen beserta seluruh data keanggotaannya.
            Campaign yang sudah dibuat menggunakan segmen ini tidak akan terpengaruh.
          </p>
          {error && (
            <div style={{ background: '#FEF2F2', color: '#B91C1C', borderRadius: 'var(--r-sm)', padding: 'var(--sp-3)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--sp-4)', borderLeft: '3px solid #EF4444' }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setPhase('idle'); setError('') }}
              style={{
                padding: '9px 20px', borderRadius: 'var(--r-md)',
                background: 'transparent', border: '1.5px solid var(--c-border)',
                color: 'var(--c-text-muted)', fontWeight: 600,
                fontSize: 'var(--font-size-sm)', cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Batal
            </button>
            <button
              onClick={handleDelete}
              style={{
                padding: '9px 20px', borderRadius: 'var(--r-md)',
                background: '#EF4444', border: 'none',
                color: 'white', fontWeight: 600,
                fontSize: 'var(--font-size-sm)', cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Ya, Hapus
            </button>
          </div>
        </div>
      </div>
    )
  }

  // phase === 'loading'
  return (
    <button
      disabled
      style={{
        padding: '9px 18px', borderRadius: 'var(--r-md)',
        background: '#FEE2E2', border: 'none',
        color: '#EF4444', fontWeight: 600,
        fontSize: 'var(--font-size-sm)', cursor: 'not-allowed',
        fontFamily: 'inherit',
      }}
    >
      Menghapus...
    </button>
  )
}
