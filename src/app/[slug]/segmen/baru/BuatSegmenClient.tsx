'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import IcdSearchInput from '@/components/IcdSearchInput'

interface SimrsParams {
  units:        string[]
  icdCodes:     string[]
  periodeAwal?: string
  periodeAkhir?:string
  poli?:        string
  extraFilter?: string
}

interface SearchResult {
  persons:    { id: string; name: string; no_hp: string; no_rm: string }[]
  total:      number
  person_ids: string[]
}

type Stage = 'nlp' | 'params' | 'hasil' | 'simpan' | 'done'

const UNIT_LABELS: Record<string, string> = {
  RAWAT_JALAN: 'Rawat Jalan',
  RAWAT_INAP:  'Rawat Inap',
  PENUNJANG:   'Penunjang',
}
const ALL_UNITS = ['RAWAT_JALAN', 'RAWAT_INAP', 'PENUNJANG']

export default function BuatSegmenClient({ slug }: { slug: string }) {
  const router = useRouter()

  const [stage, setStage]         = useState<Stage>('nlp')
  const [query, setQuery]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  const [nlpResult, setNlpResult] = useState<{ params: SimrsParams; penjelasan: string } | null>(null)
  const [params, setParams]       = useState<SimrsParams>({ units: [], icdCodes: [] })
  // icdInput hanya digunakan untuk sync dari NLP result ke chips
  const [, setIcdInput]   = useState('')

  const [searchResult, setSearchResult] = useState<SearchResult | null>(null)

  const [namaSegmen, setNamaSegmen]   = useState('')
  const [deskripsi, setDeskripsi]     = useState('')
  const [saving, setSaving]           = useState(false)

  async function handleNlp() {
    if (!query.trim()) return
    setLoading(true)
    setError('')
    try {
      const res  = await fetch(`/api/${slug}/segmen/nlp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memproses query')
      setNlpResult(json.data)
      setParams(json.data.params)
      setIcdInput(json.data.params.icdCodes.join(', '))  // hanya untuk referensi, chips sudah masuk params
      setStage('params')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSearch() {
    setLoading(true)
    setError('')
    try {
      const res  = await fetch(`/api/${slug}/segmen/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal mencari pasien')
      setSearchResult(json.data)
      setStage('hasil')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSimpan() {
    if (!namaSegmen.trim() || !searchResult) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/${slug}/segmen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama:         namaSegmen.trim(),
          deskripsi:    deskripsi.trim() || undefined,
          nlp_query:    query,
          simrs_params: params,
          person_ids:   searchResult.person_ids,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal menyimpan segmen')
      setStage('done')
      setTimeout(() => router.push(`/${slug}/segmen`), 1500)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function toggleUnit(unit: string) {
    setParams(p => ({
      ...p,
      units: p.units.includes(unit) ? p.units.filter(u => u !== unit) : [...p.units, unit],
    }))
  }

const stepNum = { nlp: 1, params: 2, hasil: 3, simpan: 4, done: 4 }[stage]

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Stepper */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 'var(--sp-8)', alignItems: 'center' }}>
        {['Deskripsi', 'Review Parameter', 'Hasil Pencarian', 'Simpan'].map((label, i) => {
          const n       = i + 1
          const active  = n === stepNum
          const done    = n < stepNum
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 'var(--font-size-sm)',
                  background: done ? 'var(--c-success)' : active ? 'var(--c-secondary)' : 'var(--c-border)',
                  color: (done || active) ? 'white' : 'var(--c-text-muted)',
                }}>
                  {done ? '✓' : n}
                </div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: active ? 'var(--c-secondary)' : 'var(--c-text-muted)', fontWeight: active ? 600 : 400, whiteSpace: 'nowrap' }}>
                  {label}
                </span>
              </div>
              {i < 3 && <div style={{ flex: 0, width: 40, height: 2, background: done ? 'var(--c-success)' : 'var(--c-border)', marginBottom: 20 }} />}
            </div>
          )
        })}
      </div>

      {error && (
        <div style={{ background: 'var(--c-error-light)', border: '1px solid var(--c-error)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', marginBottom: 'var(--sp-4)', color: 'var(--c-error)', fontSize: 'var(--font-size-sm)' }}>
          {error}
        </div>
      )}

      {/* Stage 1: NLP Input */}
      {stage === 'nlp' && (
        <div style={{ background: 'var(--c-surface)', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)', padding: 'var(--sp-6)' }}>
          <h2 style={{ fontWeight: 700, marginBottom: 8, color: 'var(--c-text)' }}>Deskripsikan target pasien</h2>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', marginBottom: 'var(--sp-4)' }}>
            Gunakan bahasa natural. AI akan menerjemahkan ke parameter pencarian.
          </p>
          <div style={{ marginBottom: 'var(--sp-3)', fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)' }}>
            Contoh: "pasien diabetes rawat inap 3 bulan terakhir" atau "pasien poli jantung yang belum kontrol 6 bulan"
          </div>
          <textarea
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleNlp())}
            placeholder="Ketik deskripsi pasien yang ingin di-segmentasi..."
            rows={4}
            style={{
              width: '100%', padding: 'var(--sp-3)', borderRadius: 'var(--r-md)',
              border: '1px solid var(--c-border)', fontSize: 'var(--font-size-sm)',
              fontFamily: 'var(--font-family)', resize: 'vertical',
              background: 'var(--c-bg)', color: 'var(--c-text)',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--sp-4)' }}>
            <button
              onClick={handleNlp}
              disabled={loading || !query.trim()}
              style={{
                padding: '10px 24px', borderRadius: 'var(--r-md)',
                background: query.trim() ? 'var(--c-secondary)' : 'var(--c-border)',
                color: query.trim() ? 'white' : 'var(--c-text-muted)',
                fontWeight: 600, border: 'none', cursor: query.trim() ? 'pointer' : 'default',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              {loading ? 'Memproses...' : 'Analisa dengan AI →'}
            </button>
          </div>
        </div>
      )}

      {/* Stage 2: Review params */}
      {stage === 'params' && nlpResult && (
        <div style={{ background: 'var(--c-surface)', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)', padding: 'var(--sp-6)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
          <div>
            <h2 style={{ fontWeight: 700, marginBottom: 8, color: 'var(--c-text)' }}>Review Parameter Pencarian</h2>
            <div style={{ background: 'var(--c-primary-xlight)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', fontSize: 'var(--font-size-sm)', color: 'var(--c-primary)', borderLeft: '3px solid var(--c-primary)' }}>
              <strong>AI:</strong> {nlpResult.penjelasan}
            </div>
          </div>

          {/* Unit */}
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 8 }}>Unit Layanan</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ALL_UNITS.map(u => (
                <button
                  key={u}
                  onClick={() => toggleUnit(u)}
                  style={{
                    padding: '6px 14px', borderRadius: 'var(--r-md)', border: '2px solid',
                    borderColor: params.units.includes(u) ? 'var(--c-secondary)' : 'var(--c-border)',
                    background: params.units.includes(u) ? 'var(--c-secondary)' : 'transparent',
                    color: params.units.includes(u) ? 'white' : 'var(--c-text)',
                    fontWeight: 600, fontSize: 'var(--font-size-sm)', cursor: 'pointer',
                  }}
                >
                  {UNIT_LABELS[u]}
                </button>
              ))}
            </div>
            {params.units.length === 0 && (
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', marginTop: 4 }}>Tidak dipilih = semua unit</p>
            )}
          </div>

          {/* ICD Codes */}
          <div style={{ position: 'relative' }}>
            <IcdSearchInput
              slug={slug}
              label="Kode ICD-10"
              hint="Ketik kode atau nama penyakit — pilih dari daftar INA-CBGs."
              chips={params.icdCodes}
              onChange={codes => setParams(p => ({ ...p, icdCodes: codes }))}
              chipColor="#0089A8"
            />
          </div>

          {/* Periode */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 8 }}>Dari Tanggal</label>
              <input
                type="date"
                value={params.periodeAwal || ''}
                onChange={e => setParams(p => ({ ...p, periodeAwal: e.target.value || undefined }))}
                style={{ width: '100%', padding: 'var(--sp-2) var(--sp-3)', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)', fontSize: 'var(--font-size-sm)', background: 'var(--c-bg)', color: 'var(--c-text)', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 8 }}>Sampai Tanggal</label>
              <input
                type="date"
                value={params.periodeAkhir || ''}
                onChange={e => setParams(p => ({ ...p, periodeAkhir: e.target.value || undefined }))}
                style={{ width: '100%', padding: 'var(--sp-2) var(--sp-3)', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)', fontSize: 'var(--font-size-sm)', background: 'var(--c-bg)', color: 'var(--c-text)', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Poli */}
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 8 }}>Poli / Spesialisasi (opsional)</label>
            <input
              value={params.poli || ''}
              onChange={e => setParams(p => ({ ...p, poli: e.target.value || undefined }))}
              placeholder="mis: Poli Jantung, Poli Penyakit Dalam"
              style={{ width: '100%', padding: 'var(--sp-2) var(--sp-3)', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)', fontSize: 'var(--font-size-sm)', background: 'var(--c-bg)', color: 'var(--c-text)', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 'var(--sp-3)', borderTop: '1px solid var(--c-border)' }}>
            <button
              onClick={() => setStage('nlp')}
              style={{ padding: '8px 16px', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)', background: 'transparent', cursor: 'pointer', fontSize: 'var(--font-size-sm)' }}
            >
              ← Kembali
            </button>
            <button
              onClick={handleSearch}
              disabled={loading}
              style={{ padding: '10px 24px', borderRadius: 'var(--r-md)', background: 'var(--c-secondary)', color: 'white', fontWeight: 600, border: 'none', cursor: 'pointer', fontSize: 'var(--font-size-sm)' }}
            >
              {loading ? 'Mencari...' : 'Konfirmasi & Cari Pasien →'}
            </button>
          </div>
        </div>
      )}

      {/* Stage 3: Hasil */}
      {stage === 'hasil' && searchResult && (
        <div style={{ background: 'var(--c-surface)', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)', padding: 'var(--sp-6)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
          <div>
            <h2 style={{ fontWeight: 700, marginBottom: 8, color: 'var(--c-text)' }}>Hasil Pencarian</h2>
            <div style={{ background: searchResult.total > 0 ? 'var(--c-success-light)' : 'var(--c-error-light)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', fontSize: 'var(--font-size-sm)' }}>
              Ditemukan <strong>{searchResult.total} pasien</strong> yang sesuai parameter.
              {searchResult.total > 50 && ` (menampilkan 50 dari ${searchResult.total})`}
            </div>
          </div>

          {searchResult.persons.length > 0 && (
            <div style={{ maxHeight: 300, overflowY: 'auto', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
                <thead>
                  <tr style={{ background: 'var(--c-bg)', position: 'sticky', top: 0 }}>
                    {['Nama', 'No. HP', 'No. RM'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--c-text-muted)', borderBottom: '1px solid var(--c-border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {searchResult.persons.map((p, i) => (
                    <tr key={p.id} style={{ borderBottom: i < searchResult.persons.length - 1 ? '1px solid var(--c-border)' : 'none' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 500 }}>{p.name}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--c-text-muted)' }}>{p.no_hp || '-'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--c-text-muted)' }}>{p.no_rm || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button
              onClick={() => setStage('params')}
              style={{ padding: '8px 16px', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)', background: 'transparent', cursor: 'pointer', fontSize: 'var(--font-size-sm)' }}
            >
              ← Ubah Parameter
            </button>
            <button
              onClick={() => setStage('simpan')}
              disabled={searchResult.total === 0}
              style={{
                padding: '10px 24px', borderRadius: 'var(--r-md)',
                background: searchResult.total > 0 ? 'var(--c-secondary)' : 'var(--c-border)',
                color: searchResult.total > 0 ? 'white' : 'var(--c-text-muted)',
                fontWeight: 600, border: 'none', cursor: searchResult.total > 0 ? 'pointer' : 'default',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              Beri Nama Segmen →
            </button>
          </div>
        </div>
      )}

      {/* Stage 4: Simpan */}
      {stage === 'simpan' && searchResult && (
        <div style={{ background: 'var(--c-surface)', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)', padding: 'var(--sp-6)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
          <div>
            <h2 style={{ fontWeight: 700, marginBottom: 8, color: 'var(--c-text)' }}>Simpan Segmen</h2>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', background: 'var(--c-bg)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)' }}>
              Segmen akan menyimpan <strong>{searchResult.total} pasien</strong>.
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 8 }}>Nama Segmen <span style={{ color: 'var(--c-error)' }}>*</span></label>
            <input
              value={namaSegmen}
              onChange={e => setNamaSegmen(e.target.value)}
              placeholder="mis: Pasien Diabetes Rawat Inap Q2 2026"
              style={{ width: '100%', padding: 'var(--sp-3)', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)', fontSize: 'var(--font-size-sm)', background: 'var(--c-bg)', color: 'var(--c-text)', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 8 }}>Deskripsi (opsional)</label>
            <textarea
              value={deskripsi}
              onChange={e => setDeskripsi(e.target.value)}
              rows={3}
              placeholder="Catatan tambahan tentang segmen ini..."
              style={{ width: '100%', padding: 'var(--sp-3)', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)', fontSize: 'var(--font-size-sm)', fontFamily: 'var(--font-family)', resize: 'vertical', background: 'var(--c-bg)', color: 'var(--c-text)', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button
              onClick={() => setStage('hasil')}
              style={{ padding: '8px 16px', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)', background: 'transparent', cursor: 'pointer', fontSize: 'var(--font-size-sm)' }}
            >
              ← Kembali
            </button>
            <button
              onClick={handleSimpan}
              disabled={saving || !namaSegmen.trim()}
              style={{
                padding: '10px 24px', borderRadius: 'var(--r-md)',
                background: namaSegmen.trim() ? 'var(--c-secondary)' : 'var(--c-border)',
                color: namaSegmen.trim() ? 'white' : 'var(--c-text-muted)',
                fontWeight: 600, border: 'none', cursor: namaSegmen.trim() ? 'pointer' : 'default',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              {saving ? 'Menyimpan...' : 'Simpan Segmen'}
            </button>
          </div>
        </div>
      )}

      {/* Stage done */}
      {stage === 'done' && (
        <div style={{ background: 'var(--c-surface)', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)', padding: 'var(--sp-10)', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
          <h2 style={{ fontWeight: 700, color: 'var(--c-success)', marginBottom: 8 }}>Segmen berhasil disimpan!</h2>
          <p style={{ color: 'var(--c-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            Mengalihkan ke daftar segmen...
          </p>
        </div>
      )}
    </div>
  )
}
