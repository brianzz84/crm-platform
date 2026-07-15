'use client'

import { useState } from 'react'

interface Props {
  slug: string
  initialData: {
    ai_enabled:  boolean
    ai_provider: string
    ai_model:    string
    has_api_key: boolean
  }
}

const PROVIDERS = [
  { value: 'CLAUDE', label: 'Claude (Anthropic)', desc: 'Default. Butuh API key dari console.anthropic.com.' },
  { value: 'GEMINI', label: 'Gemini (Google)', desc: 'Alternatif. Butuh API key dari Google AI Studio (aistudio.google.com).' },
]

export default function AiConfigForm({ slug, initialData }: Props) {
  const [enabled,  setEnabled]  = useState(initialData.ai_enabled)
  const [provider, setProvider] = useState(initialData.ai_provider)
  const [model,    setModel]    = useState(initialData.ai_model)
  const [apiKey,   setApiKey]   = useState('')
  const [hasKey,   setHasKey]   = useState(initialData.has_api_key)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [error,    setError]    = useState('')

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const body: any = { ai_enabled: enabled, ai_provider: provider, ai_model: model }
      if (apiKey) body.ai_api_key = apiKey
      const res  = await fetch(`/api/${slug}/pengaturan/ai`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Gagal menyimpan'); return }
      setSaved(true)
      if (apiKey) { setHasKey(true); setApiKey('') }
      setTimeout(() => setSaved(false), 3000)
    } finally { setSaving(false) }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontFamily: 'inherit',
    fontSize: 'var(--font-size-sm)', border: '1.5px solid var(--c-border)',
    borderRadius: 'var(--r-sm)', outline: 'none', boxSizing: 'border-box',
    background: 'var(--c-bg)', color: 'var(--c-text)',
  }
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 700,
    color: 'var(--c-text)', marginBottom: 4,
  }
  const section: React.CSSProperties = {
    background: 'var(--c-surface)', border: '1px solid var(--c-border)',
    borderRadius: 'var(--r-lg)', padding: 'var(--sp-5)', marginBottom: 'var(--sp-5)',
  }

  return (
    <div>
      <div style={section}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-4)' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-md)', color: 'var(--c-primary)' }}>
              Fitur AI
            </div>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', margin: '4px 0 0' }}>
              Aktifkan pencarian pasien berbasis bahasa natural di halaman Segmentasi.
            </p>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: 8 }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => setEnabled(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: enabled ? '#16A34A' : 'var(--c-text-muted)' }}>
              {enabled ? 'Aktif' : 'Nonaktif'}
            </span>
          </label>
        </div>
      </div>

      <div style={section}>
        <div style={{ fontWeight: 700, fontSize: 'var(--font-size-md)', color: 'var(--c-primary)', marginBottom: 'var(--sp-4)' }}>
          Provider AI
        </div>

        <div style={{ display: 'grid', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
          {PROVIDERS.map(p => (
            <label key={p.value} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: 'var(--sp-3) var(--sp-4)',
              border: `1.5px solid ${provider === p.value ? 'var(--c-secondary)' : 'var(--c-border)'}`,
              borderRadius: 'var(--r-md)', cursor: 'pointer',
              background: provider === p.value ? 'var(--c-bg)' : 'transparent',
            }}>
              <input
                type="radio"
                name="ai_provider"
                checked={provider === p.value}
                onChange={() => setProvider(p.value)}
                style={{ marginTop: 3, cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--c-text)' }}>{p.label}</div>
                <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 2 }}>{p.desc}</div>
              </div>
            </label>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <div>
            <label style={lbl}>
              API Key {hasKey ? '(kosongkan jika tidak diubah)' : '*'}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={hasKey ? '••••••••••••' : 'Wajib diisi — API key dari provider terpilih'}
              style={inp}
            />
            {!hasKey && (
              <p style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 4, marginBottom: 0 }}>
                Fitur AI tidak akan berfungsi sampai API key diisi — tidak ada key global cadangan.
              </p>
            )}
          </div>
          <div>
            <label style={lbl}>Model (opsional)</label>
            <input
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder={provider === 'GEMINI' ? 'default: gemini-3-flash-preview' : 'default: claude-haiku-4-5'}
              style={inp}
            />
            <p style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 4, marginBottom: 0 }}>
              Kosongkan untuk pakai model default sistem.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', color: '#B91C1C', borderRadius: 'var(--r-sm)', padding: 'var(--sp-3) var(--sp-4)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--sp-4)', borderLeft: '3px solid #EF4444' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', justifyContent: 'flex-end' }}>
        {saved && <span style={{ fontSize: 'var(--font-size-sm)', color: '#22C55E', fontWeight: 600 }}>✓ Konfigurasi tersimpan</span>}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '10px 24px', borderRadius: 'var(--r-md)',
            background: saving ? '#94A3B8' : 'var(--c-secondary)',
            border: 'none', color: 'white', fontFamily: 'inherit',
            fontSize: 'var(--font-size-sm)', fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
        </button>
      </div>
    </div>
  )
}
