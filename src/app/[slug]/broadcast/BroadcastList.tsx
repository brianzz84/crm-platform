'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface Campaign {
  id: string; nama: string; status: string; channel: string
  jadwal_kirim: string | null; total_penerima: number
  total_terkirim: number; total_dibaca: number; total_dibalas: number
  created_at: string
  segment: { id: string; nama: string } | null
}
interface Meta { page: number; perPage: number; total: number; totalPages: number }

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:     { label: 'Draft',     color: '#6B7B8D', bg: '#F1F3F6' },
  SCHEDULED: { label: 'Terjadwal', color: '#7B5EA7', bg: '#F3EEF9' },
  RUNNING:   { label: 'Berjalan',  color: '#9A6C00', bg: '#FDF3DC' },
  DONE:      { label: 'Selesai',   color: '#278B58', bg: '#E8F5E9' },
  FAILED:    { label: 'Gagal',     color: '#C0392B', bg: '#FDECEA' },
}

const CH_ICON: Record<string, string> = { WA: '📱', IG: '📸', FB: '📘' }
const CH_LABEL: Record<string, string> = { WA: 'WhatsApp', IG: 'Instagram', FB: 'Facebook' }

const STATUS_FILTERS = [
  { value: '', label: 'Semua Status' },
  { value: 'DRAFT',     label: 'Draft' },
  { value: 'SCHEDULED', label: 'Terjadwal' },
  { value: 'RUNNING',   label: 'Berjalan' },
  { value: 'DONE',      label: 'Selesai' },
  { value: 'FAILED',    label: 'Gagal' },
]

function pct(num: number, den: number) {
  if (!den) return '—'
  return Math.round((num / den) * 100) + '%'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function BroadcastList({ slug }: { slug: string }) {
  const [items, setItems]   = useState<Campaign[]>([])
  const [meta, setMeta]     = useState<Meta | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [page, setPage]     = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(page), ...(status ? { status } : {}) })
      const res = await fetch(`/api/${slug}/broadcast?${p}`)
      const json = await res.json()
      if (json.success) { setItems(json.data); setMeta(json.meta) }
    } catch { /* noop */ }
    finally { setLoading(false) }
  }, [slug, page, status])

  useEffect(() => { load() }, [load])

  return (
    <div>
      {/* Toolbar */}
      <div style={{
        background: 'white', border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-lg)', padding: 'var(--sp-3) var(--sp-4)',
        marginBottom: 'var(--sp-4)',
        display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', flexWrap: 'wrap',
      }}>
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
          style={{
            padding: '8px 28px 8px 12px', fontFamily: 'inherit',
            fontSize: 'var(--font-size-sm)', border: '1.5px solid var(--c-border)',
            borderRadius: 'var(--r-md)', background: 'white', color: 'var(--c-text)', outline: 'none', cursor: 'pointer',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236B7B8D' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
          }}
        >
          {STATUS_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>

        {meta && (
          <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
            <strong style={{ color: 'var(--c-primary)' }}>{meta.total}</strong> campaign
          </span>
        )}

        <button onClick={load} style={{
          padding: '8px var(--sp-4)', borderRadius: 'var(--r-md)',
          border: '1.5px solid var(--c-secondary)', background: 'white',
          color: 'var(--c-secondary)', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer',
        }}>↻ Refresh</button>
      </div>

      {/* Cards */}
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--c-text-muted)' }}>Memuat...</div>
      ) : items.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--c-text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📢</div>
          <div>Belum ada campaign. <Link href={`/${slug}/broadcast/buat`} style={{ color: 'var(--c-secondary)' }}>Buat sekarang</Link></div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          {items.map(c => {
            const sc = STATUS_CFG[c.status] ?? STATUS_CFG.DRAFT
            return (
              <div key={c.id} style={{
                background: 'white', border: '1px solid var(--c-border)',
                borderRadius: 'var(--r-lg)', padding: 'var(--sp-5)',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex', gap: 'var(--sp-5)', flexWrap: 'wrap', alignItems: 'flex-start',
              }}>
                {/* Left */}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 18 }}>{CH_ICON[c.channel] ?? '📢'}</span>
                    <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--c-primary)', margin: 0 }}>
                      {c.nama}
                    </h3>
                    <span style={{
                      padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                      color: sc.color, background: sc.bg,
                    }}>
                      {sc.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--c-text-muted)', display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
                    <span>Channel: {CH_LABEL[c.channel] ?? c.channel}</span>
                    {c.segment && <span>Segmen: {c.segment.nama}</span>}
                    {c.jadwal_kirim
                      ? <span>📅 Jadwal: {fmtDateTime(c.jadwal_kirim)}</span>
                      : <span style={{ color: 'var(--c-text-faint)' }}>Kirim segera</span>}
                    <span>Dibuat {fmtDate(c.created_at)}</span>
                  </div>
                </div>

                {/* Stats */}
                {c.total_penerima > 0 && (
                  <div style={{ display: 'flex', gap: 'var(--sp-4)', flexShrink: 0, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Penerima',  val: c.total_penerima.toLocaleString('id-ID'), pct: null },
                      { label: 'Terkirim',  val: c.total_terkirim.toLocaleString('id-ID'), pct: pct(c.total_terkirim, c.total_penerima) },
                      { label: 'Dibaca',    val: c.total_dibaca.toLocaleString('id-ID'),   pct: pct(c.total_dibaca, c.total_terkirim) },
                      { label: 'Dibalas',   val: c.total_dibalas.toLocaleString('id-ID'),  pct: pct(c.total_dibalas, c.total_terkirim) },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--c-primary)' }}>{s.val}</div>
                        {s.pct && <div style={{ fontSize: 11, color: 'var(--c-secondary)', fontWeight: 600 }}>{s.pct}</div>}
                        <div style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                  <Link href={`/${slug}/broadcast/${c.id}`} style={{
                    padding: '7px 14px', borderRadius: 'var(--r-md)',
                    border: '1.5px solid var(--c-secondary)', color: 'var(--c-secondary)',
                    fontSize: 12, fontWeight: 600, textDecoration: 'none', textAlign: 'center',
                  }}>
                    Detail →
                  </Link>
                  {c.status === 'DRAFT' && (
                    <Link href={`/${slug}/broadcast/buat?edit=${c.id}`} style={{
                      padding: '7px 14px', borderRadius: 'var(--r-md)',
                      background: 'var(--c-secondary)', color: 'white',
                      fontSize: 12, fontWeight: 600, textDecoration: 'none', textAlign: 'center',
                    }}>
                      ✏ Edit
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div style={{
          marginTop: 'var(--sp-4)', display: 'flex', justifyContent: 'center', gap: 'var(--sp-2)',
        }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            style={{ padding: '7px 16px', borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)', background: 'white', cursor: page <= 1 ? 'not-allowed' : 'pointer', color: page <= 1 ? 'var(--c-text-faint)' : 'var(--c-text)', fontSize: 13 }}>
            ‹ Sebelumnya
          </button>
          <span style={{ padding: '7px 12px', fontSize: 13, color: 'var(--c-text-muted)' }}>
            {page} / {meta.totalPages}
          </span>
          <button onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))} disabled={page >= meta.totalPages}
            style={{ padding: '7px 16px', borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)', background: 'white', cursor: page >= meta.totalPages ? 'not-allowed' : 'pointer', color: page >= meta.totalPages ? 'var(--c-text-faint)' : 'var(--c-text)', fontSize: 13 }}>
            Berikutnya ›
          </button>
        </div>
      )}
    </div>
  )
}
