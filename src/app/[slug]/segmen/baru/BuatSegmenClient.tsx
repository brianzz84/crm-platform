'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import IcdSearchInput from '@/components/IcdSearchInput'

type Mode = 'ai' | 'filter' | 'tag' | 'manual'

interface FilterForm {
  units:           string[]
  icdCodes:        string[]
  periodeAwal?:    string
  periodeAkhir?:   string
  poli?:           string
  jenisPembayaran?: string
}
interface SearchResult {
  persons:    { id: string; name: string; no_hp: string | null; no_rm: string | null }[]
  total:      number
  person_ids: string[]
}
interface TagItem { id: string; name: string; warna: string; total_pasien: number; aktif: boolean }
interface PersonRow { id: string; name: string; no_hp: string | null; no_rm: string | null }

const UNIT_LABELS: Record<string, string> = { RAWAT_JALAN: 'Rawat Jalan', RAWAT_INAP: 'Rawat Inap', PENUNJANG: 'Penunjang' }
const ALL_UNITS = ['RAWAT_JALAN', 'RAWAT_INAP', 'PENUNJANG']

const MODES: { key: Mode; icon: string; label: string; desc: string }[] = [
  { key: 'ai',     icon: '🤖', label: 'Dengan AI',     desc: 'Ketik bahasa natural, AI ekstrak filter' },
  { key: 'filter', icon: '🎛️', label: 'Filter Manual', desc: 'Pilih unit, diagnosa, periode sendiri' },
  { key: 'tag',    icon: '🏷️', label: 'Berdasarkan Tag', desc: 'Pasien yang punya tag tertentu' },
  { key: 'manual', icon: '👤', label: 'Pilih Manual',  desc: 'Cari & centang pasien satu per satu' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: 'var(--sp-2) var(--sp-3)', borderRadius: 'var(--r-md)',
  border: '1px solid var(--c-border)', fontSize: 'var(--font-size-sm)',
  background: 'var(--c-bg)', color: 'var(--c-text)', boxSizing: 'border-box',
}
const cardStyle: React.CSSProperties = {
  background: 'var(--c-surface)', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)',
  padding: 'var(--sp-6)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)',
}
const btnPrimary = (enabled: boolean): React.CSSProperties => ({
  padding: '10px 24px', borderRadius: 'var(--r-md)',
  background: enabled ? 'var(--c-secondary)' : 'var(--c-border)',
  color: enabled ? 'white' : 'var(--c-text-muted)',
  fontWeight: 600, border: 'none', cursor: enabled ? 'pointer' : 'default', fontSize: 'var(--font-size-sm)',
})

export default function BuatSegmenClient({ slug }: { slug: string }) {
  const router = useRouter()

  const [mode, setMode]       = useState<Mode | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  // AI
  const [query, setQuery]       = useState('')
  const [penjelasan, setPenjelasan] = useState('')

  // AI + Filter
  const [form, setForm] = useState<FilterForm>({ units: [], icdCodes: [] })

  // Tag
  const [tags, setTags]         = useState<TagItem[]>([])
  const [tagIds, setTagIds]     = useState<string[]>([])

  // Manual
  const [pquery, setPquery]     = useState('')
  const [presults, setPresults] = useState<PersonRow[]>([])
  const [selected, setSelected] = useState<Record<string, PersonRow>>({})

  // Preview + save
  const [result, setResult]   = useState<SearchResult | null>(null)
  const [nama, setNama]       = useState('')
  const [deskripsi, setDesk]  = useState('')
  const [saving, setSaving]   = useState(false)
  const [done, setDone]       = useState(false)

  // Muat tag saat mode tag dipilih
  useEffect(() => {
    if (mode === 'tag' && tags.length === 0) {
      fetch(`/api/${slug}/tags`).then(r => r.json()).then(j => {
        if (j.success) setTags(j.data.filter((t: TagItem) => t.aktif))
      }).catch(() => {})
    }
  }, [mode, slug, tags.length])

  function resetForMode(m: Mode) {
    setMode(m); setError(''); setResult(null); setPenjelasan('')
    setForm({ units: [], icdCodes: [] }); setTagIds([]); setSelected({}); setPresults([]); setPquery(''); setQuery('')
  }

  function buildFilterDef(): any {
    if (mode === 'tag') return { tagIds }
    // ai + filter
    return {
      units: form.units, icdCodes: form.icdCodes,
      periodeAwal: form.periodeAwal, periodeAkhir: form.periodeAkhir,
      poli: form.poli, jenisPembayaran: form.jenisPembayaran,
    }
  }

  async function handleNlp() {
    if (!query.trim()) return
    setLoading(true); setError('')
    try {
      const res  = await fetch(`/api/${slug}/segmen/nlp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memproses query')
      const p = json.data.params
      setForm({ units: p.units || [], icdCodes: p.icdCodes || [], periodeAwal: p.periodeAwal || undefined, periodeAkhir: p.periodeAkhir || undefined, poli: p.poli || undefined })
      setPenjelasan(json.data.penjelasan || '')
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }

  async function handleSearch() {
    setLoading(true); setError('')
    try {
      const res  = await fetch(`/api/${slug}/segmen/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildFilterDef()),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal mencari pasien')
      setResult(json.data)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }

  const searchPersons = useCallback(async () => {
    if (!pquery.trim()) return
    setLoading(true); setError('')
    try {
      const res  = await fetch(`/api/${slug}/pasien?q=${encodeURIComponent(pquery.trim())}&per_page=25`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal mencari')
      setPresults((json.data || []).map((p: any) => ({ id: p.id, name: p.name, no_hp: p.no_hp, no_rm: p.no_rm })))
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [pquery, slug])

  async function handleSave() {
    const personIds = mode === 'manual' ? Object.keys(selected) : result?.person_ids
    if (!nama.trim() || !personIds?.length) return
    setSaving(true); setError('')
    const tipe = mode === 'ai' ? 'AI' : mode === 'filter' ? 'FILTER' : mode === 'tag' ? 'TAG' : 'MANUAL'
    try {
      const res = await fetch(`/api/${slug}/segmen`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: nama.trim(),
          deskripsi: deskripsi.trim() || undefined,
          tipe,
          nlp_query: mode === 'ai' ? query : undefined,
          filter_def: mode === 'manual' ? undefined : buildFilterDef(),
          person_ids: personIds,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal menyimpan segmen')
      setDone(true)
      setTimeout(() => router.push(`/${slug}/segmen`), 1400)
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  function toggleUnit(u: string) {
    setForm(f => ({ ...f, units: f.units.includes(u) ? f.units.filter(x => x !== u) : [...f.units, u] }))
  }
  function toggleTag(id: string) {
    setTagIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  }
  function togglePerson(p: PersonRow) {
    setSelected(s => { const n = { ...s }; if (n[p.id]) delete n[p.id]; else n[p.id] = p; return n })
  }

  const selectedCount = Object.keys(selected).length
  const canSave = !!nama.trim() && (mode === 'manual' ? selectedCount > 0 : (result?.total ?? 0) > 0)

  if (done) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ ...cardStyle, padding: 'var(--sp-10)', textAlign: 'center', alignItems: 'center' }}>
          <div style={{ fontSize: 48 }}>✓</div>
          <h2 style={{ fontWeight: 700, color: 'var(--c-success)' }}>Segmen berhasil disimpan!</h2>
          <p style={{ color: 'var(--c-text-muted)', fontSize: 'var(--font-size-sm)' }}>Mengalihkan ke daftar segmen...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>

      {/* Pilih metode */}
      <div>
        <label style={{ display: 'block', fontWeight: 700, fontSize: 'var(--font-size-sm)', marginBottom: 'var(--sp-3)' }}>Metode Pembuatan Segmen</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--sp-3)' }}>
          {MODES.map(m => {
            const active = mode === m.key
            return (
              <button key={m.key} onClick={() => resetForMode(m.key)} style={{
                textAlign: 'left', padding: 'var(--sp-4)', borderRadius: 'var(--r-md)', cursor: 'pointer',
                border: '2px solid', borderColor: active ? 'var(--c-secondary)' : 'var(--c-border)',
                background: active ? 'var(--c-primary-xlight)' : 'var(--c-surface)',
              }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{m.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: active ? 'var(--c-secondary)' : 'var(--c-text)' }}>{m.label}</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', marginTop: 2 }}>{m.desc}</div>
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <div style={{ background: 'var(--c-error-light)', border: '1px solid var(--c-error)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', color: 'var(--c-error)', fontSize: 'var(--font-size-sm)' }}>{error}</div>
      )}

      {/* ── AI: input NLP ── */}
      {mode === 'ai' && (
        <div style={cardStyle}>
          <div>
            <h2 style={{ fontWeight: 700, marginBottom: 8 }}>Deskripsikan target pasien</h2>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>Contoh: "pasien diabetes rawat inap 3 bulan terakhir". AI hanya menerjemahkan ke filter — bisa kamu koreksi di bawah.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleNlp())}
              placeholder="Ketik deskripsi pasien..." style={inputStyle} />
            <button onClick={handleNlp} disabled={loading || !query.trim()} style={{ ...btnPrimary(!!query.trim()), whiteSpace: 'nowrap' }}>
              {loading ? '...' : 'Analisa AI'}
            </button>
          </div>
          {penjelasan && (
            <div style={{ background: 'var(--c-primary-xlight)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', fontSize: 'var(--font-size-sm)', color: 'var(--c-primary)', borderLeft: '3px solid var(--c-primary)' }}>
              <strong>AI:</strong> {penjelasan}
            </div>
          )}
        </div>
      )}

      {/* ── AI (setelah analisa) + Filter: form filter ── */}
      {((mode === 'ai' && penjelasan) || mode === 'filter') && (
        <div style={cardStyle}>
          <h2 style={{ fontWeight: 700 }}>{mode === 'ai' ? 'Review & Koreksi Filter' : 'Filter Pencarian'}</h2>

          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 8 }}>Unit Layanan</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ALL_UNITS.map(u => (
                <button key={u} onClick={() => toggleUnit(u)} style={{
                  padding: '6px 14px', borderRadius: 'var(--r-md)', border: '2px solid',
                  borderColor: form.units.includes(u) ? 'var(--c-secondary)' : 'var(--c-border)',
                  background: form.units.includes(u) ? 'var(--c-secondary)' : 'transparent',
                  color: form.units.includes(u) ? 'white' : 'var(--c-text)', fontWeight: 600, fontSize: 'var(--font-size-sm)', cursor: 'pointer',
                }}>{UNIT_LABELS[u]}</button>
              ))}
            </div>
            {form.units.length === 0 && <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', marginTop: 4 }}>Tidak dipilih = semua unit</p>}
          </div>

          <IcdSearchInput slug={slug} label="Kode ICD-10" hint="Ketik kode atau nama penyakit."
            chips={form.icdCodes} onChange={codes => setForm(f => ({ ...f, icdCodes: codes }))} chipColor="#0089A8" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 8 }}>Dari Tanggal</label>
              <input type="date" value={form.periodeAwal || ''} onChange={e => setForm(f => ({ ...f, periodeAwal: e.target.value || undefined }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 8 }}>Sampai Tanggal</label>
              <input type="date" value={form.periodeAkhir || ''} onChange={e => setForm(f => ({ ...f, periodeAkhir: e.target.value || undefined }))} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 8 }}>Poli / Spesialisasi</label>
              <input value={form.poli || ''} onChange={e => setForm(f => ({ ...f, poli: e.target.value || undefined }))} placeholder="mis: Poli Jantung" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 8 }}>Pembayaran</label>
              <select value={form.jenisPembayaran || ''} onChange={e => setForm(f => ({ ...f, jenisPembayaran: e.target.value || undefined }))} style={inputStyle}>
                <option value="">Semua</option>
                <option value="TUNAI">Tunai</option>
                <option value="NON_TUNAI">Non-Tunai</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--c-border)', paddingTop: 'var(--sp-3)' }}>
            <button onClick={handleSearch} disabled={loading} style={btnPrimary(true)}>{loading ? 'Mencari...' : 'Cari Pasien →'}</button>
          </div>
        </div>
      )}

      {/* ── Tag ── */}
      {mode === 'tag' && (
        <div style={cardStyle}>
          <h2 style={{ fontWeight: 700 }}>Pilih Tag</h2>
          {tags.length === 0 ? (
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>Belum ada tag aktif. Buat tag dulu di menu Tag.</p>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {tags.map(t => {
                const on = tagIds.includes(t.id)
                return (
                  <button key={t.id} onClick={() => toggleTag(t.id)} style={{
                    padding: '6px 12px', borderRadius: 999, border: '2px solid', cursor: 'pointer',
                    borderColor: on ? t.warna : 'var(--c-border)',
                    background: on ? t.warna : 'transparent', color: on ? 'white' : 'var(--c-text)',
                    fontWeight: 600, fontSize: 'var(--font-size-sm)',
                  }}>{t.name} <span style={{ opacity: 0.7, fontWeight: 400 }}>({t.total_pasien})</span></button>
                )
              })}
            </div>
          )}
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)' }}>Pasien yang punya <strong>salah satu</strong> tag terpilih akan masuk segmen.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--c-border)', paddingTop: 'var(--sp-3)' }}>
            <button onClick={handleSearch} disabled={loading || tagIds.length === 0} style={btnPrimary(tagIds.length > 0)}>{loading ? 'Mencari...' : 'Cari Pasien →'}</button>
          </div>
        </div>
      )}

      {/* ── Manual ── */}
      {mode === 'manual' && (
        <div style={cardStyle}>
          <h2 style={{ fontWeight: 700 }}>Pilih Pasien Manual</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={pquery} onChange={e => setPquery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), searchPersons())}
              placeholder="Cari nama / no HP / no RM..." style={inputStyle} />
            <button onClick={searchPersons} disabled={loading || !pquery.trim()} style={{ ...btnPrimary(!!pquery.trim()), whiteSpace: 'nowrap' }}>{loading ? '...' : 'Cari'}</button>
          </div>

          {presults.length > 0 && (
            <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)' }}>
              {presults.map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--c-border)', cursor: 'pointer', fontSize: 'var(--font-size-sm)' }}>
                  <input type="checkbox" checked={!!selected[p.id]} onChange={() => togglePerson(p)} />
                  <span style={{ fontWeight: 500, flex: 1 }}>{p.name}</span>
                  <span style={{ color: 'var(--c-text-muted)' }}>{p.no_hp || '—'}</span>
                </label>
              ))}
            </div>
          )}

          {selectedCount > 0 && (
            <div style={{ fontSize: 'var(--font-size-sm)', background: 'var(--c-success-light)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)' }}>
              <strong>{selectedCount} pasien</strong> terpilih.
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {Object.values(selected).map(p => (
                  <span key={p.id} onClick={() => togglePerson(p)} style={{ background: 'white', border: '1px solid var(--c-border)', borderRadius: 999, padding: '2px 10px', cursor: 'pointer', fontSize: 'var(--font-size-xs)' }}>
                    {p.name} ✕
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Hasil pencarian (ai/filter/tag) ── */}
      {mode !== 'manual' && result && (
        <div style={cardStyle}>
          <div style={{ background: result.total > 0 ? 'var(--c-success-light)' : 'var(--c-error-light)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', fontSize: 'var(--font-size-sm)' }}>
            Ditemukan <strong>{result.total} pasien</strong>.{result.total > 50 && ` (menampilkan 50 pertama)`}
          </div>
          {result.persons.length > 0 && (
            <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
                <thead><tr style={{ background: 'var(--c-bg)', position: 'sticky', top: 0 }}>
                  {['Nama', 'No. HP', 'No. RM'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--c-text-muted)', borderBottom: '1px solid var(--c-border)' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {result.persons.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--c-border)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 500 }}>{p.name}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--c-text-muted)' }}>{p.no_hp || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--c-text-muted)' }}>{p.no_rm || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Simpan ── */}
      {((mode !== 'manual' && result && result.total > 0) || (mode === 'manual' && selectedCount > 0)) && (
        <div style={cardStyle}>
          <h2 style={{ fontWeight: 700 }}>Simpan Segmen</h2>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', background: 'var(--c-bg)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)' }}>
            Menyimpan <strong>{mode === 'manual' ? selectedCount : result?.total} pasien</strong>.
            {mode !== 'manual' && ' Segmen dinamis — bisa di-refresh untuk perbarui anggota.'}
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 8 }}>Nama Segmen <span style={{ color: 'var(--c-error)' }}>*</span></label>
            <input value={nama} onChange={e => setNama(e.target.value)} placeholder="mis: Pasien Diabetes Q2 2026" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 8 }}>Deskripsi (opsional)</label>
            <textarea value={deskripsi} onChange={e => setDesk(e.target.value)} rows={2} placeholder="Catatan..." style={{ ...inputStyle, fontFamily: 'var(--font-family)', resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleSave} disabled={saving || !canSave} style={btnPrimary(canSave)}>{saving ? 'Menyimpan...' : 'Simpan Segmen'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
