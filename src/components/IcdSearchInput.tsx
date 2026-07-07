'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface IcdEntry {
  kode:    string
  nama_id: string
  nama:    string
  bab:     string | null
  versi:   string
}

interface IcdSearchInputProps {
  slug:        string
  label:       string
  hint?:       string
  chips:       string[]  // array of kode
  onChange:    (v: string[]) => void
  placeholder?: string
  chipColor?:  string
  versi?:      string    // 'ICD10' | 'ICD11', default 'ICD10'
}

export default function IcdSearchInput({
  slug,
  label,
  hint,
  chips,
  onChange,
  placeholder = 'Ketik kode atau nama diagnosa...',
  chipColor   = '#3B82F6',
  versi       = 'ICD10',
}: IcdSearchInputProps) {
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState<IcdEntry[]>([])
  const [loading,  setLoading]  = useState(false)
  const [open,     setOpen]     = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef     = useRef<HTMLDivElement>(null)

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return }
    setLoading(true)
    try {
      const res  = await fetch(`/api/${slug}/icd?q=${encodeURIComponent(q)}&versi=${versi}&limit=10`)
      const json = await res.json()
      setResults(json.data ?? [])
      setOpen(true)
    } finally {
      setLoading(false)
    }
  }, [slug, versi])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, search])

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  function addChip(entry: IcdEntry) {
    if (!chips.includes(entry.kode)) onChange([...chips, entry.kode])
    setQuery('')
    setResults([])
    setOpen(false)
  }

  function addManual() {
    const v = query.trim().toUpperCase()
    if (v && !chips.includes(v)) onChange([...chips, v])
    setQuery('')
    setResults([])
    setOpen(false)
  }

  function removeChip(kode: string) {
    onChange(chips.filter(c => c !== kode))
  }

  return (
    <div style={{ marginBottom: 'var(--sp-4)' }} ref={wrapRef}>
      <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--c-text)', marginBottom: 4 }}>
        {label}
      </label>
      {hint && (
        <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginBottom: 6 }}>{hint}</div>
      )}

      {/* Chip container + input */}
      <div style={{
        minHeight: 42, background: 'var(--c-bg)', border: '1.5px solid var(--c-border)',
        borderRadius: 'var(--r-md)', padding: '6px 10px',
        display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
      }}>
        {chips.map(kode => (
          <span key={kode} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: chipColor + '18', border: `1px solid ${chipColor}`,
            borderRadius: 20, padding: '2px 10px',
            fontSize: 12, fontWeight: 700, color: chipColor,
          }}>
            {kode}
            <span
              onClick={() => removeChip(kode)}
              style={{ cursor: 'pointer', fontSize: 14, lineHeight: 1, color: chipColor, opacity: 0.6, marginLeft: 2 }}
            >×</span>
          </span>
        ))}
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); if (!e.target.value) setOpen(false) }}
          onKeyDown={e => {
            if ((e.key === 'Enter' || e.key === ',') && query.trim()) {
              e.preventDefault()
              if (results.length > 0) addChip(results[0])
              else addManual()
            }
          }}
          placeholder={chips.length === 0 ? placeholder : ''}
          style={{
            border: 'none', outline: 'none', background: 'transparent',
            fontFamily: 'inherit', fontSize: 12, minWidth: 120, flex: 1,
          }}
        />
        {loading && (
          <span style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>...</span>
        )}
      </div>

      {/* Dropdown hasil pencarian */}
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', zIndex: 999,
          background: 'var(--c-surface)', border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-md)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          maxHeight: 280, overflowY: 'auto', width: 420,
          marginTop: 4,
        }}>
          {results.map((entry, i) => {
            const already = chips.includes(entry.kode)
            return (
              <div
                key={entry.kode}
                onClick={() => !already && addChip(entry)}
                style={{
                  padding: '9px 14px',
                  borderBottom: i < results.length - 1 ? '1px solid var(--c-border)' : 'none',
                  cursor: already ? 'default' : 'pointer',
                  background: already ? 'var(--c-bg)' : 'transparent',
                  opacity: already ? 0.5 : 1,
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}
                onMouseEnter={e => { if (!already) (e.currentTarget as HTMLDivElement).style.background = 'var(--c-bg)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = already ? 'var(--c-bg)' : 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontFamily: 'monospace', fontWeight: 700, fontSize: 12,
                    color: chipColor, background: chipColor + '15',
                    padding: '1px 7px', borderRadius: 4,
                  }}>
                    {entry.kode}
                  </span>
                  {already && (
                    <span style={{ fontSize: 10, color: 'var(--c-text-faint)' }}>✓ sudah ditambahkan</span>
                  )}
                  <span style={{
                    marginLeft: 'auto', fontSize: 10,
                    color: entry.versi === 'ICD11' ? '#7C3AED' : 'var(--c-text-faint)',
                    fontWeight: 600,
                  }}>
                    {entry.versi}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--c-text)', fontWeight: 500 }}>
                  {entry.nama_id}
                </div>
                {entry.bab && (
                  <div style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>{entry.bab}</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Fallback: tambah manual jika tidak ada hasil */}
      {query.trim().length >= 2 && !loading && results.length === 0 && open && (
        <div style={{
          position: 'absolute', zIndex: 999,
          background: 'var(--c-surface)', border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-md)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          padding: '10px 14px', width: 420, marginTop: 4, fontSize: 13,
          color: 'var(--c-text-muted)',
        }}>
          Tidak ditemukan di library. Tekan{' '}
          <kbd style={{ fontSize: 11, padding: '1px 5px', border: '1px solid var(--c-border)', borderRadius: 3 }}>Enter</kbd>
          {' '}untuk tambahkan kode "<strong>{query.trim().toUpperCase()}</strong>" secara manual.
        </div>
      )}
    </div>
  )
}
