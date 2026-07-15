'use client'

import { useState } from 'react'

interface Rule {
  id:         string
  kategori:   'PERILAKU' | 'PERSONA' | 'BATASAN'
  teks:       string
  aktif:      boolean
  created_at: string
}

interface Props {
  slug:         string
  initialRules: Rule[]
}

const KATEGORI_LABEL: Record<Rule['kategori'], string> = {
  PERILAKU: 'Perilaku',
  PERSONA:  'Persona',
  BATASAN:  'Batasan Topik',
}

const KATEGORI_COLOR: Record<Rule['kategori'], string> = {
  PERILAKU: '#0089A8',
  PERSONA:  '#7C3AED',
  BATASAN:  '#DC2626',
}

const KATEGORI_DESC: Record<Rule['kategori'], string> = {
  PERILAKU: 'Cara AI merespons — mis. wajib tanya balik saat ambigu',
  PERSONA:  'Gaya bahasa, fokus marketing RS ini',
  BATASAN:  'Topik yang boleh/tidak boleh dibahas AI',
}

export default function AiRulesManager({ slug, initialRules }: Props) {
  const [rules,    setRules]    = useState<Rule[]>(initialRules)
  const [kategori, setKategori] = useState<Rule['kategori']>('PERILAKU')
  const [teks,     setTeks]     = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (teks.trim().length < 3) { setError('Teks rule terlalu pendek'); return }
    setSaving(true); setError('')
    try {
      const res  = await fetch(`/api/${slug}/pengaturan/ai/rules`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ kategori, teks: teks.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Gagal menambah rule'); return }
      setRules(r => [...r, json.data])
      setTeks('')
    } finally { setSaving(false) }
  }

  async function handleToggle(rule: Rule) {
    setRules(r => r.map(x => x.id === rule.id ? { ...x, aktif: !x.aktif } : x))
    const res = await fetch(`/api/${slug}/pengaturan/ai/rules/${rule.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body:   JSON.stringify({ aktif: !rule.aktif }),
    })
    if (!res.ok) setRules(r => r.map(x => x.id === rule.id ? { ...x, aktif: rule.aktif } : x))
  }

  async function handleDelete(ruleId: string) {
    const prev = rules
    setRules(r => r.filter(x => x.id !== ruleId))
    const res = await fetch(`/api/${slug}/pengaturan/ai/rules/${ruleId}`, { method: 'DELETE' })
    if (!res.ok) setRules(prev)
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontFamily: 'inherit',
    fontSize: 'var(--font-size-sm)', border: '1.5px solid var(--c-border)',
    borderRadius: 'var(--r-sm)', outline: 'none', boxSizing: 'border-box',
    background: 'var(--c-bg)', color: 'var(--c-text)',
  }
  const section: React.CSSProperties = {
    background: 'var(--c-surface)', border: '1px solid var(--c-border)',
    borderRadius: 'var(--r-lg)', padding: 'var(--sp-5)', marginBottom: 'var(--sp-5)',
  }

  return (
    <div style={section}>
      <div style={{ fontWeight: 700, fontSize: 'var(--font-size-md)', color: 'var(--c-primary)', marginBottom: 4 }}>
        Rule & Persona AI Partner
      </div>
      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', marginTop: 0, marginBottom: 'var(--sp-4)' }}>
        Instruksi perilaku AI Partner — bisa ditambah bertahap seiring pemakaian. Ini tidak menggantikan
        batasan struktural AI (AI tetap hanya bisa memakai tool pencarian yang sudah disediakan, tidak pernah akses DB langsung).
      </p>

      {rules.length === 0 ? (
        <div style={{ padding: 'var(--sp-4)', textAlign: 'center', color: 'var(--c-text-faint)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--sp-4)' }}>
          Belum ada rule ditambahkan.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--sp-2)', marginBottom: 'var(--sp-5)' }}>
          {rules.map(rule => (
            <div key={rule.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: 'var(--sp-3) var(--sp-4)',
              border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)',
              background: rule.aktif ? 'var(--c-bg)' : 'transparent', opacity: rule.aktif ? 1 : 0.55,
            }}>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99, flexShrink: 0,
                background: KATEGORI_COLOR[rule.kategori] + '18', color: KATEGORI_COLOR[rule.kategori],
              }}>
                {KATEGORI_LABEL[rule.kategori]}
              </span>
              <div style={{ flex: 1, minWidth: 0, fontSize: 'var(--font-size-sm)', color: 'var(--c-text)' }}>
                {rule.teks}
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                <input type="checkbox" checked={rule.aktif} onChange={() => handleToggle(rule)} style={{ cursor: 'pointer' }} />
              </label>
              <button
                onClick={() => handleDelete(rule.id)}
                style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 12, flexShrink: 0, padding: 0 }}
              >
                Hapus
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd}>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
          <select value={kategori} onChange={e => setKategori(e.target.value as Rule['kategori'])} style={{ ...inp, cursor: 'pointer' }}>
            {(Object.keys(KATEGORI_LABEL) as Rule['kategori'][]).map(k => (
              <option key={k} value={k}>{KATEGORI_LABEL[k]}</option>
            ))}
          </select>
          <input
            value={teks}
            onChange={e => setTeks(e.target.value)}
            placeholder={KATEGORI_DESC[kategori]}
            style={inp}
          />
        </div>
        {error && (
          <div style={{ fontSize: 12, color: '#DC2626', marginBottom: 'var(--sp-3)' }}>{error}</div>
        )}
        <button type="submit" disabled={saving} style={{
          padding: '8px 18px', borderRadius: 'var(--r-md)',
          background: saving ? '#94A3B8' : 'var(--c-secondary)',
          border: 'none', color: 'white', fontFamily: 'inherit',
          fontSize: 'var(--font-size-xs)', fontWeight: 700,
          cursor: saving ? 'not-allowed' : 'pointer',
        }}>
          {saving ? 'Menambah...' : '+ Tambah Rule'}
        </button>
      </form>
    </div>
  )
}
