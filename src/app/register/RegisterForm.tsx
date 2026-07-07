'use client'

import { useState } from 'react'

type Stage = 'form' | 'done'

export default function RegisterForm() {
  const [stage,    setStage]    = useState<Stage>('form')
  const [orgName,  setOrgName]  = useState('')
  const [slug,     setSlug]     = useState('')
  const [slugManual, setSlugManual] = useState(false) // user sudah edit slug secara manual
  const [adminName, setAdminName] = useState('')
  const [email,    setEmail]    = useState('')
  const [phone,    setPhone]    = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState<{ slug: string; activateUrl: string } | null>(null)

  function generateSlug(name: string) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 20)
  }

  function handleOrgNameChange(val: string) {
    setOrgName(val)
    if (!slugManual) setSlug(generateSlug(val))
  }

  function handleSlugChange(val: string) {
    setSlugManual(true)
    setSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orgName, slug, adminName, email, phone }),
      })
      const json = await res.json()

      if (!res.ok) {
        setError(json.error || 'Pendaftaran gagal.')
        return
      }

      setResult({ slug: json.data.slug, activateUrl: json.data.activateUrl })
      setStage('done')
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

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 'var(--font-size-sm)', fontWeight: 600,
    color: 'var(--c-text)', marginBottom: 'var(--sp-2)',
  }

  if (stage === 'done' && result) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 'var(--sp-4)' }}>🎉</div>
        <h2 style={{ fontWeight: 800, color: 'var(--c-primary)', marginBottom: 'var(--sp-2)' }}>
          Pendaftaran Berhasil!
        </h2>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', lineHeight: 1.7, marginBottom: 'var(--sp-6)' }}>
          Organisasi <strong>{orgName}</strong> (kode: <code style={{ background: '#F1F5F9', padding: '1px 6px', borderRadius: 4 }}>{result.slug}</code>) berhasil terdaftar.
          <br />Cek email <strong>{email}</strong> untuk tautan aktivasi akun Admin IT Anda.
        </p>

        <div style={{ background: '#F8FAFC', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', marginBottom: 'var(--sp-6)', textAlign: 'left' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--c-text-muted)', marginBottom: 'var(--sp-2)' }}>
            Link aktivasi (jika email tidak diterima):
          </div>
          <div style={{ fontSize: 11, color: 'var(--c-primary)', wordBreak: 'break-all', fontFamily: 'monospace' }}>
            {result.activateUrl}
          </div>
        </div>

        <a href="/login" style={{
          display: 'inline-block', padding: '12px var(--sp-6)',
          background: 'var(--c-secondary)', color: 'white',
          borderRadius: 'var(--r-md)', textDecoration: 'none', fontWeight: 600,
        }}>
          Pergi ke Login
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div style={{
          background: '#FEF2F2', color: '#B91C1C',
          borderRadius: 'var(--r-sm)', padding: 'var(--sp-3) var(--sp-4)',
          fontSize: 'var(--font-size-sm)', marginBottom: 'var(--sp-5)',
          borderLeft: '3px solid #EF4444',
        }}>
          {error}
        </div>
      )}

      {/* Seksi: Info Organisasi */}
      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--c-text-faint)', textTransform: 'uppercase', marginBottom: 'var(--sp-4)' }}>
          Informasi Organisasi
        </div>

        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <label style={labelStyle}>Nama Organisasi</label>
          <input
            type="text"
            value={orgName}
            onChange={e => handleOrgNameChange(e.target.value)}
            required
            placeholder="RS Xyz / Klinik ABC / Puskesmas XYZ"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Kode Unik (Subdomain)</label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={slug}
              onChange={e => handleSlugChange(e.target.value)}
              required
              minLength={2}
              maxLength={20}
              placeholder="rs-xyz"
              style={{ ...inputStyle, paddingRight: 60 }}
            />
            <span style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              fontSize: 11, color: 'var(--c-text-faint)', userSelect: 'none',
            }}>
              .crm.id
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 4 }}>
            Hanya huruf kecil, angka, dan tanda hubung. Tidak bisa diubah setelah dibuat.
          </div>
        </div>
      </div>

      {/* Seksi: Admin IT Pertama */}
      <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 'var(--sp-6)', marginBottom: 'var(--sp-6)' }}>
        <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--c-text-faint)', textTransform: 'uppercase', marginBottom: 'var(--sp-4)' }}>
          Admin IT (Pemilik Akun)
        </div>

        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <label style={labelStyle}>Nama Lengkap</label>
          <input
            type="text"
            value={adminName}
            onChange={e => setAdminName(e.target.value)}
            required
            placeholder="Nama lengkap admin"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="admin@organisasi.com"
            style={inputStyle}
          />
          <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 4 }}>
            Link aktivasi akun akan dikirim ke email ini.
          </div>
        </div>

        <div>
          <label style={labelStyle}>No. HP <span style={{ fontWeight: 400, color: 'var(--c-text-faint)' }}>(opsional)</span></label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="08xxxxxxxxxx"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{
        background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 'var(--r-sm)',
        padding: 'var(--sp-3) var(--sp-4)', fontSize: 'var(--font-size-xs)',
        color: '#92400E', marginBottom: 'var(--sp-6)',
      }}>
        Dengan mendaftar, Anda menyetujui <strong>Syarat & Ketentuan</strong> dan <strong>Kebijakan Privasi</strong> CRM Platform.
        Masa trial gratis <strong>30 hari</strong> aktif setelah aktivasi.
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
        {loading ? 'Mendaftarkan...' : 'Daftarkan Organisasi'}
      </button>
    </form>
  )
}
