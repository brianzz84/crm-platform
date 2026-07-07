'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'

type Stage = 'form' | 'sent'

export default function ForgotPasswordForm() {
  const searchParams = useSearchParams()
  const [stage,      setStage]      = useState<Stage>('form')
  const [tenantSlug, setTenantSlug] = useState(searchParams.get('tenant') || '')
  const [email,      setEmail]      = useState('')
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tenantSlug: tenantSlug.trim().toLowerCase(), email: email.trim() }),
      })

      if (!res.ok) {
        const json = await res.json()
        setError(json.error || 'Terjadi kesalahan.')
        return
      }

      setStage('sent')
    } catch {
      setError('Tidak dapat terhubung ke server. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    display: 'block', width: '100%',
    padding: '10px var(--sp-3)',
    fontFamily: 'inherit', fontSize: 'var(--font-size-base)',
    border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-md)',
    outline: 'none', color: 'var(--c-text)', background: 'white',
    boxSizing: 'border-box',
  }

  if (stage === 'sent') {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 'var(--sp-4)' }}>📧</div>
        <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--c-text)', marginBottom: 'var(--sp-3)' }}>
          Cek email Anda
        </h2>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', lineHeight: 1.6, marginBottom: 'var(--sp-6)' }}>
          Jika akun dengan email <strong>{email}</strong> ditemukan, link reset password telah dikirim.
          Periksa folder Spam jika tidak muncul dalam beberapa menit.
        </p>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-faint)' }}>
          Link berlaku selama <strong>1 jam</strong>.
        </p>
        <button
          onClick={() => { setStage('form'); setError('') }}
          style={{
            marginTop: 'var(--sp-6)',
            background: 'none', border: '1.5px solid var(--c-border)',
            borderRadius: 'var(--r-md)', padding: '8px var(--sp-5)',
            fontFamily: 'inherit', fontSize: 'var(--font-size-sm)',
            color: 'var(--c-text-muted)', cursor: 'pointer',
          }}
        >
          Kirim ulang
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div style={{
          background: '#FEF2F2', color: '#B91C1C',
          borderRadius: 'var(--r-sm)', padding: 'var(--sp-3) var(--sp-4)',
          fontSize: 'var(--font-size-sm)', marginBottom: 'var(--sp-4)',
          borderLeft: '3px solid #EF4444',
        }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 'var(--sp-4)' }}>
        <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--sp-2)', color: 'var(--c-text)' }}>
          Kode Tenant
        </label>
        <input
          type="text"
          value={tenantSlug}
          onChange={e => setTenantSlug(e.target.value)}
          required
          placeholder="contoh: rkz"
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--sp-2)', color: 'var(--c-text)' }}>
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          placeholder="nama@organisasi.com"
          style={inputStyle}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        style={{
          display: 'block', width: '100%',
          padding: '12px var(--sp-5)',
          background: loading ? '#94A3B8' : 'var(--c-secondary)',
          color: 'white', border: 'none',
          borderRadius: 'var(--r-md)',
          fontFamily: 'inherit', fontSize: 'var(--font-size-base)', fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Mengirim...' : 'Kirim Link Reset'}
      </button>
    </form>
  )
}
