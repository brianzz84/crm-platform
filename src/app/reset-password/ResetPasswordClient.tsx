'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

type Stage = 'loading' | 'form' | 'done' | 'invalid' | 'expired'

export default function ResetPasswordClient() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const token        = searchParams.get('token') || ''

  const [stage,    setStage]    = useState<Stage>('loading')
  const [userInfo, setUserInfo] = useState<{ name: string; email: string } | null>(null)
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    if (!token) { setStage('invalid'); return }

    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(json => {
        if (!json.success) { setStage('invalid'); return }
        if (json.data.expired) { setStage('expired'); return }
        setUserInfo({ name: json.data.name, email: json.data.email })
        setStage('form')
      })
      .catch(() => setStage('invalid'))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) { setError('Password minimal 8 karakter.'); return }
    if (password !== confirm) { setError('Konfirmasi password tidak cocok.'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, password }),
      })
      const json = await res.json()

      if (!res.ok) {
        setError(json.error || 'Gagal reset password.')
        if (res.status === 410) setStage('expired')
        return
      }

      setStage('done')
    } catch {
      setError('Tidak dapat terhubung ke server.')
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

  if (stage === 'loading') {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--sp-8) 0', color: 'var(--c-text-muted)' }}>
        Memverifikasi link...
      </div>
    )
  }

  if (stage === 'invalid') {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 'var(--sp-4)' }}>❌</div>
        <h2 style={{ fontWeight: 700, color: 'var(--c-text)', marginBottom: 'var(--sp-3)' }}>Link Tidak Valid</h2>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', marginBottom: 'var(--sp-6)' }}>
          Link reset password tidak ditemukan atau sudah digunakan.
        </p>
        <a href="/forgot-password" style={{
          display: 'inline-block', padding: '10px var(--sp-5)',
          background: 'var(--c-secondary)', color: 'white',
          borderRadius: 'var(--r-md)', textDecoration: 'none', fontWeight: 600,
          fontSize: 'var(--font-size-sm)',
        }}>
          Minta Link Baru
        </a>
      </div>
    )
  }

  if (stage === 'expired') {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 'var(--sp-4)' }}>⏰</div>
        <h2 style={{ fontWeight: 700, color: 'var(--c-text)', marginBottom: 'var(--sp-3)' }}>Link Kadaluarsa</h2>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', marginBottom: 'var(--sp-6)' }}>
          Link reset password hanya berlaku <strong>1 jam</strong>. Silakan minta link baru.
        </p>
        <a href="/forgot-password" style={{
          display: 'inline-block', padding: '10px var(--sp-5)',
          background: 'var(--c-secondary)', color: 'white',
          borderRadius: 'var(--r-md)', textDecoration: 'none', fontWeight: 600,
          fontSize: 'var(--font-size-sm)',
        }}>
          Minta Link Baru
        </a>
      </div>
    )
  }

  if (stage === 'done') {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 'var(--sp-4)' }}>✅</div>
        <h2 style={{ fontWeight: 700, color: 'var(--c-text)', marginBottom: 'var(--sp-3)' }}>Password Berhasil Diperbarui</h2>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', marginBottom: 'var(--sp-6)' }}>
          Password Anda telah diperbarui. Silakan masuk dengan password baru.
        </p>
        <a href="/login" style={{
          display: 'inline-block', padding: '12px var(--sp-6)',
          background: 'var(--c-secondary)', color: 'white',
          borderRadius: 'var(--r-md)', textDecoration: 'none', fontWeight: 600,
        }}>
          Masuk Sekarang
        </a>
      </div>
    )
  }

  // stage === 'form'
  return (
    <form onSubmit={handleSubmit}>
      {userInfo && (
        <div style={{
          background: '#EFF6FF', borderRadius: 'var(--r-sm)', padding: 'var(--sp-3) var(--sp-4)',
          fontSize: 'var(--font-size-sm)', marginBottom: 'var(--sp-5)',
          borderLeft: '3px solid #3B82F6',
        }}>
          Reset password untuk <strong>{userInfo.name}</strong> ({userInfo.email})
        </div>
      )}

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
          Password Baru
        </label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={8}
          placeholder="Minimal 8 karakter"
          autoFocus
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--sp-2)', color: 'var(--c-text)' }}>
          Konfirmasi Password
        </label>
        <input
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          required
          placeholder="Ketik ulang password baru"
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
        {loading ? 'Menyimpan...' : 'Simpan Password Baru'}
      </button>
    </form>
  )
}
