'use client'

import { useCallback, useEffect, useState } from 'react'

interface SifatRow {
  id: string; kode: string; nama: string; deskripsi: string | null
  warna: string; urutan: number; aktif: boolean
}

const inp: React.CSSProperties = {
  padding: '8px 10px', fontFamily: 'inherit', fontSize: 'var(--font-size-sm)',
  border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-sm)',
  outline: 'none', background: 'var(--c-bg)', color: 'var(--c-text)', boxSizing: 'border-box',
}

export default function SifatLibraryTab({ slug }: { slug: string }) {
  const [rows, setRows]       = useState<SifatRow[]>([])
  const [q, setQ]             = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [saving, setSaving]   = useState(false)

  const [showAdd, setShowAdd] = useState(false)
  const [fKode, setFKode]     = useState('')
  const [fNama, setFNama]     = useState('')
  const [fDesk, setFDesk]     = useState('')
  const [fWarna, setFWarna]   = useState('#0089A8')

  const [editId, setEditId]     = useState<string | null>(null)
  const [eNama, setENama]       = useState('')
  const [eDesk, setEDesk]       = useState('')
  const [eWarna, setEWarna]     = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const p = new URLSearchParams({ tab: 'sifat' })
      if (q.trim()) p.set('q', q.trim())
      const res  = await fetch(`/api/${slug}/library?${p}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Gagal memuat sifat konten'); return }
      setRows(json.data ?? [])
    } catch { setError('Gagal memuat sifat konten') }
    finally { setLoading(false) }
  }, [slug, q])

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [load])

  async function tambah(e: React.FormEvent) {
    e.preventDefault()
    if (!fKode.trim() || !fNama.trim()) { setError('Kode dan nama wajib diisi'); return }
    setSaving(true); setError('')
    try {
      const res  = await fetch(`/api/${slug}/library?tab=sifat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kode: fKode, nama: fNama, deskripsi: fDesk, warna: fWarna }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Gagal menambah'); return }
      setFKode(''); setFNama(''); setFDesk(''); setShowAdd(false); load()
    } catch { setError('Gagal menambah') }
    finally { setSaving(false) }
  }

  async function simpanEdit(id: string) {
    setSaving(true); setError('')
    try {
      const res  = await fetch(`/api/${slug}/library?tab=sifat`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, nama: eNama, deskripsi: eDesk, warna: eWarna }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Gagal menyimpan'); return }
      setEditId(null); load()
    } catch { setError('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  async function ubahAktif(row: SifatRow) {
    setSaving(true); setError('')
    try {
      await fetch(`/api/${slug}/library?tab=sifat`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, aktif: !row.aktif }),
      })
      load()
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div style={{ background: '#FFFBEB', borderLeft: '3px solid #F59E0B', color: '#92400E', padding: 'var(--sp-4)', borderRadius: 'var(--r-md)', fontSize: 'var(--font-size-sm)', lineHeight: 1.7, marginBottom: 'var(--sp-4)' }}>
        <strong>Kode bersifat kekal, nama boleh diubah.</strong> Mengubah <em>nama</em> berlaku surut ke
        seluruh riwayat — pakai itu bila hanya memperbaiki penyebutan untuk maksud yang sama.
        Untuk maksud yang <em>berbeda</em>, buat kode baru lalu nonaktifkan yang lama; kategori lama
        tetap terdokumentasi dan laporan periode lampau tidak berubah artinya.
        Kategori tidak pernah dihapus, hanya dinonaktifkan.
        <br />
        Menambah atau mengganti kategori <strong>di tengah triwulan</strong> mengubah bentuk tabel
        silang laporan sehingga sulit diadu dengan periode sebelumnya — sebaiknya dilakukan di awal periode.
      </div>

      <div style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)', flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama atau kode…"
          style={{ ...inp, flex: 1, minWidth: 200 }} />
        <button onClick={() => setShowAdd(v => !v)} style={{
          padding: '8px 16px', borderRadius: 'var(--r-md)', border: 'none',
          background: 'var(--c-secondary)', color: 'white', fontFamily: 'inherit',
          fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer',
        }}>{showAdd ? 'Batal' : '+ Sifat baru'}</button>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #EF4444', marginBottom: 'var(--sp-4)' }}>{error}</div>
      )}

      {showAdd && (
        <form onSubmit={tambah} style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', marginBottom: 'var(--sp-4)', display: 'grid', gap: 'var(--sp-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-muted)' }}>KODE (kekal)</label>
              <input value={fKode} onChange={e => setFKode(e.target.value)} placeholder="TESTIMONI_PASIEN" style={{ ...inp, width: '100%' }} />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-muted)' }}>NAMA TAMPILAN</label>
              <input value={fNama} onChange={e => setFNama(e.target.value)} placeholder="Testimoni Pasien" style={{ ...inp, width: '100%' }} />
            </div>
            <div style={{ width: 70 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-muted)' }}>WARNA</label>
              <input type="color" value={fWarna} onChange={e => setFWarna(e.target.value)}
                style={{ ...inp, width: '100%', height: 38, padding: 2 }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-muted)' }}>URAIAN — dipakai AI saat mengusulkan sifat konten</label>
            <input value={fDesk} onChange={e => setFDesk(e.target.value)} placeholder="Berisi…" style={{ ...inp, width: '100%' }} />
          </div>
          <button type="submit" disabled={saving} style={{
            padding: '8px 16px', borderRadius: 'var(--r-md)', border: 'none', justifySelf: 'start',
            background: saving ? '#94A3B8' : 'var(--c-primary)', color: 'white',
            fontFamily: 'inherit', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
          }}>{saving ? 'Menyimpan…' : 'Simpan'}</button>
        </form>
      )}

      {loading ? (
        <div style={{ color: 'var(--c-text-muted)', fontSize: 'var(--font-size-sm)' }}>Memuat…</div>
      ) : (
        <div style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
          {rows.map((r, i) => (
            <div key={r.id} style={{
              padding: 'var(--sp-4)', borderBottom: i < rows.length - 1 ? '1px solid var(--c-border)' : 'none',
              display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-start',
              opacity: r.aktif ? 1 : 0.55, background: r.aktif ? 'transparent' : 'var(--c-bg)',
            }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: r.warna, marginTop: 4, flexShrink: 0 }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                {editId === r.id ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input value={eNama} onChange={e => setENama(e.target.value)} style={{ ...inp, flex: 1, minWidth: 140 }} />
                      <input type="color" value={eWarna} onChange={e => setEWarna(e.target.value)} style={{ ...inp, width: 60, height: 36, padding: 2 }} />
                    </div>
                    <input value={eDesk} onChange={e => setEDesk(e.target.value)} placeholder="Uraian" style={{ ...inp, width: '100%' }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => simpanEdit(r.id)} disabled={saving} style={{ padding: '6px 14px', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--c-primary)', color: 'white', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Simpan</button>
                      <button onClick={() => setEditId(null)} style={{ padding: '6px 14px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--c-border)', background: 'white', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>Batal</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--c-text)' }}>{r.nama}</span>
                      <code style={{ fontSize: 11, color: 'var(--c-text-faint)', background: 'var(--c-bg)', padding: '1px 6px', borderRadius: 4 }}>{r.kode}</code>
                      {!r.aktif && <span style={{ fontSize: 10, fontWeight: 700, color: '#B45309', background: '#FFFBEB', padding: '1px 6px', borderRadius: 4 }}>NONAKTIF</span>}
                    </div>
                    {r.deskripsi && <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginTop: 3, lineHeight: 1.5 }}>{r.deskripsi}</div>}
                  </>
                )}
              </div>

              {editId !== r.id && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => { setEditId(r.id); setENama(r.nama); setEDesk(r.deskripsi ?? ''); setEWarna(r.warna) }}
                    style={{ padding: '5px 11px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--c-border)', background: 'white', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>Edit</button>
                  <button onClick={() => ubahAktif(r)} disabled={saving}
                    style={{ padding: '5px 11px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--c-border)', background: 'white', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', color: r.aktif ? '#B91C1C' : '#15803D' }}>
                    {r.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                </div>
              )}
            </div>
          ))}
          {!rows.length && (
            <div style={{ padding: 'var(--sp-5)', color: 'var(--c-text-muted)', fontSize: 'var(--font-size-sm)' }}>Belum ada sifat konten.</div>
          )}
        </div>
      )}
    </div>
  )
}
