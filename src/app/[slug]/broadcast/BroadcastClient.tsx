'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Campaign {
  id: string; nama: string; status: string
  jadwal_kirim: string | null; started_at: string | null; finished_at: string | null
  total_penerima: number; total_terkirim: number; total_diterima: number
  total_dibaca: number; total_dibalas: number; total_gagal: number
  template_nama: string | null; segment_nama: string | null
  creator_name: string; created_at: string
}

interface Template { id: string; nama: string; template_name: string; preview_text: string }
interface Segment  { id: string; nama: string; total: number }

interface Props {
  slug: string
  initialCampaigns: Campaign[]
  templates: Template[]
  segments: Segment[]
  wappinAktif: boolean
}

const STATUS_COLOR: Record<string, { bg: string; color: string; label: string; dot: string }> = {
  DRAFT:     { bg: '#F1F5F9', color: '#64748B', label: 'Draft',     dot: '#94A3B8' },
  SCHEDULED: { bg: '#EFF6FF', color: '#3B82F6', label: 'Terjadwal', dot: '#3B82F6' },
  RUNNING:   { bg: '#FEF3C7', color: '#D97706', label: 'Berjalan',  dot: '#F59E0B' },
  DONE:      { bg: '#F0FDF4', color: '#22C55E', label: 'Selesai',   dot: '#22C55E' },
  FAILED:    { bg: '#FEF2F2', color: '#EF4444', label: 'Gagal',     dot: '#EF4444' },
}

function pct(n: number, total: number) {
  if (!total) return '—'
  return `${Math.round((n / total) * 100)}%`
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'baru saja'
  if (h < 24) return `${h} jam lalu`
  return `${Math.floor(h / 24)} hari lalu`
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const FILTERS = ['all', 'DRAFT', 'SCHEDULED', 'RUNNING', 'DONE', 'FAILED']

export default function BroadcastClient({ slug, initialCampaigns, templates, segments, wappinAktif }: Props) {
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  const [filter,    setFilter]    = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [form,      setForm]      = useState({ nama: '', template_id: '', segment_id: '', jadwal_kirim: '' })
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [isMobile,  setIsMobile]  = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  const filtered = filter === 'all' ? campaigns : campaigns.filter(c => c.status === filter)

  async function handleCreate() {
    if (!form.nama.trim())  { setError('Nama campaign wajib diisi'); return }
    if (!form.template_id)  { setError('Pilih template pesan'); return }
    if (!form.segment_id)   { setError('Pilih segmen penerima'); return }
    setSaving(true); setError('')
    try {
      const res  = await fetch(`/api/${slug}/broadcast`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama: form.nama, template_id: form.template_id, segment_id: form.segment_id, jadwal_kirim: form.jadwal_kirim || null }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Gagal membuat campaign'); return }
      setCampaigns(prev => [json.data, ...prev])
      setShowModal(false)
      setForm({ nama: '', template_id: '', segment_id: '', jadwal_kirim: '' })
    } finally { setSaving(false) }
  }

  async function handleSend(id: string) {
    if (!wappinAktif) { alert('Konfigurasi Wappin belum diatur'); return }
    if (!confirm('Mulai kirim campaign ini sekarang?')) return
    const res  = await fetch(`/api/${slug}/broadcast/${id}/send`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok) { alert(json.error || 'Gagal memulai pengiriman'); return }
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'RUNNING' } : c))
    alert(json.message || 'Campaign dimulai')
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus campaign ini?')) return
    await fetch(`/api/${slug}/broadcast/${id}`, { method: 'DELETE' })
    setCampaigns(prev => prev.filter(c => c.id !== id))
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontFamily: 'inherit',
    fontSize: 'var(--font-size-sm)', border: '1.5px solid var(--c-border)',
    borderRadius: 'var(--r-sm)', outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 700,
    color: 'var(--c-text)', marginBottom: 4,
  }

  // ── Toolbar ─────────────────────────────────────────────────
  const toolbar = isMobile ? (
    <div style={{ marginBottom: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      {/* Tombol aksi */}
      <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
        <button onClick={() => setShowModal(true)} style={{
          flex: 1, padding: '10px 16px', borderRadius: 'var(--r-md)',
          background: 'var(--c-secondary)', border: 'none', color: 'white',
          fontFamily: 'inherit', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer',
        }}>
          + Buat Campaign
        </button>
        <a href={`/${slug}/broadcast/templates`} style={{
          padding: '10px 14px', borderRadius: 'var(--r-md)',
          border: '1.5px solid var(--c-border)', background: 'white',
          color: 'var(--c-text-muted)', fontFamily: 'inherit',
          fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          📋 Template
        </a>
      </div>
      {/* Filter — select dropdown di mobile */}
      <select
        value={filter}
        onChange={e => setFilter(e.target.value)}
        style={{
          width: '100%', padding: '9px 32px 9px 12px', fontFamily: 'inherit',
          fontSize: 'var(--font-size-sm)', border: '1.5px solid var(--c-border)',
          borderRadius: 'var(--r-md)', background: 'white', color: 'var(--c-text)', outline: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236B7B8D' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
        }}
      >
        {FILTERS.map(s => (
          <option key={s} value={s}>
            {s === 'all' ? `Semua (${campaigns.length})` : `${STATUS_COLOR[s]?.label} (${campaigns.filter(c => c.status === s).length})`}
          </option>
        ))}
      </select>
    </div>
  ) : (
    <div style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)', flexWrap: 'wrap', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {FILTERS.map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600,
            border: '1.5px solid', fontFamily: 'inherit', cursor: 'pointer',
            borderColor: filter === s ? 'var(--c-primary)' : 'var(--c-border)',
            background:  filter === s ? 'var(--c-primary)' : 'var(--c-bg)',
            color:       filter === s ? 'white' : 'var(--c-text-muted)',
          }}>
            {s === 'all' ? 'Semua' : STATUS_COLOR[s]?.label || s}
            {' '}<span style={{ opacity: 0.7 }}>({s === 'all' ? campaigns.length : campaigns.filter(c => c.status === s).length})</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
        <a href={`/${slug}/broadcast/templates`} style={{
          padding: '9px 16px', borderRadius: 'var(--r-md)', background: 'var(--c-bg)',
          border: '1.5px solid var(--c-border)', color: 'var(--c-text)', fontFamily: 'inherit',
          fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer', textDecoration: 'none',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>📋 Kelola Template</a>
        <button onClick={() => setShowModal(true)} style={{
          padding: '9px 20px', borderRadius: 'var(--r-md)', background: 'var(--c-secondary)',
          border: 'none', color: 'white', fontFamily: 'inherit',
          fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer',
        }}>+ Buat Campaign</button>
      </div>
    </div>
  )

  // ── Empty state ─────────────────────────────────────────────
  const emptyState = (
    <div style={{ textAlign: 'center', padding: 'var(--sp-12)', color: 'var(--c-text-faint)', background: 'white', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📢</div>
      <div>Belum ada campaign.</div>
    </div>
  )

  // ── Mobile card list ─────────────────────────────────────────
  const mobileCards = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {filtered.map(c => {
        const st = STATUS_COLOR[c.status] ?? STATUS_COLOR.DRAFT
        const hasStats = c.total_penerima > 0
        return (
          <div key={c.id} style={{
            background: 'white', border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-lg)', overflow: 'hidden',
            boxShadow: 'var(--shadow-xs)',
          }}>
            {/* Header card */}
            <div style={{ padding: '12px 14px 10px', borderBottom: hasStats ? '1px solid var(--c-border)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <Link href={`/${slug}/broadcast/${c.id}`} style={{ fontWeight: 700, fontSize: 15, color: 'var(--c-primary)', textDecoration: 'none', flex: 1 }}>
                  {c.nama}
                </Link>
                <span style={{
                  flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                  background: st.bg, color: st.color,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />
                  {st.label}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontSize: 12, color: 'var(--c-text-muted)' }}>
                {c.segment_nama && <span>👥 {c.segment_nama}</span>}
                {c.template_nama && <span>📋 {c.template_nama}</span>}
                <span style={{ color: 'var(--c-text-faint)' }}>{timeAgo(c.created_at)}</span>
              </div>
            </div>

            {/* Stats bar */}
            {hasStats && (
              <div style={{ display: 'flex', borderBottom: '1px solid var(--c-border)' }}>
                {[
                  { label: 'Penerima', val: c.total_penerima.toLocaleString('id'), sub: null },
                  { label: 'Terkirim', val: pct(c.total_terkirim, c.total_penerima), sub: c.total_terkirim },
                  { label: 'Dibaca',   val: pct(c.total_dibaca, c.total_terkirim),   sub: c.total_dibaca },
                  { label: 'Dibalas',  val: pct(c.total_dibalas, c.total_terkirim),  sub: c.total_dibalas },
                ].map((s, i) => (
                  <div key={s.label} style={{
                    flex: 1, textAlign: 'center', padding: '8px 4px',
                    borderRight: i < 3 ? '1px solid var(--c-border)' : 'none',
                  }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--c-primary)' }}>{s.val}</div>
                    <div style={{ fontSize: 10, color: 'var(--c-text-faint)', marginTop: 1 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, padding: '10px 14px' }}>
              <Link href={`/${slug}/broadcast/${c.id}`} style={{
                flex: 1, textAlign: 'center', padding: '7px 12px',
                borderRadius: 'var(--r-sm)', border: '1.5px solid var(--c-secondary)',
                color: 'var(--c-secondary)', fontSize: 12, fontWeight: 600,
                textDecoration: 'none',
              }}>
                Detail →
              </Link>
              {(c.status === 'DRAFT' || c.status === 'SCHEDULED') && (
                <button onClick={() => handleSend(c.id)} style={{
                  flex: 1, padding: '7px 12px', borderRadius: 'var(--r-sm)',
                  background: 'var(--c-secondary)', border: 'none',
                  fontSize: 12, fontWeight: 600, color: 'white',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>▶ Kirim</button>
              )}
              {c.status === 'DRAFT' && (
                <button onClick={() => handleDelete(c.id)} style={{
                  padding: '7px 12px', borderRadius: 'var(--r-sm)',
                  background: 'none', border: '1.5px solid #EF4444',
                  fontSize: 12, fontWeight: 600, color: '#EF4444',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>Hapus</button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )

  // ── Desktop table ────────────────────────────────────────────
  const desktopTable = (
    <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--c-bg)', borderBottom: '1px solid var(--c-border)' }}>
            {['Nama Campaign', 'Status', 'Segmen / Template', 'Penerima', 'Terkirim', 'Dibaca', 'Jadwal', 'Aksi'].map(h => (
              <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textAlign: 'left', color: 'var(--c-text-faint)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((c, i) => {
            const st = STATUS_COLOR[c.status] || STATUS_COLOR.DRAFT
            return (
              <tr key={c.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--c-border)' : 'none', background: 'var(--c-surface)' }}>
                <td style={{ padding: '12px 14px' }}>
                  <Link href={`/${slug}/broadcast/${c.id}`} style={{ fontWeight: 700, color: 'var(--c-primary)', textDecoration: 'none', fontSize: 'var(--font-size-sm)' }}>
                    {c.nama}
                  </Link>
                  <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 2 }}>{timeAgo(c.created_at)} oleh {c.creator_name}</div>
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>
                    {st.label}
                  </span>
                </td>
                <td style={{ padding: '12px 14px', fontSize: 12 }}>
                  <div style={{ color: 'var(--c-text)', fontWeight: 600 }}>{c.segment_nama ?? '—'}</div>
                  <div style={{ color: 'var(--c-text-faint)' }}>{c.template_nama ?? '—'}</div>
                </td>
                <td style={{ padding: '12px 14px', fontSize: 'var(--font-size-sm)', fontWeight: 700, textAlign: 'center' }}>
                  {c.total_penerima.toLocaleString('id')}
                </td>
                <td style={{ padding: '12px 14px', fontSize: 'var(--font-size-sm)', textAlign: 'center' }}>
                  <div style={{ fontWeight: 700 }}>{pct(c.total_terkirim, c.total_penerima)}</div>
                  <div style={{ fontSize: 10, color: 'var(--c-text-faint)' }}>{c.total_terkirim} kirim</div>
                </td>
                <td style={{ padding: '12px 14px', fontSize: 'var(--font-size-sm)', textAlign: 'center' }}>
                  <div style={{ fontWeight: 700 }}>{pct(c.total_dibaca, c.total_terkirim)}</div>
                  <div style={{ fontSize: 10, color: 'var(--c-text-faint)' }}>{c.total_dibaca} baca</div>
                </td>
                <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--c-text-muted)', whiteSpace: 'nowrap' }}>
                  {c.jadwal_kirim ? fmtDate(c.jadwal_kirim) : 'Kirim Sekarang'}
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Link href={`/${slug}/broadcast/${c.id}`} style={{ padding: '5px 10px', borderRadius: 'var(--r-sm)', background: 'var(--c-bg)', border: '1px solid var(--c-border)', fontSize: 11, fontWeight: 600, color: 'var(--c-text)', textDecoration: 'none' }}>
                      Detail
                    </Link>
                    {(c.status === 'DRAFT' || c.status === 'SCHEDULED') && (
                      <button onClick={() => handleSend(c.id)} style={{ padding: '5px 10px', borderRadius: 'var(--r-sm)', background: '#0089A8', border: 'none', fontSize: 11, fontWeight: 600, color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Kirim
                      </button>
                    )}
                    {c.status === 'DRAFT' && (
                      <button onClick={() => handleDelete(c.id)} style={{ padding: '5px 10px', borderRadius: 'var(--r-sm)', background: 'none', border: '1px solid #EF4444', fontSize: 11, fontWeight: 600, color: '#EF4444', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Hapus
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <div>
      {toolbar}

      {filtered.length === 0
        ? emptyState
        : isMobile ? mobileCards : desktopTable
      }

      {/* Modal Buat Campaign */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 'var(--sp-4)' }}>
          <div style={{ background: 'var(--c-surface)', borderRadius: 'var(--r-xl)', padding: 'var(--sp-6)', width: '100%', maxWidth: 540, boxShadow: 'var(--shadow-lg)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontWeight: 800, fontSize: 'var(--font-size-lg)', color: 'var(--c-primary)', marginBottom: 'var(--sp-5)' }}>
              Buat Campaign Broadcast
            </h2>

            <div style={{ marginBottom: 'var(--sp-4)' }}>
              <label style={labelStyle}>Nama Campaign *</label>
              <input value={form.nama} onChange={e => setForm(p => ({ ...p, nama: e.target.value }))}
                placeholder="Contoh: Promo Ramadan 2026" style={inputStyle} />
            </div>

            <div style={{ marginBottom: 'var(--sp-4)' }}>
              <label style={labelStyle}>Template Pesan *</label>
              {templates.length === 0 ? (
                <div style={{ padding: '10px 12px', background: '#FEF3C7', borderRadius: 'var(--r-sm)', fontSize: 12, color: '#92400E' }}>
                  Belum ada template. <Link href={`/${slug}/broadcast/template`} style={{ fontWeight: 700, color: '#92400E' }}>Tambah template</Link> dulu.
                </div>
              ) : (
                <select value={form.template_id} onChange={e => setForm(p => ({ ...p, template_id: e.target.value }))} style={inputStyle}>
                  <option value="">-- Pilih Template --</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.nama} ({t.template_name})</option>
                  ))}
                </select>
              )}
              {form.template_id && (
                <div style={{ marginTop: 6, padding: '8px 12px', background: 'var(--c-bg)', borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--c-text-muted)', borderLeft: '3px solid var(--c-secondary)' }}>
                  {templates.find(t => t.id === form.template_id)?.preview_text || 'Tidak ada preview'}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 'var(--sp-4)' }}>
              <label style={labelStyle}>Segmen Penerima *</label>
              <select value={form.segment_id} onChange={e => setForm(p => ({ ...p, segment_id: e.target.value }))} style={inputStyle}>
                <option value="">-- Pilih Segmen --</option>
                {segments.map(s => (
                  <option key={s.id} value={s.id}>{s.nama} ({s.total.toLocaleString('id')} pasien)</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 'var(--sp-5)' }}>
              <label style={labelStyle}>Jadwal Kirim (kosongkan = kirim manual)</label>
              <input type="datetime-local" value={form.jadwal_kirim} onChange={e => setForm(p => ({ ...p, jadwal_kirim: e.target.value }))} style={inputStyle} />
            </div>

            {error && (
              <div style={{ background: '#FEF2F2', color: '#B91C1C', borderRadius: 'var(--r-sm)', padding: '10px 14px', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--sp-4)', borderLeft: '3px solid #EF4444' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowModal(false); setError('') }} style={{ padding: '10px 20px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--c-border)', background: 'var(--c-bg)', fontFamily: 'inherit', fontSize: 'var(--font-size-sm)', cursor: 'pointer' }}>
                Batal
              </button>
              <button onClick={handleCreate} disabled={saving} style={{ padding: '10px 24px', borderRadius: 'var(--r-md)', background: saving ? '#94A3B8' : 'var(--c-secondary)', border: 'none', color: 'white', fontFamily: 'inherit', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Menyimpan...' : 'Simpan Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
