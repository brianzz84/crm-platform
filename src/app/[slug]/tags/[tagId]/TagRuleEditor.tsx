'use client'

import { useState } from 'react'
import IcdSearchInput from '@/components/IcdSearchInput'

interface TagRule {
  id?: string
  aktif: boolean
  icd_codes: string[]
  icd_exclude: string[]
  keyword_include: string[]
  keyword_exclude: string[]
  instruksi_ai: string
  contoh_positif: string[]
  contoh_negatif: string[]
  confidence_min: number
}

const EMPTY_RULE: TagRule = {
  aktif:           true,
  icd_codes:       [],
  icd_exclude:     [],
  keyword_include: [],
  keyword_exclude: [],
  instruksi_ai:    '',
  contoh_positif:  [],
  contoh_negatif:  [],
  confidence_min:  0.80,
}

function ChipInput({
  label, hint, chips, onChange, placeholder, color = '#0089A8',
}: {
  label: string; hint?: string; chips: string[]; onChange: (v: string[]) => void
  placeholder?: string; color?: string
}) {
  const [inp, setInp] = useState('')

  function add() {
    const v = inp.trim().toUpperCase()
    if (v && !chips.includes(v)) onChange([...chips, v])
    setInp('')
  }

  return (
    <div style={{ marginBottom: 'var(--sp-4)' }}>
      <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--c-text)', marginBottom: 4 }}>
        {label}
      </label>
      {hint && <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginBottom: 6 }}>{hint}</div>}
      <div style={{
        minHeight: 42, background: 'var(--c-bg)', border: '1.5px solid var(--c-border)',
        borderRadius: 'var(--r-md)', padding: '6px 10px',
        display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
      }}>
        {chips.map(c => (
          <span key={c} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: color + '18', border: `1px solid ${color}`,
            borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600, color: color,
          }}>
            {c}
            <span onClick={() => onChange(chips.filter(x => x !== c))}
              style={{ cursor: 'pointer', fontSize: 14, lineHeight: 1, color: color, opacity: 0.6, marginLeft: 2 }}>×</span>
          </span>
        ))}
        <input
          value={inp} onChange={e => setInp(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
          placeholder={chips.length === 0 ? placeholder : ''}
          style={{
            border: 'none', outline: 'none', background: 'transparent',
            fontFamily: 'inherit', fontSize: 12, minWidth: 80, flex: 1,
          }}
        />
      </div>
      {inp && (
        <button onClick={add} style={{
          marginTop: 4, fontSize: 11, color: color, background: 'none', border: 'none',
          cursor: 'pointer', fontFamily: 'inherit', padding: 0,
        }}>
          + Tambahkan "{inp.toUpperCase()}"
        </button>
      )}
    </div>
  )
}

function TextListInput({
  label, hint, items, onChange, placeholder,
}: {
  label: string; hint?: string; items: string[]; onChange: (v: string[]) => void; placeholder?: string
}) {
  const [inp, setInp] = useState('')

  function add() {
    const v = inp.trim()
    if (v && !items.includes(v)) onChange([...items, v])
    setInp('')
  }

  return (
    <div style={{ marginBottom: 'var(--sp-4)' }}>
      <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--c-text)', marginBottom: 4 }}>
        {label}
      </label>
      {hint && <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginBottom: 6 }}>{hint}</div>}
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ flex: 1, background: 'var(--c-bg)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', padding: '5px 10px', fontSize: 12 }}>
            {item}
          </div>
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 16, lineHeight: 1, padding: '4px' }}>×</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={inp} onChange={e => setInp(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder={placeholder}
          style={{ flex: 1, padding: '7px 10px', fontFamily: 'inherit', fontSize: 12, border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-sm)', outline: 'none' }}
        />
        <button onClick={add} style={{ padding: '7px 14px', borderRadius: 'var(--r-sm)', background: 'var(--c-bg)', border: '1.5px solid var(--c-border)', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>
          + Tambah
        </button>
      </div>
    </div>
  )
}

export default function TagRuleEditor({
  slug, tagId, tagName, initialRule,
}: {
  slug: string; tagId: string; tagName: string; initialRule: TagRule | null
  // slug digunakan untuk IcdSearchInput API call
}) {
  const [rule,    setRule]    = useState<TagRule>(initialRule ?? EMPTY_RULE)
  const [loading, setLoading] = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState('')
  const hasRule = !!initialRule?.id

  function setField<K extends keyof TagRule>(k: K, v: TagRule[K]) {
    setRule(prev => ({ ...prev, [k]: v }))
    setSaved(false)
  }

  async function handleSave() {
    if (!rule.instruksi_ai.trim()) { setError('Instruksi AI wajib diisi.'); return }
    setLoading(true); setError('')
    try {
      const res  = await fetch(`/api/${slug}/tags/${tagId}/rule`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify(rule),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Gagal menyimpan'); return }
      setRule(json.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Hapus aturan AI untuk tag ini?')) return
    await fetch(`/api/${slug}/tags/${tagId}/rule`, { method: 'DELETE' })
    setRule(EMPTY_RULE)
    setSaved(false)
  }

  const sectionStyle: React.CSSProperties = {
    background: 'var(--c-surface)', border: '1px solid var(--c-border)',
    borderRadius: 'var(--r-lg)', padding: 'var(--sp-5)', marginBottom: 'var(--sp-5)',
  }
  const sectionTitle: React.CSSProperties = {
    fontWeight: 700, fontSize: 'var(--font-size-md)', color: 'var(--c-primary)', marginBottom: 'var(--sp-4)',
  }

  return (
    <div>
      {/* Header aturan AI */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-5)', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
        <div>
          <h2 style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)', color: 'var(--c-text)', marginBottom: 4 }}>
            Aturan AI Auto-Tag
          </h2>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
            Tentukan kondisi agar AI otomatis memberi tag <strong>{tagName}</strong> ke pasien berdasarkan riwayat kunjungan.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer' }}>
            <input type="checkbox" checked={rule.aktif} onChange={e => setField('aktif', e.target.checked)} />
            Aturan aktif
          </label>
          {hasRule && (
            <button onClick={handleDelete} style={{ padding: '7px 14px', borderRadius: 'var(--r-sm)', border: '1px solid #EF4444', color: '#EF4444', background: 'transparent', fontFamily: 'inherit', fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer' }}>
              Hapus Aturan
            </button>
          )}
        </div>
      </div>

      {!rule.aktif && (
        <div style={{ background: '#F8FAFC', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', padding: 'var(--sp-4)', marginBottom: 'var(--sp-5)', fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
          Aturan ini dinonaktifkan — AI tidak akan menggunakan aturan ini saat auto-tagging.
        </div>
      )}

      {/* Seksi 1: Kondisi ICD */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>1. Kondisi ICD-10</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)', position: 'relative' }}>
          <IcdSearchInput
            slug={slug}
            label="Kode ICD Pemicu"
            hint="Ketik kode atau nama diagnosa lalu pilih dari daftar. Contoh: E11 atau 'diabetes'."
            chips={rule.icd_codes}
            onChange={v => setField('icd_codes', v)}
            chipColor="#3B82F6"
          />
          <IcdSearchInput
            slug={slug}
            label="Kode ICD Dikecualikan"
            hint="Tag TIDAK diberikan jika diagnosa cocok dengan kode ini."
            chips={rule.icd_exclude}
            onChange={v => setField('icd_exclude', v)}
            chipColor="#EF4444"
          />
        </div>
      </div>

      {/* Seksi 2: Keyword */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>2. Kata Kunci Diagnosa / Tindakan</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
          <ChipInput
            label="Kata kunci yang harus ada"
            hint='AI akan cari kata ini dalam nama diagnosa/tindakan. Ketik lalu Enter.'
            chips={rule.keyword_include}
            onChange={v => setField('keyword_include', v)}
            placeholder="diabetes, insulin..."
            color="#22C55E"
          />
          <ChipInput
            label="Kata kunci yang dikecualikan"
            hint="Tag tidak diberikan jika diagnosa mengandung kata ini."
            chips={rule.keyword_exclude}
            onChange={v => setField('keyword_exclude', v)}
            placeholder="gestasional, sementara..."
            color="#EF4444"
          />
        </div>
      </div>

      {/* Seksi 3: Instruksi AI + Contoh */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>3. Panduan AI (Natural Language)</div>

        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--c-text)', marginBottom: 4 }}>
            Instruksi untuk AI *
          </label>
          <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginBottom: 6 }}>
            Jelaskan dalam bahasa natural kapan tag ini HARUS diberikan. AI (Claude Haiku) akan membaca instruksi ini saat memproses pasien.
          </div>
          <textarea
            value={rule.instruksi_ai}
            onChange={e => setField('instruksi_ai', e.target.value)}
            rows={4}
            placeholder={`Contoh: Berikan tag "${tagName}" untuk pasien yang memiliki riwayat diagnosa diabetes mellitus tipe 1 atau tipe 2 (ICD E10-E11), atau yang sedang menjalani terapi insulin. Jangan berikan tag ini untuk diabetes gestasional (O24).`}
            style={{ width: '100%', padding: '10px 12px', fontFamily: 'inherit', fontSize: 'var(--font-size-sm)', border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-md)', outline: 'none', resize: 'vertical', color: 'var(--c-text)', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
          <TextListInput
            label="Contoh POSITIF (harus dapat tag)"
            hint="Diagnosa yang pasti harus dapat tag ini."
            items={rule.contoh_positif}
            onChange={v => setField('contoh_positif', v)}
            placeholder="Diabetes mellitus tipe 2, tidak terkontrol"
          />
          <TextListInput
            label="Contoh NEGATIF (tidak boleh dapat tag)"
            hint="Diagnosa yang tidak boleh mendapat tag ini."
            items={rule.contoh_negatif}
            onChange={v => setField('contoh_negatif', v)}
            placeholder="Diabetes gestasional pada trimester kedua"
          />
        </div>
      </div>

      {/* Seksi 4: Confidence */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>4. Threshold Confidence</div>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', marginBottom: 'var(--sp-4)' }}>
          AI hanya menerapkan tag jika confidence-nya ≥ threshold ini. Nilai lebih tinggi = lebih ketat, lebih sedikit false positive.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <input
            type="range" min={0.5} max={1.0} step={0.05}
            value={rule.confidence_min}
            onChange={e => setField('confidence_min', parseFloat(e.target.value))}
            style={{ flex: 1 }}
          />
          <div style={{ width: 72, textAlign: 'center', fontWeight: 800, fontSize: 'var(--font-size-xl)', color: 'var(--c-primary)', background: 'var(--c-bg)', border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: '4px 0' }}>
            {Math.round(rule.confidence_min * 100)}%
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--c-text-faint)', marginTop: 4 }}>
          <span>50% — lebih longgar</span>
          <span>80% — disarankan</span>
          <span>100% — sangat ketat</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#FEF2F2', color: '#B91C1C', borderRadius: 'var(--r-sm)', padding: 'var(--sp-3) var(--sp-4)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--sp-4)', borderLeft: '3px solid #EF4444' }}>
          {error}
        </div>
      )}

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', justifyContent: 'flex-end' }}>
        {saved && (
          <span style={{ fontSize: 'var(--font-size-sm)', color: '#22C55E', fontWeight: 600 }}>✓ Aturan tersimpan</span>
        )}
        <button onClick={handleSave} disabled={loading} style={{
          padding: '11px 28px', borderRadius: 'var(--r-md)',
          background: loading ? '#94A3B8' : 'var(--c-secondary)',
          border: 'none', color: 'white',
          fontFamily: 'inherit', fontSize: 'var(--font-size-base)', fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}>
          {loading ? 'Menyimpan...' : hasRule ? 'Perbarui Aturan' : 'Simpan Aturan'}
        </button>
      </div>
    </div>
  )
}
