'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import TagChip from '@/components/pasien/TagChip'
import UnitBadge from '@/components/pasien/UnitBadge'

interface PersonRow {
  id: string
  name: string
  no_hp: string
  no_rm: string | null
  email: string | null
  last_simrs_sync_at: string | null
  tags: { tag: { name: string; warna: string }; sumber: string }[]
  visits: { tanggal: string; poli: string | null; unit: string; diagnosa_nama: string | null }[]
  _count: { conversations: number; campaign_recipients: number }
}

interface Meta { page: number; perPage: number; total: number; totalPages: number }

const UNIT_OPTIONS = [
  { value: '',             label: 'Semua Unit' },
  { value: 'RAWAT_JALAN', label: 'Rawat Jalan' },
  { value: 'RAWAT_INAP',  label: 'Rawat Inap' },
  { value: 'PENUNJANG',   label: 'Penunjang' },
]

const UNIT_COLOR: Record<string, { bg: string; color: string }> = {
  RAWAT_JALAN: { bg: '#E0F4F4', color: '#006E89' },
  RAWAT_INAP:  { bg: '#EDE7F6', color: '#512DA8' },
  PENUNJANG:   { bg: '#FFF8E1', color: '#92400E' },
}

export default function PasienTable({ slug }: { slug: string }) {
  const [persons, setPersons]   = useState<PersonRow[]>([])
  const [meta, setMeta]         = useState<Meta | null>(null)
  const [loading, setLoading]   = useState(true)
  const [q, setQ]               = useState('')
  const [unit, setUnit]         = useState('')
  const [page, setPage]         = useState(1)
  const [debouncedQ, setDebouncedQ] = useState('')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [q])

  const fetch_ = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), q: debouncedQ, unit })
      const res  = await fetch(`/api/${slug}/pasien?${params}`)
      const json = await res.json()
      if (json.success) { setPersons(json.data); setMeta(json.meta) }
    } catch { /* noop */ }
    finally { setLoading(false) }
  }, [slug, page, debouncedQ, unit])

  useEffect(() => { fetch_() }, [fetch_])

  const lastVisit = (p: PersonRow) => p.visits[0]

  // ── Toolbar ──────────────────────────────────────────────────
  const toolbar = (
    <div style={{
      background: 'white', border: '1px solid var(--c-border)',
      borderRadius: 'var(--r-lg)', padding: 'var(--sp-3) var(--sp-4)',
      marginBottom: 'var(--sp-4)',
      display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap', alignItems: 'center',
    }}>
      <div style={{ position: 'relative', flex: '1 1 200px' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-faint)', fontSize: 15 }}>🔍</span>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Cari nama, no HP, no RM..."
          style={{
            width: '100%', padding: '9px 12px 9px 36px',
            fontFamily: 'inherit', fontSize: 'var(--font-size-sm)',
            border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-full)',
            outline: 'none', background: 'var(--c-bg)', color: 'var(--c-text)',
          }}
        />
      </div>

      <select
        value={unit}
        onChange={e => { setUnit(e.target.value); setPage(1) }}
        style={{
          padding: '9px 32px 9px 12px', fontFamily: 'inherit',
          fontSize: 'var(--font-size-sm)', border: '1.5px solid var(--c-border)',
          borderRadius: 'var(--r-md)', background: 'white', color: 'var(--c-text)',
          outline: 'none', cursor: 'pointer',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236B7B8D' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
          flexShrink: 0,
        }}
      >
        {UNIT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {meta && (
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', marginLeft: 'auto' }}>
          <strong style={{ color: 'var(--c-primary)' }}>{meta.total.toLocaleString('id-ID')}</strong> pasien
        </span>
      )}

      <button
        onClick={fetch_}
        style={{
          padding: '9px var(--sp-4)', borderRadius: 'var(--r-md)',
          border: '1.5px solid var(--c-secondary)', background: 'white',
          color: 'var(--c-secondary)', fontSize: 'var(--font-size-sm)',
          fontWeight: 600, cursor: 'pointer',
        }}
      >
        ↻
      </button>
    </div>
  )

  // ── Pagination ────────────────────────────────────────────────
  const pagination = meta && meta.totalPages > 1 ? (
    <div style={{
      padding: 'var(--sp-3) var(--sp-4)',
      borderTop: '1px solid var(--c-border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontSize: 'var(--font-size-sm)', flexWrap: 'wrap', gap: 8,
    }}>
      <span style={{ color: 'var(--c-text-muted)' }}>
        Halaman {meta.page} dari {meta.totalPages}
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={meta.page <= 1}
          style={{
            padding: '6px 14px', borderRadius: 'var(--r-sm)',
            border: '1px solid var(--c-border)', background: 'white',
            color: meta.page <= 1 ? 'var(--c-text-faint)' : 'var(--c-text)',
            cursor: meta.page <= 1 ? 'not-allowed' : 'pointer', fontSize: 13,
          }}
        >‹ Sebelumnya</button>
        <button
          onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
          disabled={meta.page >= meta.totalPages}
          style={{
            padding: '6px 14px', borderRadius: 'var(--r-sm)',
            border: '1px solid var(--c-border)', background: 'white',
            color: meta.page >= meta.totalPages ? 'var(--c-text-faint)' : 'var(--c-text)',
            cursor: meta.page >= meta.totalPages ? 'not-allowed' : 'pointer', fontSize: 13,
          }}
        >Berikutnya ›</button>
      </div>
    </div>
  ) : null

  // ── Mobile card list ──────────────────────────────────────────
  if (isMobile) {
    return (
      <div>
        {toolbar}

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--c-text-muted)', background: 'white', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)' }}>
            Memuat data...
          </div>
        ) : persons.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--c-text-muted)', background: 'white', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>👥</div>
            Tidak ada pasien ditemukan
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {persons.map(p => {
              const lv = lastVisit(p)
              const uc = UNIT_COLOR[lv?.unit ?? '']
              const initials = p.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
              return (
                <Link
                  key={p.id}
                  href={`/${slug}/pasien/${p.id}`}
                  style={{ textDecoration: 'none' }}
                >
                  <div style={{
                    background: 'white',
                    border: '1px solid var(--c-border)',
                    borderRadius: 'var(--r-lg)',
                    padding: 'var(--sp-4)',
                    boxShadow: 'var(--shadow-xs)',
                    display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-start',
                  }}>
                    {/* Avatar */}
                    <div style={{
                      width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--c-primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, fontWeight: 800, color: 'white',
                    }}>
                      {initials}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Nama + RM */}
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--c-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </div>
                        {p.no_rm && (
                          <span style={{ fontSize: 10, color: 'var(--c-text-faint)', flexShrink: 0 }}>RM {p.no_rm}</span>
                        )}
                      </div>

                      {/* Kontak */}
                      <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
                        {p.no_hp && (
                          <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>📱 {p.no_hp}</span>
                        )}
                        {p._count.conversations > 0 && (
                          <span style={{ fontSize: 12, color: 'var(--c-secondary)' }}>💬 {p._count.conversations}</span>
                        )}
                        {p._count.campaign_recipients > 0 && (
                          <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>📢 {p._count.campaign_recipients}</span>
                        )}
                      </div>

                      {/* Kunjungan terakhir + unit */}
                      {lv ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: p.tags.length > 0 ? 8 : 0, flexWrap: 'wrap' }}>
                          {uc && (
                            <span style={{
                              fontSize: 11, fontWeight: 600,
                              padding: '2px 8px', borderRadius: 99,
                              background: uc.bg, color: uc.color,
                            }}>
                              {lv.unit.replace('_', ' ')}
                            </span>
                          )}
                          {lv.poli && (
                            <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>{lv.poli}</span>
                          )}
                          <span style={{ fontSize: 11, color: 'var(--c-text-faint)', marginLeft: 'auto' }}>
                            {new Date(lv.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--c-text-faint)', marginBottom: p.tags.length > 0 ? 8 : 0 }}>
                          Belum ada kunjungan
                        </div>
                      )}

                      {/* Tags — hanya tampilkan jumlah, tidak expand */}
                      {p.tags.length > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>
                          🏷 {p.tags.length} tag
                        </span>
                      )}
                    </div>

                    {/* Arrow */}
                    <span style={{ color: 'var(--c-text-faint)', fontSize: 18, flexShrink: 0, alignSelf: 'center' }}>›</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {/* Pagination mobile */}
        {meta && meta.totalPages > 1 && (
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--c-text-muted)' }}>
              {meta.page} / {meta.totalPages}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={meta.page <= 1}
                style={{
                  padding: '8px 18px', borderRadius: 'var(--r-md)',
                  border: '1px solid var(--c-border)', background: 'white',
                  color: meta.page <= 1 ? 'var(--c-text-faint)' : 'var(--c-text)',
                  cursor: meta.page <= 1 ? 'not-allowed' : 'pointer', fontSize: 13,
                }}
              >‹ Prev</button>
              <button
                onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
                disabled={meta.page >= meta.totalPages}
                style={{
                  padding: '8px 18px', borderRadius: 'var(--r-md)',
                  border: '1px solid var(--c-border)', background: 'white',
                  color: meta.page >= meta.totalPages ? 'var(--c-text-faint)' : 'var(--c-text)',
                  cursor: meta.page >= meta.totalPages ? 'not-allowed' : 'pointer', fontSize: 13,
                }}
              >Next ›</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Desktop table ─────────────────────────────────────────────
  return (
    <div>
      {toolbar}

      <div style={{ background: 'white', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
            <thead>
              <tr>
                {['Pasien', 'No HP', 'No RM', 'Unit / Poli', 'Kunjungan Terakhir', 'Tag', 'Aktivitas', ''].map(h => (
                  <th key={h} style={{
                    background: 'var(--c-bg)', padding: '10px 16px', textAlign: 'left',
                    fontSize: 11, fontWeight: 700, color: 'var(--c-text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                    borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: 48, textAlign: 'center', color: 'var(--c-text-muted)' }}>
                    Memuat data...
                  </td>
                </tr>
              ) : persons.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 48, textAlign: 'center', color: 'var(--c-text-muted)' }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>👥</div>
                    Tidak ada pasien ditemukan
                  </td>
                </tr>
              ) : persons.map(p => {
                const lv = lastVisit(p)
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--c-border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--c-primary-ghost)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <Link href={`/${slug}/pasien/${p.id}`} style={{ textDecoration: 'none' }}>
                        <div style={{ fontWeight: 600, color: 'var(--c-primary)' }}>{p.name}</div>
                        {p.email && <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 1 }}>{p.email}</div>}
                      </Link>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--c-text-muted)', whiteSpace: 'nowrap' }}>
                      {p.no_hp}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--c-text-muted)' }}>
                      {p.no_rm || <span style={{ color: 'var(--c-text-faint)' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      {lv ? (
                        <div>
                          <UnitBadge unit={lv.unit} />
                          {lv.poli && <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginTop: 2 }}>{lv.poli}</div>}
                        </div>
                      ) : <span style={{ color: 'var(--c-text-faint)' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      {lv ? (
                        <div>
                          <div style={{ color: 'var(--c-text)' }}>
                            {new Date(lv.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                          {lv.diagnosa_nama && (
                            <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginTop: 1, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {lv.diagnosa_nama}
                            </div>
                          )}
                        </div>
                      ) : <span style={{ color: 'var(--c-text-faint)' }}>Belum ada</span>}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {p.tags.slice(0, 3).map((pt, i) => (
                          <TagChip key={i} name={pt.tag.name} warna={pt.tag.warna} sumber={pt.sumber} />
                        ))}
                        {p.tags.length > 3 && (
                          <span style={{ fontSize: 11, color: 'var(--c-text-faint)', alignSelf: 'center' }}>+{p.tags.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {p._count.conversations > 0 && (
                          <span style={{ fontSize: 11, color: 'var(--c-secondary)' }}>💬 {p._count.conversations}</span>
                        )}
                        {p._count.campaign_recipients > 0 && (
                          <span style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>📢 {p._count.campaign_recipients}</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <Link
                        href={`/${slug}/pasien/${p.id}`}
                        style={{
                          padding: '5px 12px', borderRadius: 'var(--r-sm)',
                          border: '1.5px solid var(--c-secondary)',
                          color: 'var(--c-secondary)', fontSize: 12, fontWeight: 600,
                          background: 'white', textDecoration: 'none',
                          display: 'inline-block',
                        }}
                      >
                        Detail →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {pagination}
      </div>
    </div>
  )
}
