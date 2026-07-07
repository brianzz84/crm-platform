'use client'

import { useEffect, useState } from 'react'

interface Kegiatan {
  id: string
  kode: string
  nama: string
  jenis: string
  lokasi: string | null
  tanggal_mulai: string
  tanggal_selesai: string | null
  status: string
  pesertaCount: number
}

const STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  aktif:   { bg: '#DCFCE7', color: '#166534', label: 'Aktif' },
  selesai: { bg: '#F1F5F9', color: '#64748B', label: 'Selesai' },
  draft:   { bg: '#FEF9C3', color: '#854D0E', label: 'Draft' },
}

const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des']

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export default function KegiatanList({ slug, kegiatan }: { slug: string; kegiatan: Kegiatan[] }) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  if (kegiatan.length === 0) {
    return (
      <div style={{
        background: 'white', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)',
        padding: 'var(--sp-12)', textAlign: 'center', color: 'var(--c-text-faint)',
      }}>
        <div style={{ fontSize: 48, marginBottom: 'var(--sp-3)' }}>📅</div>
        <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 4 }}>Belum ada kegiatan</div>
        <div style={{ fontSize: 'var(--font-size-sm)' }}>Mulai dengan menambahkan kegiatan pertama</div>
      </div>
    )
  }

  // ── Mobile card list ──────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {kegiatan.map(k => {
          const st = STATUS_CFG[k.status] ?? { bg: '#F1F5F9', color: '#64748B', label: k.status }
          const sameDay = !k.tanggal_selesai ||
            k.tanggal_selesai.slice(0, 10) === k.tanggal_mulai.slice(0, 10)
          return (
            <a key={k.id} href={`/${slug}/kegiatan/${k.id}`} style={{ textDecoration: 'none' }}>
              <div style={{
                background: 'white', border: '1px solid var(--c-border)',
                borderRadius: 'var(--r-lg)', padding: 'var(--sp-4)',
                boxShadow: 'var(--shadow-xs)',
                display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-start',
              }}>
                {/* Icon kolom kiri */}
                <div style={{
                  width: 44, height: 44, borderRadius: 'var(--r-md)', flexShrink: 0,
                  background: 'var(--c-primary-xlight)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22,
                }}>
                  📅
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Nama + status */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--c-primary)', lineHeight: 1.3 }}>
                      {k.nama}
                    </div>
                    <span style={{
                      flexShrink: 0, fontSize: 10, fontWeight: 700,
                      padding: '2px 8px', borderRadius: 99,
                      background: st.bg, color: st.color,
                    }}>
                      {st.label}
                    </span>
                  </div>

                  {/* Meta baris */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 6 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--c-text-faint)' }}>{k.kode}</span>
                    <span>{k.jenis}</span>
                    {k.lokasi && <span>📍 {k.lokasi}</span>}
                  </div>

                  {/* Footer: tanggal + peserta */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
                      🗓 {fmtDate(k.tanggal_mulai)}
                      {!sameDay && k.tanggal_selesai && (
                        <span style={{ color: 'var(--c-text-faint)' }}> – {fmtDate(k.tanggal_selesai)}</span>
                      )}
                    </span>
                    <span style={{
                      fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 99,
                      background: 'var(--c-secondary)', color: 'white',
                    }}>
                      {k.pesertaCount} peserta
                    </span>
                  </div>
                </div>

                {/* Arrow */}
                <span style={{ color: 'var(--c-text-faint)', fontSize: 18, flexShrink: 0, alignSelf: 'center' }}>›</span>
              </div>
            </a>
          )
        })}
      </div>
    )
  }

  // ── Desktop table ─────────────────────────────────────────────
  return (
    <div style={{ background: 'white', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--c-border)', background: 'var(--c-bg)' }}>
            {['Kode', 'Nama Kegiatan', 'Jenis', 'Tanggal', 'Peserta', 'Status'].map(h => (
              <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--c-text-faint)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {kegiatan.map((k, i) => {
            const st = STATUS_CFG[k.status] ?? { bg: '#F1F5F9', color: '#64748B', label: k.status }
            const sameDay = !k.tanggal_selesai ||
              new Date(k.tanggal_selesai).toDateString() === new Date(k.tanggal_mulai).toDateString()
            return (
              <tr key={k.id} style={{ borderBottom: i < kegiatan.length - 1 ? '1px solid var(--c-border)' : 'none' }}>
                <td style={{ padding: '14px 16px', fontSize: 'var(--font-size-sm)', color: 'var(--c-text-faint)', fontFamily: 'monospace' }}>
                  {k.kode}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <a href={`/${slug}/kegiatan/${k.id}`} style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--c-secondary)', textDecoration: 'none' }}>
                    {k.nama}
                  </a>
                  {k.lokasi && <div style={{ fontSize: 12, color: 'var(--c-text-faint)', marginTop: 2 }}>📍 {k.lokasi}</div>}
                </td>
                <td style={{ padding: '14px 16px', fontSize: 'var(--font-size-sm)', color: 'var(--c-text)' }}>{k.jenis}</td>
                <td style={{ padding: '14px 16px', fontSize: 'var(--font-size-sm)', color: 'var(--c-text)' }}>
                  {fmtDate(k.tanggal_mulai)}
                  {!sameDay && k.tanggal_selesai && (
                    <span style={{ color: 'var(--c-text-faint)' }}> – {fmtDate(k.tanggal_selesai)}</span>
                  )}
                </td>
                <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                  <span style={{ background: 'var(--c-secondary)', color: 'white', borderRadius: 99, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                    {k.pesertaCount}
                  </span>
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <span style={{ display: 'inline-block', background: st.bg, color: st.color, borderRadius: 99, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>
                    {st.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
