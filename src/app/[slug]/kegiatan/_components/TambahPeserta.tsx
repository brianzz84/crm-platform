'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface TambahPesertaProps {
  slug:       string
  kegiatanId: string
}

interface Found {
  found:         true
  sudah_daftar:  boolean
  person: {
    id:             string
    name:           string
    no_hp:          string
    total_kegiatan: number
  }
}

export default function TambahPeserta({ slug, kegiatanId }: TambahPesertaProps) {
  const router  = useRouter()
  const timer   = useRef<ReturnType<typeof setTimeout>>()
  const [noHp,    setNoHp]    = useState('')
  const [result,  setResult]  = useState<Found | { found: false } | null>(null)
  const [loading, setLoading] = useState(false)
  const [adding,  setAdding]  = useState(false)
  const [msg,     setMsg]     = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  function handleChange(val: string) {
    setNoHp(val)
    setResult(null)
    setMsg(null)
    clearTimeout(timer.current)
    const digits = val.replace(/\D/g, '')
    if (digits.length < 8) return
    setLoading(true)
    timer.current = setTimeout(async () => {
      const res  = await fetch(`/api/${slug}/kegiatan/${kegiatanId}/peserta?no_hp=${encodeURIComponent(digits)}`)
      const json = await res.json()
      setResult(json)
      setLoading(false)
    }, 500)
  }

  async function handleTambah(personId: string) {
    setAdding(true)
    const res  = await fetch(`/api/${slug}/kegiatan/${kegiatanId}/peserta`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ person_id: personId }),
    })
    const json = await res.json()
    setAdding(false)
    if (!res.ok) {
      setMsg({ type: 'err', text: json.error || 'Gagal menambahkan' })
    } else {
      setMsg({ type: 'ok', text: 'Peserta berhasil ditambahkan' })
      setNoHp('')
      setResult(null)
      router.refresh()
    }
  }

  const inp: React.CSSProperties = {
    display: 'block', width: '100%', padding: '9px 12px',
    fontFamily: 'inherit', fontSize: 'var(--font-size-sm)',
    border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-md)',
    color: 'var(--c-text)', background: 'white', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ background: 'white', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)', padding: 'var(--sp-5)', marginBottom: 'var(--sp-5)' }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--c-text)', marginBottom: 'var(--sp-4)' }}>
        Tambah Peserta
      </div>

      {msg && (
        <div style={{
          background: msg.type === 'ok' ? '#F0FDF4' : '#FEF2F2',
          color:      msg.type === 'ok' ? '#166534'  : '#B91C1C',
          borderLeft: `3px solid ${msg.type === 'ok' ? '#22C55E' : '#EF4444'}`,
          padding: 'var(--sp-3) var(--sp-4)', borderRadius: 'var(--r-sm)',
          fontSize: 'var(--font-size-sm)', marginBottom: 'var(--sp-4)',
        }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 6, color: 'var(--c-text)' }}>
            Cari Pasien by Nomor HP
          </label>
          <input
            style={inp}
            value={noHp}
            onChange={e => handleChange(e.target.value)}
            placeholder="08xx-xxxx-xxxx"
            autoComplete="off"
          />
          <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 4 }}>
            Ketik nomor HP — sistem akan mencari otomatis
          </div>
        </div>
        <a
          href={`/${slug}/pasien/baru`}
          style={{
            padding: '9px 16px', background: 'var(--c-bg)',
            border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-md)',
            fontSize: 'var(--font-size-sm)', fontWeight: 600,
            color: 'var(--c-text)', textDecoration: 'none', whiteSpace: 'nowrap',
          }}
        >
          + Input Pasien Baru
        </a>
      </div>

      {/* Hasil pencarian */}
      {loading && (
        <div style={{ marginTop: 'var(--sp-4)', fontSize: 'var(--font-size-sm)', color: 'var(--c-text-faint)' }}>
          Mencari...
        </div>
      )}

      {result && !loading && (
        <div style={{ marginTop: 'var(--sp-4)' }}>
          {!result.found ? (
            <div style={{
              background: '#EFF6FF', color: '#1E40AF', padding: 'var(--sp-3) var(--sp-4)',
              borderRadius: 'var(--r-sm)', fontSize: 'var(--font-size-sm)',
              borderLeft: '3px solid #3B82F6',
            }}>
              Nomor tidak ditemukan di database.{' '}
              <a href={`/${slug}/pasien/baru`} style={{ fontWeight: 600, color: '#1E40AF' }}>
                Klik untuk input pasien baru
              </a>
            </div>
          ) : result.sudah_daftar ? (
            <div style={{
              background: '#FEF9C3', color: '#854D0E', padding: 'var(--sp-3) var(--sp-4)',
              borderRadius: 'var(--r-sm)', fontSize: 'var(--font-size-sm)',
              borderLeft: '3px solid #EAB308',
            }}>
              <strong>{result.person.name}</strong> sudah terdaftar di kegiatan ini.
            </div>
          ) : (
            <div style={{
              background: 'var(--c-bg)', borderRadius: 'var(--r-md)',
              border: '1px solid var(--c-border)', padding: 'var(--sp-4)',
              display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--c-text)', marginBottom: 4 }}>
                  {result.person.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>
                  {result.person.no_hp}
                  {' · '}
                  <span style={{ color: 'var(--c-secondary)', fontWeight: 600 }}>
                    {result.person.total_kegiatan}× kegiatan
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <button
                  onClick={() => handleTambah(result.person.id)}
                  disabled={adding}
                  style={{
                    padding: '8px 16px', background: 'var(--c-secondary)', color: 'white',
                    border: 'none', borderRadius: 'var(--r-md)', fontFamily: 'inherit',
                    fontSize: 'var(--font-size-sm)', fontWeight: 600,
                    cursor: adding ? 'not-allowed' : 'pointer',
                    opacity: adding ? 0.6 : 1,
                  }}
                >
                  {adding ? 'Menambahkan...' : 'Tambahkan ke Kegiatan'}
                </button>
                <a
                  href={`/${slug}/pasien/${result.person.id}`}
                  style={{
                    padding: '8px 14px', border: '1.5px solid var(--c-border)',
                    borderRadius: 'var(--r-md)', fontSize: 'var(--font-size-sm)',
                    color: 'var(--c-text)', textDecoration: 'none',
                  }}
                >
                  Lihat Detail
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
