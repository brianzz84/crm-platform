'use client'

import { useState } from 'react'

interface Props {
  slug:       string
  initialCfg: { aktif: boolean; api_url: string; has_api_key: boolean } | null
}

export default function EflyerConfigForm({ slug, initialCfg }: Props) {
  const [aktif,      setAktif]      = useState(initialCfg?.aktif    ?? false)
  const [apiUrl,     setApiUrl]     = useState(initialCfg?.api_url  ?? '')
  const [apiKey,     setApiKey]     = useState('')
  const [hasApiKey,  setHasApiKey]  = useState(initialCfg?.has_api_key ?? false)
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [error,      setError]      = useState('')

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontFamily: 'inherit',
    fontSize: 'var(--font-size-sm)', border: '1.5px solid var(--c-border)',
    borderRadius: 'var(--r-sm)', background: 'var(--c-bg)', color: 'var(--c-text)',
    outline: 'none', boxSizing: 'border-box',
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(''); setSaved(false)
    try {
      const body: Record<string, any> = { aktif, api_url: apiUrl }
      if (apiKey) body.api_key = apiKey
      const res  = await fetch(`/api/${slug}/pengaturan/eflyer`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Gagal menyimpan'); return }
      setSaved(true)
      setHasApiKey(json.data.has_api_key)
      setApiKey('')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>

      {/* Info */}
      <div style={{
        background: '#EFF6FF', border: '1px solid #BFDBFE',
        borderRadius: 'var(--r-lg)', padding: 'var(--sp-4) var(--sp-5)',
        display: 'flex', gap: 12,
      }}>
        <span style={{ fontSize: 20 }}>ℹ️</span>
        <div style={{ fontSize: 'var(--font-size-xs)', color: '#1E40AF', lineHeight: 1.6 }}>
          E-Flyer memungkinkan staf memilih flyer dari katalog publik dan mengirimnya langsung via WhatsApp ke pasien.
          File flyer tetap di server Anda — CRM hanya mengambil daftarnya melalui API proxy.
        </div>
      </div>

      {/* Form */}
      <div style={{
        background: 'var(--c-surface)', border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-xl)', overflow: 'hidden',
      }}>
        <div style={{
          padding: 'var(--sp-5)', borderBottom: '1px solid var(--c-border)',
          background: 'var(--c-bg)',
        }}>
          <h2 style={{ fontWeight: 800, fontSize: 'var(--font-size-md)', color: 'var(--c-primary)', margin: 0 }}>
            Konfigurasi E-Flyer
          </h2>
        </div>

        <form onSubmit={handleSave} style={{ padding: 'var(--sp-5)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

          {/* Toggle aktif */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--c-primary)' }}>Aktifkan E-Flyer</div>
              <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 2 }}>
                Menampilkan tab E-Flyer di tombol lampiran chat
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setAktif(v => !v); setSaved(false) }}
              style={{
                width: 48, height: 26, borderRadius: 13, border: 'none',
                background: aktif ? 'var(--c-secondary)' : '#CBD5E1',
                cursor: 'pointer', position: 'relative', flexShrink: 0,
                transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 3,
                left: aktif ? 25 : 3,
                width: 20, height: 20, borderRadius: '50%',
                background: 'white', transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--c-border)', margin: 0 }} />

          {/* API URL */}
          <div>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text)', marginBottom: 4 }}>
              API URL Proxy
            </label>
            <input
              value={apiUrl}
              onChange={e => { setApiUrl(e.target.value); setSaved(false) }}
              placeholder="https://yourdomain.com/eflyer-v3/api/flyers.php"
              style={inp}
            />
            <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 3 }}>
              URL file PHP proxy yang terpasang di server Anda (Hostgator, dll).
            </div>
          </div>

          {/* API Key */}
          <div>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text)', marginBottom: 4 }}>
              API Key {hasApiKey && <span style={{ fontWeight: 400, color: 'var(--c-text-faint)' }}>(sudah tersimpan)</span>}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setSaved(false) }}
              placeholder={hasApiKey ? 'Biarkan kosong jika tidak ingin mengubah' : 'Masukkan API key…'}
              style={inp}
              autoComplete="new-password"
            />
            <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 3 }}>
              Sesuai dengan konstanta <code style={{ fontFamily: 'monospace', background: 'var(--c-bg)', padding: '1px 4px', borderRadius: 3 }}>EFLYER_API_KEY</code> di file PHP proxy.
            </div>
          </div>

          {error && (
            <div style={{
              background: '#FEF2F2', color: '#B91C1C', padding: 'var(--sp-3) var(--sp-4)',
              borderRadius: 'var(--r-sm)', fontSize: 'var(--font-size-sm)',
              borderLeft: '3px solid #EF4444',
            }}>{error}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 'var(--sp-3)', paddingTop: 'var(--sp-2)' }}>
            {saved && <span style={{ fontSize: 'var(--font-size-sm)', color: '#22C55E', fontWeight: 600 }}>✓ Tersimpan</span>}
            <button type="submit" disabled={saving} style={{
              padding: '9px 24px', borderRadius: 'var(--r-md)',
              background: saving ? '#94A3B8' : 'var(--c-secondary)',
              border: 'none', color: 'white', fontFamily: 'inherit',
              fontSize: 'var(--font-size-sm)', fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}>
              {saving ? 'Menyimpan…' : 'Simpan Konfigurasi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
