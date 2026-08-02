'use client'

import { useEffect, useState } from 'react'

export interface GoogleBisnisAman {
  id:                 string
  client_id:          string
  account_id:         string | null
  location_utama:     string | null
  ga4_property_id:    string | null
  youtube_channel_id: string | null
  aktif:              boolean
  has_client_secret:  boolean
  has_refresh_token:  boolean
  scopes:             string[]
  connected_at:       string | null
  connected_email:    string | null
  tested_at:          string | null
}

/** Layanan yang tercakup oleh scope yang disetujui — cerminan `layananTercakup` di server. */
const LAYANAN: { kunci: string; label: string; scope: string }[] = [
  { kunci: 'gbp',     label: 'Google Business Profile', scope: 'https://www.googleapis.com/auth/business.manage' },
  { kunci: 'ga4',     label: 'Google Analytics',        scope: 'https://www.googleapis.com/auth/analytics.readonly' },
  { kunci: 'youtube', label: 'YouTube',                 scope: 'https://www.googleapis.com/auth/yt-analytics.readonly' },
]

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
  const [accountId,     setAccountId]     = useState(initialData?.account_id ?? '')
  const [locationUtama, setLocationUtama] = useState(initialData?.location_utama ?? '')
  const [ga4Property,   setGa4Property]   = useState(initialData?.ga4_property_id ?? '')
  const [ytChannel,     setYtChannel]     = useState(initialData?.youtube_channel_id ?? '')
  const [aktif,         setAktif]         = useState(initialData?.aktif ?? true)
  const [simpan,        setSimpan]        = useState(false)
  const [pesan,         setPesan]         = useState('')
  const [error,         setError]         = useState('')
  const [tersimpan,     setTersimpan]     = useState(initialData)

  // Hasil penyambungan dikembalikan sebagai parameter URL oleh callback OAuth.
  // Dibaca dari window agar tidak menuntut batas Suspense seperti useSearchParams.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const hasil = q.get('oauth')
    if (!hasil) return
    if (hasil === 'sukses') setPesan('Berhasil tersambung ke Google. Jalankan probe di bawah untuk memverifikasi akses.')
    else setError(q.get('pesan') || 'Penyambungan ke Google gagal.')
    // Bersihkan URL supaya pesan tidak muncul lagi saat halaman dimuat ulang.
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  async function kirim(e: React.FormEvent) {
    e.preventDefault()
    setSimpan(true); setPesan(''); setError('')
    try {
      const res = await fetch(`/api/${slug}/pengaturan/google-bisnis`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          client_id:          clientId,
          client_secret:      clientSecret,
          account_id:         accountId,
          location_utama:     locationUtama,
          ga4_property_id:    ga4Property,
          youtube_channel_id: ytChannel,
          aktif,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error || 'Gagal menyimpan'); return }
      setTersimpan(json.data)
      setClientSecret('')   // jangan tahan rahasia di memori form
      setPesan(json.data?.has_refresh_token
        ? 'Konfigurasi tersimpan.'
        : 'Kredensial tersimpan. Sekarang klik "Hubungkan dengan Google" di bawah.')
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

        {/* Sambungan Google — menggantikan input Refresh Token manual. Token
            diterbitkan lewat alur OAuth dan tidak pernah melewati form ini. */}
        {(() => {
          const siapDisambung = !!tersimpan?.has_client_secret
          const tersambung    = !!tersimpan?.has_refresh_token
          return (
            <div style={{
              border: `1.5px solid ${tersambung ? '#BBF7D0' : 'var(--c-border)'}`,
              background: tersambung ? '#F0FDF4' : 'var(--c-bg)',
              borderRadius: 'var(--r-md)', padding: 'var(--sp-4)',
            }}>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--c-primary)', marginBottom: 6 }}>
                Sambungan Google
              </div>

              {tersambung ? (
                <>
                  <div style={{ fontSize: 13, color: '#15803D', fontWeight: 600 }}>
                    ✓ Tersambung{tersimpan?.connected_email ? ` sebagai ${tersimpan.connected_email}` : ''}
                  </div>
                  {tersimpan?.connected_at && (
                    <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginTop: 2 }}>
                      Disambungkan {new Date(tersimpan.connected_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {LAYANAN.map(l => {
                      const aktifScope = tersimpan?.scopes?.includes(l.scope)
                      return (
                        <span key={l.kunci} style={{
                          fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--r-full)',
                          background: aktifScope ? '#DCFCE7' : 'white',
                          color:      aktifScope ? '#15803D' : 'var(--c-text-faint)',
                          border: `1px solid ${aktifScope ? '#BBF7D0' : 'var(--c-border)'}`,
                        }}>
                          {aktifScope ? '✓' : '○'} {l.label}
                        </span>
                      )
                    })}
                  </div>
                </>
              ) : (
                <p style={{ ...bantuanStyle, marginTop: 0 }}>
                  Satu kali login memberi akses ke Google Business Profile, Google Analytics, dan YouTube sekaligus.
                  Gunakan akun Google yang mengelola listing dan properti tersebut.
                </p>
              )}

              <div style={{ marginTop: 'var(--sp-4)' }}>
                <a
                  href={siapDisambung ? `/api/${slug}/pengaturan/google-bisnis/oauth/start` : undefined}
                  aria-disabled={!siapDisambung}
                  style={{
                    display: 'inline-block', padding: '9px 18px', borderRadius: 'var(--r-md)',
                    background: siapDisambung ? 'white' : 'var(--c-bg)',
                    border: `1.5px solid ${siapDisambung ? 'var(--c-border)' : 'var(--c-border)'}`,
                    color: siapDisambung ? 'var(--c-text)' : 'var(--c-text-faint)',
                    fontSize: 'var(--font-size-sm)', fontWeight: 700, textDecoration: 'none',
                    cursor: siapDisambung ? 'pointer' : 'not-allowed',
                    pointerEvents: siapDisambung ? 'auto' : 'none',
                  }}
                >
                  {tersambung ? 'Sambungkan Ulang' : 'Hubungkan dengan Google'}
                </a>
                {!siapDisambung && (
                  <p style={bantuanStyle}>
                    Isi Client ID &amp; Client Secret lalu <strong>Simpan Konfigurasi</strong> dulu — tombol ini aktif setelahnya.
                  </p>
                )}
                {tersambung && (
                  <p style={bantuanStyle}>
                    Perlu disambungkan ulang hanya bila akun Google berganti, izin dicabut, atau ada layanan baru yang ditambahkan.
                  </p>
                )}
              </div>
            </div>
          )
        })()}

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

        <div>
          <label style={labelStyle}>GA4 Property ID</label>
          <input value={ga4Property} onChange={e => setGa4Property(e.target.value)}
            placeholder="properties/123456789" style={inputStyle} />
          <p style={bantuanStyle}>
            Properti Google Analytics 4 untuk website utama. Lihat di Google Analytics → Admin → Property Settings.
            Tulis lengkap dengan awalan <code>properties/</code>.
          </p>
        </div>

        <div>
          <label style={labelStyle}>YouTube Channel ID</label>
          <input value={ytChannel} onChange={e => setYtChannel(e.target.value)}
            placeholder="UCxxxxxxxxxxxxxxxxxxxxxx" style={inputStyle} />
          <p style={bantuanStyle}>
            Channel yang dipantau. Boleh dikosongkan — sistem memakai channel milik akun yang tersambung.
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
