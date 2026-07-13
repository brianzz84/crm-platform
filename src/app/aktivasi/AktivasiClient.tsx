'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type Stage = 'loading' | 'form' | 'done' | 'invalid' | 'expired'

export default function AktivasiClient() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const token        = searchParams.get('token') || ''

  const [stage, setStage]       = useState<Stage>('loading')
  const [userData, setUserData] = useState<{ name: string; email: string; tenantSlug: string } | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) { setStage('invalid'); return }

    fetch(`/api/auth/set-password?token=${token}`)
      .then(r => r.json())
      .then(j => {
        if (!j.success) { setStage('invalid'); return }
        if (j.data.expired) { setStage('expired'); return }
        setUserData(j.data)
        setStage('form')
      })
      .catch(() => setStage('invalid'))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password minimal 8 karakter')
      return
    }
    if (password !== confirm) {
      setError('Konfirmasi password tidak cocok')
      return
    }

    setSubmitting(true)
    try {
      const res  = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setStage('done')
      // Auto-login sudah aktif (cookie di-set server) → langsung ke dashboard tenant
      const dest = json.redirect || (json.tenantSlug ? `/${json.tenantSlug}` : '/login')
      setTimeout(() => { router.push(dest); router.refresh() }, 1500)
    } catch (e: any) {
      setError(e.message || 'Terjadi kesalahan')
    } finally {
      setSubmitting(false)
    }
  }

  const cardStyle: React.CSSProperties = {
    maxWidth: 440, margin: '0 auto',
    background: 'white', borderRadius: 'var(--r-xl)',
    padding: '48px 40px',
    boxShadow: '0 4px 32px rgba(0,0,0,0.10)',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--c-primary)' }}>CRM Platform</div>
          <div style={{ fontSize: 13, color: 'var(--c-text-muted)', marginTop: 4 }}>Aktivasi Akun</div>
        </div>

        <div style={cardStyle}>
          {/* Loading */}
          {stage === 'loading' && (
            <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: 32 }}>
              Memverifikasi link undangan...
            </div>
          )}

          {/* Invalid */}
          {stage === 'invalid' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
              <h2 style={{ fontWeight: 700, color: 'var(--c-error)', marginBottom: 8 }}>Link Tidak Valid</h2>
              <p style={{ color: 'var(--c-text-muted)', fontSize: 14 }}>
                Link aktivasi ini tidak ditemukan atau sudah digunakan. Hubungi admin untuk mendapatkan link baru.
              </p>
            </div>
          )}

          {/* Expired */}
          {stage === 'expired' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⏱</div>
              <h2 style={{ fontWeight: 700, color: 'var(--c-warning)', marginBottom: 8 }}>Link Kadaluarsa</h2>
              <p style={{ color: 'var(--c-text-muted)', fontSize: 14 }}>
                Link undangan ini sudah melewati batas 7 hari. Hubungi admin untuk meminta link baru.
              </p>
            </div>
          )}

          {/* Form */}
          {stage === 'form' && userData && (
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 20, color: 'var(--c-primary)', marginBottom: 4 }}>
                Halo, {userData.name}!
              </h2>
              <p style={{ fontSize: 13, color: 'var(--c-text-muted)', marginBottom: 24 }}>
                Anda diundang untuk mengakses tenant <strong>{userData.tenantSlug}</strong>.<br />
                Buat password untuk mengaktifkan akun Anda.
              </p>

              <div style={{ background: 'var(--c-bg)', borderRadius: 'var(--r-md)', padding: '12px 16px', marginBottom: 24, fontSize: 13 }}>
                <span style={{ color: 'var(--c-text-muted)' }}>Email: </span>
                <strong>{userData.email}</strong>
              </div>

              {error && (
                <div style={{ background: 'var(--c-error-light)', border: '1px solid var(--c-error)', borderRadius: 'var(--r-md)', padding: '10px 14px', marginBottom: 16, color: 'var(--c-error)', fontSize: 13 }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                    Password Baru
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Minimal 8 karakter"
                    required
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 'var(--r-md)',
                      border: '1.5px solid var(--c-border)', fontSize: 14,
                      fontFamily: 'inherit', background: 'var(--c-bg)',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                    Konfirmasi Password
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Ulangi password"
                    required
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 'var(--r-md)',
                      border: '1.5px solid var(--c-border)', fontSize: 14,
                      fontFamily: 'inherit', background: 'var(--c-bg)',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 'var(--r-md)',
                    background: submitting ? 'var(--c-border)' : 'var(--c-secondary)',
                    color: submitting ? 'var(--c-text-muted)' : 'white',
                    fontWeight: 700, fontSize: 15, border: 'none',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {submitting ? 'Mengaktifkan...' : 'Aktifkan Akun'}
                </button>
              </form>
            </div>
          )}

          {/* Done */}
          {stage === 'done' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <h2 style={{ fontWeight: 700, color: 'var(--c-success)', marginBottom: 8 }}>Akun Berhasil Diaktifkan!</h2>
              <p style={{ color: 'var(--c-text-muted)', fontSize: 14 }}>
                Anda otomatis masuk. Mengalihkan ke dashboard...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
