'use client'

import { useState, useEffect, useCallback, useRef, useTransition } from 'react'

interface Stats {
  icdTotal: number
  icd10: number
  icd11: number
  layananTotal: number
  rawatJalan: number
  penunjang: number
  pondokSehat: number
}

interface IcdRow {
  kode: string
  nama_id: string
  nama: string
  bab: string | null
  versi: string
}

interface LayananRow {
  id: string
  kode_barang: string
  nama: string
  nama_generik: string | null
  kelompok: string
  jenis: string
  aktif: boolean
}

const JENIS_OPTIONS: Record<string, string[]> = {
  'Rawat Inap':   ['Rawat Inap'],
  'Rawat Jalan':  ['Anak','Bedah','Gigi','Jantung','Kebidanan & Kandungan','Kulit & Kosmetik','Mata','Orthopedi','Paru','Penyakit Dalam','Saraf','THT','Umum','Urologi','Ambulan'],
  'Penunjang':    ['Akupuntur','Hemodialisis','Laboratorium','Radiologi','Rehabilitasi Medik'],
  'Pondok Sehat': ['Check Up','Paket','Paket PROM','Skrining'],
  'Home Care':    ['Home Care'],
  'One Day Care': ['One Day Care'],
}

export default function LibraryClient({ slug, stats }: { slug: string; stats: Stats }) {
  const [tab, setTab] = useState<'icd' | 'layanan'>('icd')

  // ICD state
  const [icdQ,    setIcdQ]    = useState('')
  const [icdVersi, setIcdVersi] = useState('')
  const [icdBab,  setIcdBab]  = useState('')
  const [icdPage, setIcdPage] = useState(1)
  const [icdData, setIcdData] = useState<IcdRow[]>([])
  const [icdTotal, setIcdTotal] = useState(0)
  const [icdLoading, setIcdLoading] = useState(false)

  // Layanan state
  const [layQ,       setLayQ]       = useState('')
  const [layKelompok, setLayKelompok] = useState('')
  const [layJenis,   setLayJenis]   = useState('')
  const [layBelumDiisi, setLayBelumDiisi] = useState(false)
  const [layPage,    setLayPage]    = useState(1)
  const [layData, setLayData] = useState<LayananRow[]>([])
  const [layTotal, setLayTotal] = useState(0)
  const [layLoading, setLayLoading] = useState(false)

  // Inline edit state
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [editVal,    setEditVal]    = useState('')
  const [, startTransition] = useTransition()

  const icdTimer  = useRef<ReturnType<typeof setTimeout>>()
  const layTimer  = useRef<ReturnType<typeof setTimeout>>()

  const fetchIcd = useCallback(async (q: string, versi: string, bab: string, page: number) => {
    setIcdLoading(true)
    try {
      const params = new URLSearchParams({ tab: 'icd', page: String(page) })
      if (q)     params.set('q', q)
      if (versi) params.set('versi', versi)
      if (bab)   params.set('bab', bab)
      const res  = await fetch(`/api/${slug}/library?${params}`)
      const json = await res.json()
      setIcdData(json.data ?? [])
      setIcdTotal(json.total ?? 0)
    } finally {
      setIcdLoading(false)
    }
  }, [slug])

  const fetchLayanan = useCallback(async (q: string, kelompok: string, jenis: string, belumDiisi: boolean, page: number) => {
    setLayLoading(true)
    try {
      const params = new URLSearchParams({ tab: 'layanan', page: String(page) })
      if (q)          params.set('q', q)
      if (kelompok)   params.set('kelompok', kelompok)
      if (jenis)      params.set('jenis', jenis)
      if (belumDiisi) params.set('belum_diisi', '1')
      const res  = await fetch(`/api/${slug}/library?${params}`)
      const json = await res.json()
      setLayData(json.data ?? [])
      setLayTotal(json.total ?? 0)
    } finally {
      setLayLoading(false)
    }
  }, [slug])

  const saveNamaGenerik = useCallback(async (id: string, value: string) => {
    const res = await fetch(`/api/${slug}/library`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, nama_generik: value }),
    })
    if (res.ok) {
      setLayData(prev => prev.map(r => r.id === id ? { ...r, nama_generik: value.trim() || null } : r))
    }
    setEditingId(null)
  }, [slug])

  useEffect(() => {
    clearTimeout(icdTimer.current)
    icdTimer.current = setTimeout(() => fetchIcd(icdQ, icdVersi, icdBab, icdPage), 300)
  }, [icdQ, icdVersi, icdBab, icdPage, fetchIcd])

  useEffect(() => {
    clearTimeout(layTimer.current)
    layTimer.current = setTimeout(() => fetchLayanan(layQ, layKelompok, layJenis, layBelumDiisi, layPage), 300)
  }, [layQ, layKelompok, layJenis, layBelumDiisi, layPage, fetchLayanan])

  // Reset page on filter change
  useEffect(() => { setIcdPage(1) }, [icdQ, icdVersi, icdBab])
  useEffect(() => { setLayPage(1) }, [layQ, layKelompok, layJenis, layBelumDiisi])

  // Reset jenis saat kelompok berubah
  useEffect(() => { setLayJenis('') }, [layKelompok])

  const icdPages = Math.ceil(icdTotal / 50)
  const layPages = Math.ceil(layTotal / 50)

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1 }}>

      {/* Header */}
      <div style={{ marginBottom: 'var(--sp-5)' }}>
        <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--c-text)' }}>
          Library
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-faint)', marginTop: 4 }}>
          Referensi kode diagnosa ICD dan master layanan/tindakan dari SIMRS
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)' }}>
        <StatCard label="Total ICD"      value={stats.icdTotal.toLocaleString('id')}      sub="ICD-10 & ICD-11" />
        <StatCard label="ICD-10"         value={stats.icd10.toLocaleString('id')}         sub="ICD-10-CM (NLM)" />
        <StatCard label="ICD-11"         value={stats.icd11.toLocaleString('id')}         sub="Placeholder" />
        <StatCard label="Total Layanan"  value={stats.layananTotal.toLocaleString('id')}  sub="dari SIMRS" />
        <StatCard label="Rawat Jalan"    value={stats.rawatJalan.toLocaleString('id')}    sub="tindakan" />
        <StatCard label="Penunjang"      value={stats.penunjang.toLocaleString('id')}     sub="tindakan" />
        <StatCard label="Pondok Sehat"   value={stats.pondokSehat.toLocaleString('id')}   sub="tindakan" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--c-border)', marginBottom: 'var(--sp-4)' }}>
        {(['icd', 'layanan'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 20px',
            fontWeight: tab === t ? 700 : 500,
            color: tab === t ? 'var(--c-secondary)' : 'var(--c-text-faint)',
            borderBottom: tab === t ? '2px solid var(--c-secondary)' : '2px solid transparent',
            marginBottom: -2,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 'var(--font-size-sm)',
          }}>
            {t === 'icd' ? '📋 Diagnosa ICD' : '🏥 Layanan / Tindakan'}
          </button>
        ))}
      </div>

      {tab === 'icd' ? (
        <>
          {/* ICD filters */}
          <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-3)' }}>
            <input
              type="text" placeholder="Cari kode atau nama penyakit..."
              value={icdQ} onChange={e => setIcdQ(e.target.value)}
              style={{ flex: 1, minWidth: 200, maxWidth: 320, padding: '8px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)', fontSize: 'var(--font-size-sm)' }}
            />
            <select value={icdVersi} onChange={e => setIcdVersi(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)', fontSize: 'var(--font-size-sm)' }}>
              <option value="">Semua versi</option>
              <option value="ICD10">ICD-10</option>
              <option value="ICD11">ICD-11</option>
            </select>
            <select value={icdBab} onChange={e => setIcdBab(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)', fontSize: 'var(--font-size-sm)' }}>
              <option value="">Semua bab</option>
              <option value="BAB I">BAB I — Infeksi & Parasit</option>
              <option value="BAB II">BAB II — Neoplasma</option>
              <option value="BAB III">BAB III — Darah</option>
              <option value="BAB IV">BAB IV — Endokrin & Metabolisme</option>
              <option value="BAB V">BAB V — Gangguan Mental</option>
              <option value="BAB VI">BAB VI — Sistem Saraf</option>
              <option value="BAB VII">BAB VII — Mata</option>
              <option value="BAB VIII">BAB VIII — Telinga</option>
              <option value="BAB IX">BAB IX — Sistem Sirkulasi</option>
              <option value="BAB X">BAB X — Sistem Pernapasan</option>
              <option value="BAB XI">BAB XI — Sistem Pencernaan</option>
              <option value="BAB XII">BAB XII — Kulit</option>
              <option value="BAB XIII">BAB XIII — Muskuloskeletal</option>
              <option value="BAB XIV">BAB XIV — Genitourinaria</option>
              <option value="BAB XV">BAB XV — Kehamilan</option>
              <option value="BAB XVI">BAB XVI — Perinatal</option>
              <option value="BAB XVII">BAB XVII — Kongenital</option>
              <option value="BAB XVIII">BAB XVIII — Gejala Abnormal</option>
              <option value="BAB XIX">BAB XIX — Cedera & Keracunan</option>
              <option value="BAB XX">BAB XX — Penyebab Eksternal</option>
              <option value="BAB XXI">BAB XXI — Status Kesehatan</option>
            </select>
          </div>

          <div style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
              <thead>
                <tr style={{ background: 'var(--c-bg-alt)' }}>
                  <Th style={{ width: 90 }}>Kode</Th>
                  <Th style={{ width: 60 }}>Versi</Th>
                  <Th>Nama</Th>
                  <Th style={{ width: 260 }}>Bab</Th>
                </tr>
              </thead>
              <tbody>
                {icdLoading ? (
                  <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: 'var(--c-text-faint)' }}>Memuat...</td></tr>
                ) : icdData.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: 'var(--c-text-faint)' }}>Tidak ada data</td></tr>
                ) : icdData.map(row => {
                  const hasTerjemahan = row.nama_id && row.nama_id !== row.nama
                  return (
                    <tr key={row.kode} style={{ borderTop: '1px solid var(--c-border)' }}>
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{
                          fontFamily: 'monospace', fontSize: 12, fontWeight: 600,
                          color: 'var(--c-secondary)', background: 'color-mix(in srgb, var(--c-secondary) 12%, transparent)',
                          padding: '2px 7px', borderRadius: 4,
                        }}>{row.kode}</span>
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 99,
                          fontSize: 11, fontWeight: 500,
                          background: row.versi === 'ICD11' ? '#f3e8ff' : '#eff6ff',
                          color:      row.versi === 'ICD11' ? '#7e22ce' : '#1d4ed8',
                        }}>{row.versi === 'ICD11' ? 'ICD-11' : 'ICD-10'}</span>
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <div style={{ fontWeight: 500, color: 'var(--c-text)' }}>
                          {hasTerjemahan ? row.nama_id : row.nama}
                        </div>
                        {hasTerjemahan && (
                          <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 2 }}>{row.nama}</div>
                        )}
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{
                          display: 'inline-block', fontSize: 11, color: 'var(--c-text-secondary)',
                          background: 'var(--c-bg-alt)', border: '1px solid var(--c-border)',
                          padding: '2px 8px', borderRadius: 99,
                          maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{row.bab ?? '—'}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <Pagination page={icdPage} pages={icdPages} total={icdTotal} onPage={setIcdPage} />
        </>
      ) : (
        <>
          {/* Layanan filters */}
          <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-3)', alignItems: 'center' }}>
            <input
              type="text" placeholder="Cari kode, nama, atau nama generik..."
              value={layQ} onChange={e => setLayQ(e.target.value)}
              style={{ flex: 1, minWidth: 200, maxWidth: 320, padding: '8px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)', fontSize: 'var(--font-size-sm)' }}
            />
            <select value={layKelompok} onChange={e => setLayKelompok(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)', fontSize: 'var(--font-size-sm)' }}>
              <option value="">Semua kelompok</option>
              {Object.keys(JENIS_OPTIONS).map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            {layKelompok && JENIS_OPTIONS[layKelompok]?.length > 1 && (
              <select value={layJenis} onChange={e => setLayJenis(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)', fontSize: 'var(--font-size-sm)' }}>
                <option value="">Semua jenis</option>
                {JENIS_OPTIONS[layKelompok].map(j => <option key={j} value={j}>{j}</option>)}
              </select>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-sm)', color: 'var(--c-text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={layBelumDiisi} onChange={e => setLayBelumDiisi(e.target.checked)} />
              Belum ada nama generik
            </label>
          </div>

          <div style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
              <thead>
                <tr style={{ background: 'var(--c-bg-alt)' }}>
                  <Th style={{ width: 100 }}>Kode</Th>
                  <Th style={{ width: '25%' }}>Nama SIMRS</Th>
                  <Th>Nama Generik <span style={{ fontWeight: 400, color: 'var(--c-text-faint)' }}>(klik untuk edit)</span></Th>
                  <Th style={{ width: 140 }}>Kelompok</Th>
                  <Th style={{ width: 150 }}>Jenis</Th>
                </tr>
              </thead>
              <tbody>
                {layLoading ? (
                  <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--c-text-faint)' }}>Memuat...</td></tr>
                ) : layData.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--c-text-faint)' }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>🏥</div>
                      <div style={{ fontWeight: 500, marginBottom: 4 }}>Tidak ada data</div>
                    </td>
                  </tr>
                ) : layData.map(row => (
                  <tr key={row.id} style={{ borderTop: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{
                        fontFamily: 'monospace', fontSize: 12, fontWeight: 600,
                        color: 'var(--c-text-secondary)', background: 'var(--c-bg-alt)',
                        padding: '2px 7px', borderRadius: 4,
                      }}>{row.kode_barang}</span>
                    </td>
                    <td style={{ padding: '9px 12px', color: 'var(--c-text-secondary)', fontSize: 12 }}>
                      {row.nama}
                    </td>
                    <td style={{ padding: '6px 12px' }}>
                      {editingId === row.id ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            autoFocus
                            value={editVal}
                            onChange={e => setEditVal(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveNamaGenerik(row.id, editVal)
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            style={{ flex: 1, padding: '5px 8px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--c-secondary)', fontSize: 'var(--font-size-sm)', outline: 'none' }}
                          />
                          <button onClick={() => saveNamaGenerik(row.id, editVal)} style={{ padding: '5px 12px', background: 'var(--c-secondary)', color: 'white', border: 'none', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Simpan</button>
                          <button onClick={() => setEditingId(null)} style={{ padding: '5px 10px', background: 'none', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontSize: 12, color: 'var(--c-text-faint)' }}>Batal</button>
                        </div>
                      ) : (
                        <div
                          onClick={() => { setEditingId(row.id); setEditVal(row.nama_generik ?? '') }}
                          title="Klik untuk edit"
                          style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 'var(--r-sm)', minHeight: 28, display: 'flex', alignItems: 'center', gap: 6 }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--c-bg-alt)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          {row.nama_generik ? (
                            <span style={{ fontWeight: 500, color: 'var(--c-text)' }}>{row.nama_generik}</span>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--c-warning, #d97706)', background: '#fef3c7', padding: '2px 8px', borderRadius: 99, fontWeight: 500 }}>Belum diisi</span>
                          )}
                          <span style={{ fontSize: 11, color: 'var(--c-text-faint)', opacity: 0 }} className="edit-hint">✏️</span>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      <KelompokBadge kelompok={row.kelompok} />
                    </td>
                    <td style={{ padding: '9px 12px', fontSize: 13, color: 'var(--c-text-secondary)' }}>
                      {row.jenis}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {layData.length > 0 && (
            <Pagination page={layPage} pages={layPages} total={layTotal} onPage={setLayPage} />
          )}
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{
      background: 'var(--c-surface)', border: '1px solid var(--c-border)',
      borderRadius: 'var(--r-md)', padding: '14px 16px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--c-text)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 3 }}>{sub}</div>
    </div>
  )
}

function Th({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th style={{
      textAlign: 'left', padding: '9px 12px',
      fontSize: 11, fontWeight: 600, color: 'var(--c-text-faint)',
      borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap',
      ...style,
    }}>{children}</th>
  )
}

function KelompokBadge({ kelompok }: { kelompok: string }) {
  const colors: Record<string, [string, string]> = {
    'Rawat Jalan':  ['#eff6ff', '#1d4ed8'],
    'Rawat Inap':   ['#f0fdf4', '#15803d'],
    'Penunjang':    ['#fff7ed', '#c2410c'],
    'Pondok Sehat': ['#f0fdf4', '#166534'],
    'Home Care':    ['#fdf4ff', '#7e22ce'],
    'One Day Care': ['#fefce8', '#854d0e'],
  }
  const [bg, fg] = colors[kelompok] ?? ['#f3f4f6', '#374151']
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 99,
      fontSize: 11, fontWeight: 500, background: bg, color: fg,
    }}>
      {kelompok}
    </span>
  )
}

function Pagination({ page, pages, total, onPage }: {
  page: number; pages: number; total: number; onPage: (p: number) => void
}) {
  if (pages <= 1) return null
  const visiblePages = Array.from({ length: Math.min(pages, 5) }, (_, i) => {
    if (pages <= 5) return i + 1
    if (page <= 3) return i + 1
    if (page >= pages - 2) return pages - 4 + i
    return page - 2 + i
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--sp-4)', flexWrap: 'wrap', gap: 8 }}>
      <span style={{ fontSize: 13, color: 'var(--c-text-faint)' }}>
        Menampilkan {((page - 1) * 50) + 1}–{Math.min(page * 50, total)} dari {total.toLocaleString('id')} data
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        <PagBtn disabled={page === 1}      onClick={() => onPage(page - 1)}>←</PagBtn>
        {visiblePages[0] > 1 && (
          <>
            <PagBtn onClick={() => onPage(1)}>1</PagBtn>
            {visiblePages[0] > 2 && <span style={{ padding: '5px 4px', color: 'var(--c-text-faint)', fontSize: 13 }}>…</span>}
          </>
        )}
        {visiblePages.map(p => (
          <PagBtn key={p} active={p === page} onClick={() => onPage(p)}>{p}</PagBtn>
        ))}
        {visiblePages[visiblePages.length - 1] < pages && (
          <>
            {visiblePages[visiblePages.length - 1] < pages - 1 && <span style={{ padding: '5px 4px', color: 'var(--c-text-faint)', fontSize: 13 }}>…</span>}
            <PagBtn onClick={() => onPage(pages)}>{pages}</PagBtn>
          </>
        )}
        <PagBtn disabled={page === pages} onClick={() => onPage(page + 1)}>→</PagBtn>
      </div>
    </div>
  )
}

function PagBtn({ children, active, disabled, onClick }: {
  children: React.ReactNode; active?: boolean; disabled?: boolean; onClick?: () => void
}) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        padding: '5px 12px', borderRadius: 'var(--r-sm)', fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer',
        background: active ? 'var(--c-secondary)' : 'var(--c-surface)',
        color: active ? 'white' : disabled ? 'var(--c-text-faint)' : 'var(--c-text-secondary)',
        border: `1px solid ${active ? 'var(--c-secondary)' : 'var(--c-border)'}`,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}
