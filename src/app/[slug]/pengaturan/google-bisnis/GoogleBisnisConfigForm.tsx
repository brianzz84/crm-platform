'use client'

import { useState } from 'react'

export interface GoogleBisnisAman {
  id:                string
  client_id:         string
  account_id:        string | null
  location_utama:    string | null
  aktif:             boolean
  has_client_secret: boolean
  has_refresh_token: boolean
  tested_at:         string | null
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 'var(--r-sm)',
  border: '1.5px solid var(--c-border)', fontSize: 'var(--font-size-sm)',
  fontFamily: 'inherit', outline: 'none', background: 'white', color: 'var(--c-text)',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 700,
  color: 'var(--c-text)', marginBottom: 6,
}

const bantuanStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--c-text-faint)', margin: '4px 0 0', lineHeight: 1.6,
}

export default function GoogleBisnisConfigForm({
  slug, initialData,
}: { slug: string; initialData: GoogleBisnisAman | null }) {
  const [clientId,      setClientId]      = useState(initialData?.client_id ?? '')
  const [clientSecret,  setClientSecret]  = useState('')
  const [refreshToken,  setRefreshToken]  = useState('')
  const [accountId,     setAccountId]     = useState(initialData?.account_id ?? '')
  const [locationUtama, setLocationUtama] = useState(initialData?.location_utama ?? '')
  const [aktif,         setAktif]         = useState(initialData?.aktif ?? true)
  const [simpan,        setSimpan]        = useState(false)
  const [pesan,         setPesan]         = useState('')
  const [error,         setError]         = useState('')
  const [tersimpan,     setTersimpan]     = useState(initialData)

  async function kirim(e: React.FormEvent) {
    e.preventDefault()
    setSimpan(true); setPesan(''); setError('')
    try {
      const res = await fetch(`/api/${slug}/pengaturan/google-bisnis`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          client_id:      clientId,
          client_secret:  clientSecret,
          refresh_token:  refreshToken,
          account_id:     accountId,
          location_utama: locationUtama,
          aktif,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error || 'Gagal menyimpan'); return }
      setTersimpan(json.data)
      setClientSecret(''); setRefreshToken('')   // jangan tahan rahasia di memori form
      setPesan('Konfigurasi tersimpan. Jalankan probe di bawah untuk memverifikasi akses.')
    } catch {
      setError('Gagal menghubungi server')
    } finally {
      setSimpan(false)
    }
  }

  return (
    <form onSubmit={kirim} style={{
      background: 'var(--c-surface)', border: '1px solid var(--c-border)',
      borderRadius: 'var(--r-lg)', overflow: 'hidden',
    }}>
      <div style={{
        padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--font-size-md)', color: 'var(--c-primary)' }}>
          Kredensial Google Business Profile
        </span>
        {tersimpan?.tested_at && (
          <span style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>
            Terakhir diuji: {new Date(tersimpan.tested_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        )}
      </div>

      <div style={{ padding: 'var(--sp-5)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
        <div>
          <label style={labelStyle}>OAuth Client ID <span style={{ color: '#EF4444' }}>*</span></label>
          <input value={clientId} onChange={e => setClientId(e.target.value)}
            placeholder="1234567890-abc.apps.googleusercontent.com" required style={inputStyle} />
          <p style={bantuanStyle}>
            Google Cloud Console → APIs &amp; Services → Credentials → OAuth 2.0 Client ID (tipe Web application).
          </p>
        </div>

        <div>
          <label style={labelStyle}>
            OAuth Client Secret
            {tersimpan?.has_client_secret && <span style={{ marginLeft: 8, fontSize: 10, color: '#15803D', fontWeight: 400 }}>● Tersimpan</span>}
          </label>
          <input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)}
            placeholder={tersimpan?.has_client_secret ? 'Kosongkan jika tidak ingin mengubah' : 'Paste client secret'}
            style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>
            Refresh Token <span style={{ color: '#EF4444' }}>*</span>
            {tersimpan?.has_refresh_token && <span style={{ marginLeft: 8, fontSize: 10, color: '#15803D', fontWeight: 400 }}>● Tersimpan</span>}
          </label>
          <input type="password" value={refreshToken} onChange={e => setRefreshToken(e.target.value)}
            placeholder={tersimpan?.has_refresh_token ? 'Kosongkan jika tidak ingin mengubah' : 'Paste refresh token hasil persetujuan OAuth'}
            style={inputStyle} />
          <p style={bantuanStyle}>
            Didapat sekali lewat proses persetujuan OAuth memakai akun yang mengelola listing, dengan scope{' '}
            <code>https://www.googleapis.com/auth/business.manage</code>. Wajib meminta akses tipe <em>offline</em> agar
            refresh token diterbitkan.
          </p>
        </div>

        <div>
          <label style={labelStyle}>Account ID</label>
          <input value={accountId} onChange={e => setAccountId(e.target.value)}
            placeholder="accounts/123456789012345678901" style={inputStyle} />
          <p style={bantuanStyle}>
            Boleh dikosongkan — probe akan menampilkan daftar akun yang terbaca, lalu Anda salin ke sini.
          </p>
        </div>

        <div>
          <label style={labelStyle}>Lokasi Utama</label>
          <input value={locationUtama} onChange={e => setLocationUtama(e.target.value)}
            placeholder="locations/12345678901234567890" style={inputStyle} />
          <p style={bantuanStyle}>
            Lokasi yang dipakai sebagai bawaan dashboard, mis. Rumah Sakit RKZ Surabaya. Kosongkan untuk memakai
            lokasi pertama yang terbaca.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input id="gbp-aktif" type="checkbox" checked={aktif} onChange={e => setAktif(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }} />
          <label htmlFor="gbp-aktif" style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--c-text)', cursor: 'pointer' }}>
            Integrasi aktif
          </label>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #EF4444' }}>
            {error}
          </div>
        )}
        {pesan && (
          <div style={{ background: '#F0FDF4', color: '#15803D', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #22C55E' }}>
            {pesan}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" disabled={simpan} style={{
            padding: '10px 22px', borderRadius: 'var(--r-md)', border: 'none',
            background: simpan ? '#94A3B8' : 'var(--c-secondary)', color: 'white',
            fontFamily: 'inherit', fontSize: 'var(--font-size-sm)', fontWeight: 700,
            cursor: simpan ? 'wait' : 'pointer',
          }}>
            {simpan ? 'Menyimpan…' : 'Simpan Konfigurasi'}
          </button>
        </div>
      </div>
    </form>
  )
}
