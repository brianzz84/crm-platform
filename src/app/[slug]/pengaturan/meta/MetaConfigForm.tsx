'use client'

import { useState } from 'react'

interface InitialData {
  id:              string
  phone_number_id: string
  waba_id:         string | null
  aktif:           boolean
  has_token:       boolean
  tested_at:       string | null
}

export default function MetaConfigForm({ slug, initialData }: { slug: string; initialData: InitialData | null }) {
  const [phoneNumberId, setPhoneNumberId] = useState(initialData?.phone_number_id ?? '')
  const [accessToken,   setAccessToken]   = useState('')
  const [wabaId,        setWabaId]        = useState(initialData?.waba_id ?? '')
  const [aktif,         setAktif]         = useState(initialData?.aktif ?? true)
  const [saving,        setSaving]        = useState(false)
  const [testing,       setTesting]       = useState(false)
  const [msg,           setMsg]           = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setMsg(null)
    try {
      const res  = await fetch(`/api/${slug}/pengaturan/meta`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          phone_number_id: phoneNumberId,
          access_token:    accessToken || undefined,
          waba_id:         wabaId || undefined,
          aktif,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setMsg({ type: 'error', text: json.error || 'Gagal menyimpan' }); return }
      setMsg({ type: 'success', text: 'Konfigurasi berhasil disimpan.' })
      setAccessToken('') // clear setelah simpan
    } finally { setSaving(false) }
  }

  async function handleTest() {
    setTesting(true); setMsg(null)
    try {
      const res  = await fetch(`/api/${slug}/pengaturan/meta`, { method: 'POST' })
      const json = await res.json()
      setMsg({ type: json.success ? 'success' : 'error', text: json.message || json.error || 'Test gagal' })
    } finally { setTesting(false) }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', fontSize: 'var(--font-size-sm)',
    border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)',
    fontFamily: 'inherit', background: 'white', color: 'var(--c-text)',
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <form onSubmit={handleSave}>
      <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
        <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)', background: 'var(--c-bg)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚙️</span>
          <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--c-primary)' }}>Konfigurasi Meta Cloud API</span>
          {initialData?.tested_at && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#15803D', background: '#F0FDF4', padding: '2px 10px', borderRadius: 99, fontWeight: 600 }}>
              ✓ Terkoneksi
            </span>
          )}
        </div>

        <div style={{ padding: 'var(--sp-5)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          {/* Phone Number ID */}
          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--c-text)', marginBottom: 6 }}>
              Phone Number ID <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input
              value={phoneNumberId}
              onChange={e => setPhoneNumberId(e.target.value)}
              placeholder="1220198011171670"
              required
              style={inputStyle}
            />
            <p style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 4, margin: '4px 0 0' }}>
              Dari Meta Developers → WhatsApp → API Setup → Phone Number ID
            </p>
          </div>

          {/* Access Token */}
          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--c-text)', marginBottom: 6 }}>
              Access Token (System User)
              {initialData?.has_token && <span style={{ marginLeft: 8, fontSize: 10, color: '#15803D', fontWeight: 400 }}>● Token tersimpan</span>}
            </label>
            <input
              type="password"
              value={accessToken}
              onChange={e => setAccessToken(e.target.value)}
              placeholder={initialData?.has_token ? 'Kosongkan jika tidak ingin mengubah token' : 'Paste permanent system user token'}
              style={inputStyle}
            />
            <p style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 4, margin: '4px 0 0' }}>
              Gunakan permanent token dari System User (bukan token 24 jam). Meta Developers → System Users → Generate Token.
            </p>
          </div>

          {/* WABA ID */}
          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--c-text)', marginBottom: 6 }}>
              WhatsApp Business Account ID
            </label>
            <input
              value={wabaId}
              onChange={e => setWabaId(e.target.value)}
              placeholder="879704728148037"
              style={inputStyle}
            />
            <p style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 4, margin: '4px 0 0' }}>
              Opsional — untuk referensi. Dari Meta Business Suite → Accounts → WhatsApp Accounts.
            </p>
          </div>

          {/* Toggle aktif */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'var(--sp-3) var(--sp-4)', background: 'var(--c-bg)', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)' }}>
            <input
              type="checkbox"
              id="meta-aktif"
              checked={aktif}
              onChange={e => setAktif(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <label htmlFor="meta-aktif" style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--c-text)', cursor: 'pointer' }}>
              Aktifkan Meta Cloud API
            </label>
            <span style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>
              Jika aktif, balasan dari Inbox akan dikirim via Meta. Jika nonaktif, sistem fallback ke Wappin.
            </span>
          </div>

          {/* Pesan status */}
          {msg && (
            <div style={{
              padding: 'var(--sp-3) var(--sp-4)', borderRadius: 'var(--r-md)', fontSize: 'var(--font-size-sm)',
              background: msg.type === 'success' ? '#F0FDF4' : '#FEF2F2',
              border: `1px solid ${msg.type === 'success' ? '#BBF7D0' : '#FECACA'}`,
              color: msg.type === 'success' ? '#15803D' : '#DC2626',
            }}>
              {msg.type === 'success' ? '✓ ' : '✗ '}{msg.text}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <button
              type="submit"
              disabled={saving || !phoneNumberId}
              style={{
                padding: '10px 24px', borderRadius: 'var(--r-md)', border: 'none',
                background: saving || !phoneNumberId ? 'var(--c-border)' : 'var(--c-primary)',
                color: 'white', fontFamily: 'inherit', fontSize: 'var(--font-size-sm)',
                fontWeight: 700, cursor: saving || !phoneNumberId ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Menyimpan…' : 'Simpan Konfigurasi'}
            </button>

            {initialData && (
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                style={{
                  padding: '10px 24px', borderRadius: 'var(--r-md)',
                  border: '1.5px solid var(--c-primary)',
                  background: 'white', color: 'var(--c-primary)',
                  fontFamily: 'inherit', fontSize: 'var(--font-size-sm)',
                  fontWeight: 700, cursor: testing ? 'not-allowed' : 'pointer',
                }}
              >
                {testing ? 'Menguji…' : '🔌 Test Koneksi'}
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  )
}
