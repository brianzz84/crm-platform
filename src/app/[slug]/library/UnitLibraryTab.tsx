'use client'

import { useCallback, useEffect, useState } from 'react'

interface UnitRow {
  id:       string
  nama:     string
  kelompok: string
  warna:    string
  urutan:   number
  aktif:    boolean
}

interface KelompokInfo { nama: string; jumlah: number }

const inp: React.CSSProperties = {
  padding: '8px 10px', fontFamily: 'inherit', fontSize: 'var(--font-size-sm)',
  border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-sm)',
  outline: 'none', background: 'var(--c-bg)', color: 'var(--c-text)', boxSizing: 'border-box',
}

export default function UnitLibraryTab({ slug }: { slug: string }) {
  const [rows, setRows]         = useState<UnitRow[]>([])
  const [kelompokList, setKel]  = useState<KelompokInfo[]>([])
  const [q, setQ]               = useState('')
  const [filterKel, setFilterKel] = useState('')
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  // form tambah
  const [showAdd, setShowAdd]   = useState(false)
  const [nama, setNama]         = useState('')
  const [kelompok, setKelompok] = useState('')
  const [saving, setSaving]     = useState(false)

  // edit inline
  const [editId, setEditId]     = useState<string | null>(null)
  const [editNama, setEditNama] = useState('')
  const [editKel, setEditKel]   = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ tab: 'unit' })
      if (q.trim())  params.set('q', q.trim())
      if (filterKel) params.set('kelompok', filterKel)
      const res  = await fetch(`/api/${slug}/library?${params}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Gagal memuat unit'); return }
      setRows(json.data ?? [])
      setKel(json.kelompokList ?? [])
    } catch { setError('Gagal memuat unit') }
    finally { setLoading(false) }
  }, [slug, q, filterKel])

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [load])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!nama.trim() || !kelompok.trim()) { setError('Nama unit dan kelompok wajib diisi'); return }
    setSaving(true); setError('')
    try {
      const res  = await fetch(`/api/${slug}/library?tab=unit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama: nama.trim(), kelompok: kelompok.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Gagal menambah unit'); return }
      setNama(''); setKelompok(''); setShowAdd(false)
      await load()
    } finally { setSaving(false) }
  }

  async function simpanEdit(id: string) {
    if (!editNama.trim() || !editKel.trim()) { setError('Nama dan kelompok tidak boleh kosong'); return }
    const res  = await fetch(`/api/${slug}/library?tab=unit`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, nama: editNama.trim(), kelompok: editKel.trim() }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error || 'Gagal menyimpan'); return }
    setEditId(null); await load()
  }

  async function toggleAktif(u: UnitRow) {
    // Optimistis — dikembalikan kalau server menolak
    setRows(r => r.map(x => x.id === u.id ? { ...x, aktif: !x.aktif } : x))
    const res = await fetch(`/api/${slug}/library?tab=unit`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: u.id, aktif: !u.aktif }),
    })
    if (!res.ok) setRows(r => r.map(x => x.id === u.id ? { ...x, aktif: u.aktif } : x))
  }

  const th: React.CSSProperties = {
    padding: '9px var(--sp-4)', fontSize: 'var(--font-size-xs)', fontWeight: 700,
    color: 'var(--c-text-muted)', textAlign: 'left',
    borderBottom: '2px solid var(--c-border)', whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = {
    padding: '8px var(--sp-4)', fontSize: 'var(--font-size-sm)',
    color: 'var(--c-text)', borderBottom: '1px solid var(--c-border)', verticalAlign: 'middle',
  }

  return (
    <div>
      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', marginTop: 0, marginBottom: 'var(--sp-4)' }}>
        Daftar unit/poli rumah sakit ini beserta kelompoknya. Dipakai sebagai acuan filter di Data Pasien,
        Segmentasi, dan AI Partner. Tiap RS punya struktur sendiri — unit di sini tidak dikunci sistem.
        Unit yang sudah dipakai kunjungan sebaiknya <strong>dinonaktifkan</strong>, bukan diganti namanya.
      </p>

      {/* Filter + tambah */}
      <div style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)', flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari unit / kelompok..."
          style={{ ...inp, flex: 1, minWidth: 180 }} />
        <select value={filterKel} onChange={e => setFilterKel(e.target.value)} style={{ ...inp, cursor: 'pointer', minWidth: 160 }}>
          <option value="">Semua Kelompok</option>
          {kelompokList.map(k => <option key={k.nama} value={k.nama}>{k.nama} ({k.jumlah})</option>)}
        </select>
        <button onClick={() => setShowAdd(v => !v)} style={{
          padding: '8px 16px', borderRadius: 'var(--r-md)', border: 'none',
          background: 'var(--c-secondary)', color: 'white', fontFamily: 'inherit',
          fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
          {showAdd ? 'Batal' : '+ Tambah Unit'}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} style={{
          border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)',
          padding: 'var(--sp-4)', marginBottom: 'var(--sp-4)', background: 'var(--c-bg)',
          display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 'var(--sp-3)', alignItems: 'end',
        }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Nama Unit *</label>
            <input value={nama} onChange={e => setNama(e.target.value)} placeholder="cth: Klinik Onkologi" style={{ ...inp, width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Kelompok *</label>
            <input value={kelompok} onChange={e => setKelompok(e.target.value)} placeholder="cth: Rawat Jalan" list="kelompok-opsi" style={{ ...inp, width: '100%' }} />
            <datalist id="kelompok-opsi">
              {kelompokList.map(k => <option key={k.nama} value={k.nama} />)}
            </datalist>
          </div>
          <button type="submit" disabled={saving} style={{
            padding: '8px 18px', borderRadius: 'var(--r-md)', border: 'none',
            background: saving ? '#94A3B8' : 'var(--c-primary)', color: 'white',
            fontFamily: 'inherit', fontSize: 'var(--font-size-xs)', fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </form>
      )}

      {error && (
        <div style={{ background: '#FEF2F2', color: '#B91C1C', borderLeft: '3px solid #EF4444',
          borderRadius: 'var(--r-sm)', padding: '8px 14px', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--sp-3)' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--c-text-muted)', fontSize: 'var(--font-size-sm)' }}>Memuat...</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--c-text-faint)', fontSize: 'var(--font-size-sm)' }}>
          Belum ada unit. Klik <strong>+ Tambah Unit</strong> untuk membuat.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--c-bg)' }}>
                <th style={th}>Unit</th>
                <th style={th}>Kelompok</th>
                <th style={{ ...th, textAlign: 'center' }}>Aktif</th>
                <th style={{ ...th, textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u, i) => {
                const sedangEdit = editId === u.id
                return (
                  <tr key={u.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--c-bg)', opacity: u.aktif ? 1 : 0.5 }}>
                    <td style={td}>
                      {sedangEdit
                        ? <input value={editNama} onChange={e => setEditNama(e.target.value)} style={{ ...inp, width: '100%' }} />
                        : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: u.warna, flexShrink: 0 }} />
                            <strong>{u.nama}</strong>
                          </span>}
                    </td>
                    <td style={td}>
                      {sedangEdit
                        ? <input value={editKel} onChange={e => setEditKel(e.target.value)} list="kelompok-opsi" style={{ ...inp, width: '100%' }} />
                        : u.kelompok}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <input type="checkbox" checked={u.aktif} onChange={() => toggleAktif(u)} style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {sedangEdit ? (
                        <>
                          <button onClick={() => simpanEdit(u.id)} style={{ background: 'none', border: 'none', color: 'var(--c-secondary)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Simpan</button>
                          <button onClick={() => setEditId(null)} style={{ background: 'none', border: 'none', color: 'var(--c-text-muted)', fontSize: 12, cursor: 'pointer', marginLeft: 8 }}>Batal</button>
                        </>
                      ) : (
                        <button onClick={() => { setEditId(u.id); setEditNama(u.nama); setEditKel(u.kelompok); setError('') }}
                          style={{ background: 'none', border: 'none', color: 'var(--c-secondary)', fontSize: 12, cursor: 'pointer' }}>Edit</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
