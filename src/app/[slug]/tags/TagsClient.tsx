'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface AliasItem { id: string; alias: string }

interface TagItem {
  id: string
  name: string
  kategori: string | null
  warna: string
  keterangan: string
  aktif: boolean
  created_at: string
  total_pasien: number
  has_rule: boolean
  breakdown: Record<string, number>
  aliases: AliasItem[]
}

const PRESET_COLORS = [
  '#E53935','#D81B60','#8E24AA','#5E35B1','#1E88E5',
  '#00897B','#43A047','#FB8C00','#F4511E','#546E7A',
  '#0089A8','#6D4C41','#00695C','#1565C0','#4527A0',
]

const KATEGORI_PRESET = ['Spesialisasi', 'Tipe Kontak', 'Layanan', 'Ketertarikan']
const KATEGORI_LAINNYA = 'Lainnya'

type ModalMode = 'create' | 'edit' | 'merge' | null

export default function TagsClient({ slug, initialTags }: { slug: string; initialTags: TagItem[] }) {
  const router  = useRouter()
  const [tags,  setTags]  = useState<TagItem[]>(initialTags)
  const [modal, setModal] = useState<ModalMode>(null)
  const [loading, setLoading] = useState(false)
  const [toast,   setToast]   = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  // Form create/edit
  const [editTarget, setEditTarget] = useState<TagItem | null>(null)
  const [fName,     setFName]     = useState('')
  const [fKategori, setFKategori] = useState('')
  const [fKategoriCustom, setFKategoriCustom] = useState(false)
  const [fWarna,    setFWarna]    = useState('#0089A8')
  const [fKet,      setFKet]      = useState('')
  const [similar, setSimilar] = useState<{ id: string; name: string; warna: string; total: number }[]>([])
  const similarTimer = useRef<ReturnType<typeof setTimeout>>()

  // Alias (hanya saat edit — butuh tag id)
  const [aliasInput, setAliasInput] = useState('')
  const [aliasSaving, setAliasSaving] = useState(false)

  // Merge
  const [mergeTarget,  setMergeTarget]  = useState('')
  const [mergeSources, setMergeSources] = useState<Set<string>>(new Set())

  // Filter
  const [filterAktif, setFilterAktif] = useState<'semua' | 'aktif' | 'nonaktif'>('aktif')
  const [search, setSearch] = useState('')

  function showToast(msg: string, type: 'ok' | 'err' = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  function openCreate() {
    setEditTarget(null)
    setFName(''); setFKategori(''); setFKategoriCustom(false); setFWarna('#0089A8'); setFKet('')
    setSimilar([])
    setModal('create')
  }

  function openEdit(t: TagItem) {
    setEditTarget(t)
    setFName(t.name); setFWarna(t.warna); setFKet(t.keterangan)
    const isPreset = !t.kategori || KATEGORI_PRESET.includes(t.kategori)
    setFKategori(t.kategori ?? '')
    setFKategoriCustom(!isPreset)
    setAliasInput('')
    setSimilar([])
    setModal('edit')
  }

  function openMerge() {
    setMergeTarget(''); setMergeSources(new Set())
    setModal('merge')
  }

  function closeModal() {
    setModal(null); setEditTarget(null); setSimilar([])
  }

  // Fuzzy similar check (debounced) — server juga cek kecocokan alias
  async function checkSimilar(name: string) {
    clearTimeout(similarTimer.current)
    if (name.length < 2) { setSimilar([]); return }
    similarTimer.current = setTimeout(async () => {
      const res  = await fetch(`/api/${slug}/tags/new?similar=${encodeURIComponent(name)}`)
      const json = await res.json()
      setSimilar(json.data ?? [])
    }, 380)
  }

  async function handleSave() {
    if (!fName.trim()) { showToast('Nama tag wajib diisi', 'err'); return }
    setLoading(true)
    try {
      const isEdit = modal === 'edit' && editTarget
      const url    = isEdit ? `/api/${slug}/tags/${editTarget.id}` : `/api/${slug}/tags`
      const method = isEdit ? 'PATCH' : 'POST'
      const res  = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fName.trim(), warna: fWarna, keterangan: fKet.trim() || null,
          kategori: fKategori.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { showToast(json.error || 'Gagal menyimpan', 'err'); return }
      showToast(isEdit ? 'Tag diperbarui.' : 'Tag baru ditambahkan.')
      router.refresh()
      if (isEdit) {
        setTags(prev => prev.map(t => t.id === editTarget.id
          ? { ...t, name: fName.trim(), warna: fWarna, keterangan: fKet.trim(), kategori: fKategori.trim() || null }
          : t))
        closeModal()
      } else {
        const newTag: TagItem = { ...json.data, total_pasien: 0, has_rule: false, breakdown: {}, keterangan: fKet.trim(), aliases: [] }
        setTags(prev => [newTag, ...prev])
        closeModal()
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleAktif(t: TagItem) {
    const res  = await fetch(`/api/${slug}/tags/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aktif: !t.aktif }),
    })
    if (res.ok) {
      setTags(prev => prev.map(x => x.id === t.id ? { ...x, aktif: !t.aktif } : x))
      showToast(t.aktif ? 'Tag dinonaktifkan.' : 'Tag diaktifkan.')
    }
  }

  async function handleAddAlias() {
    if (!editTarget || !aliasInput.trim()) return
    setAliasSaving(true)
    try {
      const res  = await fetch(`/api/${slug}/tags/${editTarget.id}/alias`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: aliasInput.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { showToast(json.error || 'Gagal menambah alias', 'err'); return }
      const updated = { ...editTarget, aliases: [...editTarget.aliases, json.data].sort((a, b) => a.alias.localeCompare(b.alias)) }
      setEditTarget(updated)
      setTags(prev => prev.map(t => t.id === updated.id ? updated : t))
      setAliasInput('')
    } finally {
      setAliasSaving(false)
    }
  }

  async function handleRemoveAlias(aliasId: string) {
    if (!editTarget) return
    const res = await fetch(`/api/${slug}/tags/${editTarget.id}/alias/${aliasId}`, { method: 'DELETE' })
    if (res.ok) {
      const updated = { ...editTarget, aliases: editTarget.aliases.filter(a => a.id !== aliasId) }
      setEditTarget(updated)
      setTags(prev => prev.map(t => t.id === updated.id ? updated : t))
    }
  }

  async function handleMerge() {
    if (!mergeTarget) { showToast('Pilih tag tujuan', 'err'); return }
    if (mergeSources.size === 0) { showToast('Pilih minimal 1 tag sumber', 'err'); return }
    if (mergeSources.has(mergeTarget)) { showToast('Tag sumber tidak boleh sama dengan tujuan', 'err'); return }
    setLoading(true)
    try {
      const res  = await fetch(`/api/${slug}/tags/${mergeTarget}/merge`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_ids: Array.from(mergeSources) }),
      })
      const json = await res.json()
      if (!res.ok) { showToast(json.error || 'Merge gagal', 'err'); return }
      showToast(`Merge selesai. ${json.data.total_akhir} pasien di tag tujuan. Nama tag lama disimpan sebagai alias.`)
      closeModal()
      router.refresh()
      setTags(prev => prev.map(t => mergeSources.has(t.id) ? { ...t, aktif: false } : t))
    } finally {
      setLoading(false)
    }
  }

  const matchSearchQ = (t: TagItem, q: string) =>
    t.name.toLowerCase().includes(q) || t.aliases.some(a => a.alias.toLowerCase().includes(q))

  const filtered = tags.filter(t => {
    const matchFilter = filterAktif === 'semua' || (filterAktif === 'aktif' ? t.aktif : !t.aktif)
    const q = search.trim().toLowerCase()
    const matchSearch = !q || matchSearchQ(t, q)
    return matchFilter && matchSearch
  })

  const aktifTags    = tags.filter(t => t.aktif)
  const nonaktifTags = tags.filter(t => !t.aktif)

  // Grouping per kategori — preset dulu, lalu kategori custom lain (sorted), lalu "Lainnya" (tanpa kategori)
  const customKategori = Array.from(new Set(
    filtered.map(t => t.kategori).filter((k): k is string => !!k && !KATEGORI_PRESET.includes(k))
  )).sort()
  const kategoriOrder = [...KATEGORI_PRESET, ...customKategori, KATEGORI_LAINNYA]
  const grouped = kategoriOrder
    .map(kat => ({
      kategori: kat,
      items: filtered.filter(t => (t.kategori || KATEGORI_LAINNYA) === kat),
    }))
    .filter(g => g.items.length > 0)

  const inputStyle: React.CSSProperties = {
    display: 'block', width: '100%', padding: '9px 12px',
    fontFamily: 'inherit', fontSize: 'var(--font-size-sm)',
    border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-md)',
    outline: 'none', color: 'var(--c-text)', background: 'white',
    boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 700,
    color: 'var(--c-text)', marginBottom: 6,
  }

  function renderTagRow(t: TagItem) {
    return (
      <tr key={t.id} style={{ opacity: t.aktif ? 1 : 0.5 }}>
        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--c-border)', verticalAlign: 'middle' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: t.warna, flexShrink: 0, display: 'inline-block' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--c-text)' }}>{t.name}</div>
              {t.keterangan && <div style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>{t.keterangan}</div>}
              {t.aliases.length > 0 ? (
                <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 2 }}>
                  <span style={{ fontWeight: 600 }}>{t.aliases.length} alias:</span>{' '}
                  <span style={{ fontStyle: 'italic' }}>{t.aliases.map(a => a.alias).join(', ')}</span>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--c-text-faint)', fontStyle: 'italic', marginTop: 2 }}>belum ada alias</div>
              )}
            </div>
            {!t.aktif && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#F1F5F9', color: '#94A3B8' }}>nonaktif</span>
            )}
          </div>
        </td>
        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--c-border)', verticalAlign: 'middle' }}>
          <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)' }}>{t.total_pasien.toLocaleString('id-ID')}</span>
        </td>
        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--c-border)', verticalAlign: 'middle' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {Object.entries(t.breakdown).map(([src, count]) => (
              <span key={src} style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600,
                background: src === 'manual' ? '#EFF6FF' : src === 'auto_ai' ? '#F0FDF4' : '#F8FAFC',
                color: src === 'manual' ? '#3B82F6' : src === 'auto_ai' ? '#22C55E' : '#64748B',
              }}>
                {src === 'manual' ? 'Manual' : src === 'auto_ai' ? 'AI' : src} {count}
              </span>
            ))}
            {Object.keys(t.breakdown).length === 0 && (
              <span style={{ fontSize: 10, color: 'var(--c-text-faint)' }}>—</span>
            )}
          </div>
        </td>
        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--c-border)', verticalAlign: 'middle' }}>
          {t.has_rule
            ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#FEF9C3', color: '#CA8A04' }}>Ada aturan</span>
            : <span style={{ fontSize: 10, color: 'var(--c-text-faint)' }}>Belum ada</span>
          }
        </td>
        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--c-border)', verticalAlign: 'middle' }}>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <a
              href={`/${slug}/tags/${t.id}`}
              style={{ padding: '5px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--c-secondary)', textDecoration: 'none' }}
            >
              Aturan AI
            </a>
            <button onClick={() => openEdit(t)} style={{
              padding: '5px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)',
              fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--c-text-muted)',
              background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Edit
            </button>
            <button onClick={() => handleToggleAktif(t)} style={{
              padding: '5px 12px', borderRadius: 'var(--r-sm)',
              border: `1px solid ${t.aktif ? '#EF4444' : '#22C55E'}`,
              fontSize: 'var(--font-size-xs)', fontWeight: 600,
              color: t.aktif ? '#EF4444' : '#22C55E',
              background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {t.aktif ? 'Nonaktifkan' : 'Aktifkan'}
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          background: toast.type === 'ok' ? '#22C55E' : '#EF4444',
          color: 'white', padding: '10px 20px', borderRadius: 'var(--r-md)',
          fontWeight: 600, fontSize: 'var(--font-size-sm)', boxShadow: 'var(--shadow-lg)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Cari tag atau alias..."
          style={{ ...inputStyle, width: 220 }}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {(['aktif','semua','nonaktif'] as const).map(f => (
            <button key={f} onClick={() => setFilterAktif(f)} style={{
              padding: '7px 14px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--c-border)',
              background: filterAktif === f ? 'var(--c-primary)' : 'transparent',
              color: filterAktif === f ? 'white' : 'var(--c-text-muted)',
              fontFamily: 'inherit', fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer',
            }}>
              {f === 'aktif' ? `Aktif (${aktifTags.length})` : f === 'nonaktif' ? `Nonaktif (${nonaktifTags.length})` : 'Semua'}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--sp-3)' }}>
          <button onClick={openMerge} style={{
            padding: '9px 16px', borderRadius: 'var(--r-md)',
            border: '1.5px solid var(--c-border)', background: 'transparent',
            color: 'var(--c-text-muted)', fontFamily: 'inherit', fontSize: 'var(--font-size-sm)',
            fontWeight: 600, cursor: 'pointer',
          }}>
            ⊕ Merge Tag
          </button>
          <button onClick={openCreate} style={{
            padding: '9px 18px', borderRadius: 'var(--r-md)',
            background: 'var(--c-secondary)', border: 'none',
            color: 'white', fontFamily: 'inherit', fontSize: 'var(--font-size-sm)',
            fontWeight: 600, cursor: 'pointer',
          }}>
            + Tag Baru
          </button>
        </div>
      </div>

      {/* Grup per kategori */}
      {grouped.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--sp-16)', color: 'var(--c-text-faint)', fontSize: 'var(--font-size-sm)' }}>
          {search ? `Tidak ada tag/alias yang cocok dengan "${search}"` : 'Belum ada tag.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
          {grouped.map(g => (
            <div key={g.kategori}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 'var(--font-size-sm)', color: 'var(--c-primary)' }}>{g.kategori}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 99,
                  background: 'var(--c-primary-xlight)', color: 'var(--c-primary)',
                }}>{g.items.length}</span>
              </div>
              <div style={{ background: 'var(--c-surface)', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--c-bg)' }}>
                      {['Nama Tag','Pasien','Sumber','Aturan AI',''].map(h => (
                        <th key={h} style={{
                          padding: '10px 16px', fontSize: 'var(--font-size-xs)', fontWeight: 700,
                          color: 'var(--c-text-muted)', textAlign: 'left',
                          borderBottom: '2px solid var(--c-border)', whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map(renderTagRow)}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── MODAL CREATE/EDIT ────────────────────────────── */}
      {(modal === 'create' || modal === 'edit') && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 'var(--sp-4)' }}>
          <div style={{ background: 'white', borderRadius: 'var(--r-xl)', padding: 'var(--sp-8)', width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-xl)' }}>
            <h2 style={{ fontWeight: 800, color: 'var(--c-primary)', marginBottom: 'var(--sp-6)', fontSize: 'var(--font-size-lg)' }}>
              {modal === 'edit' ? 'Edit Tag' : 'Tag Baru'}
            </h2>

            {/* Similar warning */}
            {similar.length > 0 && modal === 'create' && (
              <div style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: 'var(--r-sm)', padding: '10px 14px', marginBottom: 'var(--sp-4)', fontSize: 'var(--font-size-xs)' }}>
                <div style={{ fontWeight: 700, color: '#92400E', marginBottom: 6 }}>⚠ Tag serupa sudah ada:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {similar.map(s => (
                    <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: `1.5px solid ${s.warna}`, borderRadius: 20, padding: '2px 10px', fontSize: 12, background: 'white' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.warna, display: 'inline-block' }} />
                      <strong>{s.name}</strong>
                      <span style={{ color: '#999' }}>{s.total} pasien</span>
                    </span>
                  ))}
                </div>
                <div style={{ color: '#B45309', marginTop: 6 }}>Pertimbangkan menggunakan tag di atas, atau gunakan Merge nanti.</div>
              </div>
            )}

            <div style={{ marginBottom: 'var(--sp-4)' }}>
              <label style={labelStyle}>Nama Tag *</label>
              <input
                type="text" value={fName} autoFocus
                onChange={e => { setFName(e.target.value); if (modal === 'create') checkSimilar(e.target.value) }}
                placeholder="contoh: Diabetes Tipe 2"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 'var(--sp-4)' }}>
              <label style={labelStyle}>Kategori <span style={{ fontWeight: 400, color: 'var(--c-text-faint)' }}>(untuk pengelompokan tampilan)</span></label>
              {!fKategoriCustom ? (
                <select value={fKategori} onChange={e => {
                  if (e.target.value === '__custom__') { setFKategoriCustom(true); setFKategori('') }
                  else setFKategori(e.target.value)
                }} style={inputStyle}>
                  <option value="">— tanpa kategori (Lainnya) —</option>
                  {KATEGORI_PRESET.map(k => <option key={k} value={k}>{k}</option>)}
                  <option value="__custom__">+ Kategori baru...</option>
                </select>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" value={fKategori} onChange={e => setFKategori(e.target.value)}
                    placeholder="Nama kategori baru" style={inputStyle} autoFocus />
                  <button type="button" onClick={() => { setFKategoriCustom(false); setFKategori('') }} style={{
                    padding: '0 12px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--c-border)',
                    background: 'transparent', color: 'var(--c-text-muted)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--font-size-xs)',
                  }}>Batal</button>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 'var(--sp-4)' }}>
              <label style={labelStyle}>Warna</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="color" value={fWarna} onChange={e => setFWarna(e.target.value)}
                  style={{ width: 40, height: 36, border: 'none', cursor: 'pointer', borderRadius: 6, padding: 0 }} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {PRESET_COLORS.map(c => (
                    <span key={c} onClick={() => setFWarna(c)} title={c} style={{
                      width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer',
                      border: fWarna === c ? '2px solid #000' : '2px solid #fff',
                      boxShadow: '0 0 0 1px #ccc',
                    }} />
                  ))}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 'var(--sp-6)' }}>
              <label style={labelStyle}>Keterangan <span style={{ fontWeight: 400, color: 'var(--c-text-faint)' }}>(opsional)</span></label>
              <input type="text" value={fKet} onChange={e => setFKet(e.target.value)}
                placeholder="Deskripsi singkat tag ini"
                style={inputStyle} />
            </div>

            {/* Alias — hanya saat edit */}
            {modal === 'edit' && editTarget && (
              <div style={{ marginBottom: 'var(--sp-6)' }}>
                <label style={labelStyle}>Alias / Sinonim</label>
                <p style={{ fontSize: 11, color: 'var(--c-text-faint)', margin: '0 0 8px' }}>
                  Kata lain yang merujuk ke tag ini. Contoh: "Kardiologi" → alias "jantung", "kardio".
                </p>
                <div style={{ border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: '8px 10px', display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 40, marginBottom: 8 }}>
                  {editTarget.aliases.length === 0 && (
                    <span style={{ fontSize: 12, color: 'var(--c-text-faint)', fontStyle: 'italic' }}>Belum ada alias</span>
                  )}
                  {editTarget.aliases.map(a => (
                    <span key={a.id} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      background: 'var(--c-bg)', border: '1px solid var(--c-border)',
                      borderRadius: 20, padding: '3px 6px 3px 10px', fontSize: 12,
                    }}>
                      {a.alias}
                      <span onClick={() => handleRemoveAlias(a.id)} title="Hapus alias" style={{
                        cursor: 'pointer', color: '#EF4444', fontWeight: 700, padding: '0 4px',
                      }}>×</span>
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" value={aliasInput} onChange={e => setAliasInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddAlias() } }}
                    placeholder="Ketik alias baru, lalu Enter…"
                    style={{ ...inputStyle }} />
                  <button type="button" onClick={handleAddAlias} disabled={aliasSaving || !aliasInput.trim()} style={{
                    padding: '0 16px', borderRadius: 'var(--r-md)', border: 'none', whiteSpace: 'nowrap',
                    background: aliasSaving || !aliasInput.trim() ? '#94A3B8' : 'var(--c-secondary)',
                    color: 'white', fontWeight: 600, fontSize: 'var(--font-size-xs)',
                    cursor: aliasSaving || !aliasInput.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  }}>+ Tambah</button>
                </div>
              </div>
            )}
            {modal === 'create' && (
              <div style={{ marginBottom: 'var(--sp-6)', fontSize: 11, color: 'var(--c-text-faint)', fontStyle: 'italic' }}>
                Alias/sinonim bisa ditambahkan setelah tag ini disimpan (buka Edit).
              </div>
            )}

            <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'flex-end' }}>
              <button onClick={closeModal} style={{ padding: '9px 20px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--c-border)', background: 'transparent', color: 'var(--c-text-muted)', fontFamily: 'inherit', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer' }}>
                Tutup
              </button>
              <button onClick={handleSave} disabled={loading} style={{ padding: '9px 20px', borderRadius: 'var(--r-md)', background: loading ? '#94A3B8' : 'var(--c-secondary)', border: 'none', color: 'white', fontFamily: 'inherit', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL MERGE ──────────────────────────────────── */}
      {modal === 'merge' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 'var(--sp-4)' }}>
          <div style={{ background: 'white', borderRadius: 'var(--r-xl)', padding: 'var(--sp-8)', width: '100%', maxWidth: 560, boxShadow: 'var(--shadow-xl)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontWeight: 800, color: 'var(--c-primary)', marginBottom: 8, fontSize: 'var(--font-size-lg)' }}>Merge Tag</h2>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', marginBottom: 'var(--sp-6)' }}>
              Tag sumber akan dinonaktifkan, pasiennya dipindahkan ke tag tujuan, dan namanya otomatis tersimpan sebagai alias di tag tujuan.
            </p>

            <div style={{ marginBottom: 'var(--sp-5)' }}>
              <label style={labelStyle}>Tag tujuan (yang dipertahankan)</label>
              <select value={mergeTarget} onChange={e => setMergeTarget(e.target.value)} style={{ ...inputStyle }}>
                <option value="">— pilih tag tujuan —</option>
                {aktifTags.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.total_pasien} pasien)</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 'var(--sp-6)' }}>
              <label style={labelStyle}>Tag yang akan digabungkan ke tujuan (centang sumber)</label>
              <div style={{ border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 52 }}>
                {aktifTags.filter(t => t.id !== mergeTarget).map(t => {
                  const checked = mergeSources.has(t.id)
                  return (
                    <label key={t.id} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                      border: `1.5px solid ${checked ? t.warna : 'var(--c-border)'}`,
                      borderRadius: 20, padding: '4px 10px', fontSize: 12, fontWeight: 500,
                      background: checked ? t.warna + '15' : 'transparent',
                    }}>
                      <input type="checkbox" checked={checked} onChange={() => {
                        setMergeSources(prev => {
                          const next = new Set(prev)
                          next.has(t.id) ? next.delete(t.id) : next.add(t.id)
                          return next
                        })
                      }} style={{ margin: 0 }} />
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.warna, display: 'inline-block' }} />
                      {t.name}
                      <span style={{ color: '#999' }}>({t.total_pasien})</span>
                    </label>
                  )
                })}
                {aktifTags.length <= 1 && (
                  <span style={{ fontSize: 12, color: 'var(--c-text-faint)', fontStyle: 'italic' }}>Tidak ada tag aktif untuk dipilih.</span>
                )}
              </div>
            </div>

            {mergeTarget && mergeSources.size > 0 && (
              <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 'var(--r-sm)', padding: '10px 14px', fontSize: 'var(--font-size-xs)', color: '#92400E', marginBottom: 'var(--sp-5)' }}>
                <strong>Preview:</strong>{' '}
                {Array.from(mergeSources).map(id => aktifTags.find(t => t.id === id)?.name).join(', ')}
                {' '} → <strong>{aktifTags.find(t => t.id === mergeTarget)?.name}</strong>
              </div>
            )}

            <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'flex-end' }}>
              <button onClick={closeModal} style={{ padding: '9px 20px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--c-border)', background: 'transparent', color: 'var(--c-text-muted)', fontFamily: 'inherit', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer' }}>
                Batal
              </button>
              <button onClick={handleMerge} disabled={loading} style={{ padding: '9px 20px', borderRadius: 'var(--r-md)', background: loading ? '#94A3B8' : '#F59E0B', border: 'none', color: 'white', fontFamily: 'inherit', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading ? 'Memproses...' : 'Merge Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
