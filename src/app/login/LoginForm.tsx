'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  // Ekstrak slug dari ?from=/rkz/... jika ada
  const fromPath      = searchParams.get('from') || ''
  const slugFromUrl   = fromPath.split('/').filter(Boolean)[0] || ''
  const tenantFromUrl = slugFromUrl.toLowerCase()

  const [tenantSlug, setTenantSlug] = useState(tenantFromUrl)
  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password, tenantSlug: tenantSlug.trim().toLowerCase() }),
      })
      const json = await res.json()

      if (!res.ok) {
        setError(json.error || 'Email atau password salah')
        return
      }

      const from = searchParams.get('from') || `/${json.tenantSlug}/dashboard`
      router.push(from)
    } catch {
      setError('Terjadi kesalahan. Coba lagi.')
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
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div style={{
          background: '#FEF2F2', color: '#B91C1C',
          borderRadius: 'var(--r-sm)',
          padding: 'var(--sp-3) var(--sp-4)',
          fontSize: 'var(--font-size-sm)',
          marginBottom: 'var(--sp-4)',
          borderLeft: '3px solid #EF4444',
        }}>
          {error}
        </div>
      )}

      {tenantFromUrl ? (
        // Slug sudah diketahui dari URL — tampilkan badge, sembunyikan field
        <div style={{ marginBottom: 'var(--sp-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-faint)' }}>Masuk sebagai tenant</span>
          <span style={{
            background: 'var(--c-secondary)', color: 'white',
            borderRadius: 'var(--r-sm)', padding: '2px 10px',
            fontSize: 'var(--font-size-sm)', fontWeight: 700, letterSpacing: 1,
            textTransform: 'uppercase',
          }}>
            {tenantFromUrl}
          </span>
        </div>
      ) : (
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--c-text)', marginBottom: 'var(--sp-2)' }}>
            Kode Tenant
          </label>
          <input
            type="text"
            value={tenantSlug}
            onChange={e => setTenantSlug(e.target.value)}
            required
            autoComplete="organization"
            placeholder="contoh: rkz"
            style={inputStyle}
          />
          <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 4 }}>
            Kode unik organisasi Anda (dari administrator)
          </div>
        </div>
      )}

      <div style={{ marginBottom: 'var(--sp-4)' }}>
        <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--c-text)', marginBottom: 'var(--sp-2)' }}>
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="nama@organisasi.com"
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 'var(--sp-5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-2)' }}>
          <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--c-text)' }}>
            Password
          </label>
          <a href="/forgot-password" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-secondary)', textDecoration: 'none' }}>
            Lupa password?
          </a>
        </div>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          placeholder="••••••••"
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
        {loading ? 'Memproses...' : 'Masuk'}
      </button>
    </form>
  )
}
