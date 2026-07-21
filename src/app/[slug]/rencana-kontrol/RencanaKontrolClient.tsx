'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

interface Row {
  id: string
  tanggal: string          // ISO
  nama: string
  noHp: string | null
  sumber: string
  unit: string | null
  poli: string | null
  status: string           // 'terjadwal' | 'batal' | 'terpenuhi'
  reminderH3At: string | null
  reminderH1At: string | null
}

const MS_HARI = 86_400_000

// Tanggal (tanpa jam) hari ini, untuk membandingkan apakah jendela kirim sudah lewat.
function hariIni(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}
function tglSaja(iso: string): Date {
  const d = new Date(iso)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function fmtTgl(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtTglPendek(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

type StatusReminder =
  | { kind: 'terkirim'; at: string }
  | { kind: 'belum'; tanpaHp: boolean }
  | { kind: 'menunggu' }
  | { kind: 'tidak_relevan' }

function statusReminder(row: Row, horizon: 'h3' | 'h1'): StatusReminder {
  const at = horizon === 'h3' ? row.reminderH3At : row.reminderH1At
  if (at) return { kind: 'terkirim', at }
  if (row.status !== 'terjadwal') return { kind: 'tidak_relevan' }
  const offset = horizon === 'h3' ? 3 : 1
  const kirim  = new Date(tglSaja(row.tanggal).getTime() - offset * MS_HARI)
  if (hariIni().getTime() >= kirim.getTime()) return { kind: 'belum', tanpaHp: !row.noHp }
  return { kind: 'menunggu' }
}

function BadgeReminder({ s }: { s: StatusReminder }) {
  const base: React.CSSProperties = { padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }
  if (s.kind === 'terkirim') return <span style={{ ...base, color: '#278B58', background: '#E4F5EC' }} title={`Terkirim ${fmtTgl(s.at)}`}>Terkirim ✓</span>
  if (s.kind === 'belum')    return <span style={{ ...base, color: '#8A5A0A', background: '#FCF1DC' }}>{s.tanpaHp ? 'Belum · tanpa HP' : 'Belum'}</span>
  if (s.kind === 'menunggu') return <span style={{ ...base, color: '#57606A', background: '#EEF0F2' }}>Menunggu</span>
  return <span style={{ color: 'var(--c-text-faint)' }}>—</span>
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  terjadwal: { label: 'Terjadwal', color: '#0E6E66', bg: '#E4F2F0' },
  terpenuhi: { label: 'Terpenuhi', color: '#278B58', bg: '#E4F5EC' },
  batal:     { label: 'Batal',     color: '#A3271F', bg: '#FBEAE9' },
}

const RANGE_OPTS = [
  { value: 7,   label: '7 hari ke depan' },
  { value: 30,  label: '30 hari ke depan' },
  { value: 90,  label: '90 hari ke depan' },
  { value: 999, label: 'Semua' },
]

export default function RencanaKontrolClient({
  slug, rows, reminderAktif, jamKirim,
}: {
  slug: string
  rows: Row[]
  reminderAktif: boolean
  jamKirim: number | null
}) {
  const [statusFilter, setStatusFilter] = useState<'semua' | 'terjadwal' | 'batal' | 'terpenuhi'>('terjadwal')
  const [cari, setCari]   = useState('')
  const [range, setRange] = useState(30)

  const terfilter = useMemo(() => {
    const batas = new Date(hariIni().getTime() + (range + 1) * MS_HARI)
    const q = cari.trim().toLowerCase()
    return rows.filter(r => {
      if (statusFilter !== 'semua' && r.status !== statusFilter) return false
      if (range !== 999 && tglSaja(r.tanggal).getTime() >= batas.getTime()) return false
      if (q && !r.nama.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, statusFilter, cari, range])

  // Ringkasan dihitung dari SEMUA baris (bukan yang terfilter) supaya angka stabil.
  const ringkasan = useMemo(() => {
    let terjadwal = 0, batal = 0, h3Belum = 0, h1Belum = 0
    for (const r of rows) {
      if (r.status === 'terjadwal') terjadwal++
      if (r.status === 'batal')     batal++
      if (statusReminder(r, 'h3').kind === 'belum') h3Belum++
      if (statusReminder(r, 'h1').kind === 'belum') h1Belum++
    }
    return { terjadwal, batal, h3Belum, h1Belum }
  }, [rows])

  const inp: React.CSSProperties = {
    padding: '7px 10px', fontFamily: 'inherit', fontSize: 13,
    border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-sm)',
    outline: 'none', background: 'white', color: 'var(--c-text)', boxSizing: 'border-box',
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--sp-5)', flexWrap: 'wrap', gap: 'var(--sp-4)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
            🗓️ Rencana Kontrol
          </h1>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
            Jadwal kontrol pasien dari SIMRS dan status pengingat WhatsApp-nya (H-3 &amp; H-1).
          </p>
        </div>
        <Link href={`/${slug}/sapaan`} style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-secondary)', textDecoration: 'none', border: '1px solid var(--c-border)', borderRadius: 6, padding: '7px 12px', background: 'white' }}>
          Atur template pengingat →
        </Link>
      </div>

      {/* Status reminder */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 'var(--sp-5)',
        borderRadius: 'var(--r-lg)', fontSize: 13,
        background: reminderAktif ? '#E4F5EC' : '#EEF0F2',
        border: `1px solid ${reminderAktif ? '#B7E3C9' : 'var(--c-border)'}`,
        color: reminderAktif ? '#1E6B45' : 'var(--c-text-muted)',
      }}>
        <span style={{ fontSize: 16 }}>{reminderAktif ? '✅' : '⏸️'}</span>
        <span>
          {reminderAktif
            ? <>Pengingat otomatis <b>aktif</b> — dikirim tiap hari pukul {String(jamKirim ?? 0).padStart(2, '0')}:00 WIB untuk kontrol yang jatuh H-3 &amp; H-1.</>
            : <>Pengingat otomatis <b>nonaktif</b>. Jadwal tetap tercatat di sini, tapi pesan tidak dikirim sampai diaktifkan di menu <b>Sapaan → Pengingat Kontrol</b>.</>}
        </span>
      </div>

      {/* Ringkasan */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--sp-4)', marginBottom: 'var(--sp-5)' }}>
        {[
          { label: 'Terjadwal', nilai: ringkasan.terjadwal, warna: '#0E6E66' },
          { label: 'H-3 belum terkirim', nilai: ringkasan.h3Belum, warna: ringkasan.h3Belum > 0 ? '#8A5A0A' : 'var(--c-text-muted)' },
          { label: 'H-1 belum terkirim', nilai: ringkasan.h1Belum, warna: ringkasan.h1Belum > 0 ? '#8A5A0A' : 'var(--c-text-muted)' },
          { label: 'Batal', nilai: ringkasan.batal, warna: 'var(--c-text-muted)' },
        ].map(k => (
          <div key={k.label} style={{ background: 'white', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', padding: 'var(--sp-4)' }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: k.warna, lineHeight: 1 }}>{k.nilai}</div>
            <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)', flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={cari} onChange={e => setCari(e.target.value)} placeholder="Cari nama pasien…" style={{ ...inp, minWidth: 200, flex: '1 1 200px' }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} style={inp}>
          <option value="terjadwal">Status: Terjadwal</option>
          <option value="batal">Status: Batal</option>
          <option value="terpenuhi">Status: Terpenuhi</option>
          <option value="semua">Status: Semua</option>
        </select>
        <select value={range} onChange={e => setRange(parseInt(e.target.value))} style={inp}>
          {RANGE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>{terfilter.length} baris</span>
      </div>

      {/* Tabel */}
      <div style={{ background: 'white', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
        {terfilter.length === 0 ? (
          <div style={{ padding: 'var(--sp-6)', textAlign: 'center', color: 'var(--c-text-muted)', fontSize: 14 }}>
            {rows.length === 0
              ? 'Belum ada rencana kontrol. Data mengalir otomatis dari sinkronisasi SIMRS harian.'
              : 'Tidak ada yang cocok dengan filter.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--c-bg)' }}>
                  {['Tanggal', 'Pasien', 'No. HP', 'Poli / Unit', 'Sumber', 'Status', 'H-3', 'H-1'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', borderBottom: '2px solid var(--c-border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {terfilter.map(r => {
                  const st = STATUS_CFG[r.status] ?? { label: r.status, color: 'var(--c-text-muted)', bg: 'var(--c-bg)' }
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--c-border)' }}>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', fontWeight: 600 }}>{fmtTgl(r.tanggal)}</td>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{r.nama}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12, color: r.noHp ? 'var(--c-text)' : 'var(--c-text-faint)' }}>{r.noHp || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--c-text-muted)' }}>{r.poli || r.unit || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--c-text-muted)' }}>{r.sumber}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, color: st.color, background: st.bg }}>{st.label}</span>
                      </td>
                      <td style={{ padding: '8px 12px' }}><BadgeReminder s={statusReminder(r, 'h3')} /></td>
                      <td style={{ padding: '8px 12px' }}><BadgeReminder s={statusReminder(r, 'h1')} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
