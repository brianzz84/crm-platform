'use client'

import { useState, useEffect, useCallback } from 'react'

interface SyncLog {
  id:            string
  status:        string
  tanggal_data:  string
  jumlah_baru:   number
  jumlah_update: number
  error_msg:     string | null
  mode:          string
  started_at:    string
  finished_at:   string | null
}

interface Summary {
  total_14d:        number
  sukses_14d:       number
  gagal_14d:        number
  success_rate:     number | null
  total_baru_14d:   number
  total_update_14d: number
}

interface BackfillState {
  batchId:    string
  dari:       string
  sampai:     string
  total:      number
  done:       number
  failed:     number
  skipped:    number
  status:     'running' | 'done' | 'failed' | 'partial' | 'cancelled'
  startedAt:  string
  finishedAt: string | null
}

interface Props {
  slug:        string
  canConfig:   boolean
  canSync:     boolean
  initialData: {
    simrs_base_url: string
    simrs_jam_sync: number
    has_api_key:    boolean
  } | null
}

const JAM_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${String(i).padStart(2, '0')}:00 WIB`,
}))

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  DONE:    { label: 'Berhasil',  color: '#16A34A', bg: '#F0FDF4' },
  RUNNING: { label: 'Berjalan',  color: '#D97706', bg: '#FFFBEB' },
  FAILED:  { label: 'Gagal',     color: '#DC2626', bg: '#FEF2F2' },
  PARTIAL: { label: 'Sebagian',  color: '#EA580C', bg: '#FFF7ED' },
}

function durasi(log: SyncLog): string {
  if (!log.finished_at) return '—'
  const ms = new Date(log.finished_at).getTime() - new Date(log.started_at).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}d`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}d`
}

export default function SimrsConfigForm({ slug, canConfig, canSync, initialData }: Props) {
  const [baseUrl,    setBaseUrl]    = useState(initialData?.simrs_base_url ?? '')
  const [apiKey,     setApiKey]     = useState('')
  const [jamSync,    setJamSync]    = useState(initialData?.simrs_jam_sync ?? 0)
  const [saving,     setSaving]     = useState(false)
  const [syncing,    setSyncing]    = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [error,      setError]      = useState('')
  const [syncMsg,    setSyncMsg]    = useState('')
  const [syncError,  setSyncError]  = useState('')

  const [lastSync,   setLastSync]   = useState<SyncLog | null>(null)
  const [logs,       setLogs]       = useState<SyncLog[]>([])
  const [summary,    setSummary]    = useState<Summary | null>(null)
  const [loadingLog, setLoadingLog] = useState(true)
  const [showAll,    setShowAll]    = useState(false)

  // Backfill state
  const [bfDari,     setBfDari]     = useState('')
  const [bfSampai,   setBfSampai]   = useState('')
  const [bfLoading,  setBfLoading]  = useState(false)
  const [bfState,    setBfState]    = useState<BackfillState | null>(null)
  const [bfMsg,      setBfMsg]      = useState('')
  const [bfError,    setBfError]    = useState('')
  const [cancelling, setCancelling] = useState(false)

  const fetchLogs = useCallback(async () => {
    try {
      const res  = await fetch(`/api/${slug}/simrs/logs`)
      const json = await res.json()
      if (json.success) {
        setLogs(json.data ?? [])
        setSummary(json.summary ?? null)
        setLastSync(json.data?.[0] ?? null)
      }
    } catch {}
    setLoadingLog(false)
  }, [slug])

  const fetchBackfillState = useCallback(async () => {
    try {
      const res  = await fetch(`/api/${slug}/simrs/backfill`)
      const json = await res.json()
      if (json.success) setBfState(json.data)
    } catch {}
  }, [slug])

  useEffect(() => { fetchLogs(); fetchBackfillState() }, [fetchLogs, fetchBackfillState])

  // Poll saat sync RUNNING
  useEffect(() => {
    if (lastSync?.status !== 'RUNNING') return
    const t = setInterval(fetchLogs, 3000)
    return () => clearInterval(t)
  }, [lastSync?.status, fetchLogs])

  // Poll saat backfill berjalan
  useEffect(() => {
    if (bfState?.status !== 'running') return
    const t = setInterval(() => { fetchBackfillState(); fetchLogs() }, 4000)
    return () => clearInterval(t)
  }, [bfState?.status, fetchBackfillState, fetchLogs])

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const body: any = { simrs_base_url: baseUrl, simrs_jam_sync: jamSync }
      if (apiKey) body.simrs_api_key = apiKey
      const res  = await fetch(`/api/${slug}/pengaturan/simrs`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Gagal menyimpan'); return }
      setSaved(true); setApiKey('')
      setTimeout(() => setSaved(false), 3000)
    } finally { setSaving(false) }
  }

  async function handleBackfill() {
    if (!bfDari || !bfSampai) { setBfError('Pilih rentang tanggal terlebih dahulu'); return }
    setBfLoading(true); setBfMsg(''); setBfError('')
    try {
      const res  = await fetch(`/api/${slug}/simrs/backfill`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dari: bfDari, sampai: bfSampai }),
      })
      const json = await res.json()
      if (!res.ok) { setBfError(json.error || 'Gagal memulai backfill'); return }
      setBfMsg(json.message || 'Backfill dimulai')
      await fetchBackfillState()
    } finally { setBfLoading(false) }
  }

  async function handleCancelBackfill() {
    setCancelling(true)
    try {
      const res  = await fetch(`/api/${slug}/simrs/backfill`, { method: 'DELETE' })
      const json = await res.json()
      if (res.ok) { setBfMsg(''); await fetchBackfillState() }
      else setBfError(json.error || 'Gagal membatalkan')
    } finally { setCancelling(false) }
  }

  // Estimasi hari yang akan di-sync (exclude yang sudah DONE)
  const doneSet = new Set(logs.filter(l => l.status === 'DONE').map(l => l.tanggal_data.slice(0, 10)))
  function estimasiBfDays(): { total: number; skip: number; proses: number } | null {
    if (!bfDari || !bfSampai || bfDari > bfSampai) return null
    const dates: string[] = []
    const c = new Date(bfDari)
    const e = new Date(bfSampai)
    while (c <= e) { dates.push(c.toISOString().slice(0, 10)); c.setDate(c.getDate() + 1) }
    const skip   = dates.filter(d => doneSet.has(d)).length
    const proses = dates.length - skip
    return { total: dates.length, skip, proses }
  }
  const bfEstimasi = estimasiBfDays()

  async function handleSync() {
    setSyncing(true); setSyncMsg(''); setSyncError('')
    try {
      const res  = await fetch(`/api/${slug}/simrs/sync`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { setSyncError(json.error || 'Gagal memulai sync'); return }
      setSyncMsg(json.message || 'Sync dimulai')
      setTimeout(fetchLogs, 2000)
    } finally { setSyncing(false) }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontFamily: 'inherit',
    fontSize: 'var(--font-size-sm)', border: '1.5px solid var(--c-border)',
    borderRadius: 'var(--r-sm)', outline: 'none', boxSizing: 'border-box',
    background: 'var(--c-bg)',
  }
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 700,
    color: 'var(--c-text)', marginBottom: 4,
  }
  const section: React.CSSProperties = {
    background: 'var(--c-surface)', border: '1px solid var(--c-border)',
    borderRadius: 'var(--r-lg)', padding: 'var(--sp-5)', marginBottom: 'var(--sp-5)',
  }
  const thStyle: React.CSSProperties = {
    padding: '9px var(--sp-4)', fontSize: 'var(--font-size-xs)', fontWeight: 700,
    color: 'var(--c-text-muted)', textAlign: 'left',
    borderBottom: '2px solid var(--c-border)', whiteSpace: 'nowrap',
  }
  const tdStyle: React.CSSProperties = {
    padding: '10px var(--sp-4)', fontSize: 'var(--font-size-sm)',
    color: 'var(--c-text)', borderBottom: '1px solid var(--c-border)',
    verticalAlign: 'middle',
  }

  const displayedLogs = showAll ? logs : logs.slice(0, 14)

  return (
    <div>

      {/* ── Summary 14 hari ── */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)' }}>
          {[
            { label: 'Sync 14 Hari',    value: summary.total_14d,        unit: 'eksekusi',  color: 'var(--c-primary)' },
            { label: 'Berhasil',         value: summary.sukses_14d,       unit: 'kali',      color: '#16A34A' },
            { label: 'Gagal',            value: summary.gagal_14d,        unit: 'kali',      color: summary.gagal_14d > 0 ? '#DC2626' : 'var(--c-text-muted)' },
            { label: 'Success Rate',     value: summary.success_rate != null ? `${summary.success_rate}%` : '—', unit: '', color: (summary.success_rate ?? 0) >= 90 ? '#16A34A' : '#D97706' },
            { label: 'Total Data Baru',  value: summary.total_baru_14d.toLocaleString('id-ID'),   unit: 'record', color: 'var(--c-primary)' },
            { label: 'Total Diperbarui', value: summary.total_update_14d.toLocaleString('id-ID'), unit: 'record', color: 'var(--c-primary)' },
          ].map((s, i) => (
            <div key={i} style={{
              background: 'var(--c-surface)', border: '1px solid var(--c-border)',
              borderTop: `3px solid ${s.color}`, borderRadius: 'var(--r-lg)',
              padding: 'var(--sp-4)',
            }}>
              <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              {s.unit && <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 2 }}>{s.unit}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── Status sync terakhir + Tombol sync ── */}
      <div style={section}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-4)', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--font-size-md)', color: 'var(--c-primary)' }}>
            Status Sync Terakhir
          </div>
          {canSync && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
              {syncMsg   && <span style={{ fontSize: 'var(--font-size-xs)', color: '#16A34A', fontWeight: 600 }}>✓ {syncMsg}</span>}
              {syncError && <span style={{ fontSize: 'var(--font-size-xs)', color: '#DC2626' }}>✗ {syncError}</span>}
              <button
                onClick={handleSync}
                disabled={syncing || lastSync?.status === 'RUNNING'}
                style={{
                  padding: '8px 16px', borderRadius: 'var(--r-md)',
                  background: (syncing || lastSync?.status === 'RUNNING') ? '#94A3B8' : 'var(--c-primary)',
                  border: 'none', color: 'white', fontFamily: 'inherit',
                  fontSize: 'var(--font-size-xs)', fontWeight: 700,
                  cursor: (syncing || lastSync?.status === 'RUNNING') ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <span style={{ fontSize: 13 }}>{syncing ? '⏳' : '🔄'}</span>
                {syncing ? 'Memulai...' : lastSync?.status === 'RUNNING' ? 'Sedang berjalan...' : 'Sync Sekarang'}
              </button>
            </div>
          )}
        </div>

        {loadingLog ? (
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', margin: 0 }}>Memuat...</p>
        ) : !lastSync ? (
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', margin: 0 }}>
            Belum pernah disinkronisasi. Klik <strong>Sync Sekarang</strong> untuk memulai.
          </p>
        ) : (() => {
          const s = STATUS_MAP[lastSync.status] ?? STATUS_MAP['FAILED']
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 'var(--sp-3)' }}>
              {[
                { label: 'Status', value: (
                  <span style={{
                    display: 'inline-block', padding: '3px 10px', borderRadius: 99,
                    fontSize: 12, fontWeight: 700, background: s.bg, color: s.color,
                  }}>{s.label}</span>
                )},
                { label: 'Tanggal Data', value: new Date(lastSync.tanggal_data).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) },
                { label: 'Data Baru', value: <span style={{ fontWeight: 700, color: '#16A34A' }}>+{lastSync.jumlah_baru.toLocaleString('id-ID')}</span> },
                { label: 'Data Diperbarui', value: lastSync.jumlah_update.toLocaleString('id-ID') },
                { label: 'Durasi', value: durasi(lastSync) },
                { label: 'Dijalankan', value: new Date(lastSync.started_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) },
                ...(lastSync.error_msg ? [{ label: 'Pesan Error', value: <span style={{ color: '#DC2626', fontSize: 11 }}>{lastSync.error_msg}</span> }] : []),
              ].map((item, i) => (
                <div key={i} style={{ background: 'var(--c-bg)', borderRadius: 'var(--r-sm)', padding: 'var(--sp-3)', border: '1px solid var(--c-border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--c-text)' }}>{item.value}</div>
                </div>
              ))}
            </div>
          )
        })()}

        {canSync && (
          <p style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 'var(--sp-3)', marginBottom: 0 }}>
            Sync manual mengambil data kunjungan dari SIMRS dan backfill tanggal yang terlewat (maks 7 hari terakhir).
          </p>
        )}
      </div>

      {/* ── Riwayat Sinkronisasi ── */}
      <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', marginBottom: 'var(--sp-5)', overflow: 'hidden' }}>
        <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)', background: 'var(--c-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--c-primary)' }}>
            Riwayat Sinkronisasi
          </span>
          <span style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>
            {logs.length} eksekusi tersimpan
          </span>
        </div>

        {logs.length === 0 ? (
          <div style={{ padding: 'var(--sp-5)', textAlign: 'center', color: 'var(--c-text-faint)', fontSize: 'var(--font-size-sm)' }}>
            Belum ada riwayat sinkronisasi
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--c-bg)' }}>
                    <th style={thStyle}>Tanggal Data</th>
                    <th style={thStyle}>Status</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Data Baru</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Diperbarui</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Durasi</th>
                    <th style={thStyle}>Dijalankan</th>
                    <th style={thStyle}>Sumber</th>
                    <th style={thStyle}>Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedLogs.map((log, i) => {
                    const s = STATUS_MAP[log.status] ?? STATUS_MAP['FAILED']
                    return (
                      <tr key={log.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--c-bg)' }}>
                        <td style={tdStyle}>
                          <span style={{ fontWeight: 600 }}>
                            {new Date(log.tanggal_data).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            display: 'inline-block', padding: '2px 9px', borderRadius: 99,
                            fontSize: 11, fontWeight: 700, background: s.bg, color: s.color,
                          }}>
                            {s.label}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: log.jumlah_baru > 0 ? '#16A34A' : 'var(--c-text-muted)' }}>
                          {log.jumlah_baru > 0 ? `+${log.jumlah_baru.toLocaleString('id-ID')}` : '—'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--c-text-muted)' }}>
                          {log.jumlah_update > 0 ? log.jumlah_update.toLocaleString('id-ID') : '—'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--c-text-muted)', fontSize: 12 }}>
                          {durasi(log)}
                        </td>
                        <td style={{ ...tdStyle, fontSize: 12, color: 'var(--c-text-muted)' }}>
                          {new Date(log.started_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ ...tdStyle, fontSize: 12 }}>
                          {log.mode === 'manual'
                            ? <span style={{ color: '#0089A8', fontWeight: 600 }}>Manual</span>
                            : <span style={{ color: '#7C3AED' }}>Cron</span>
                          }
                        </td>
                        <td style={{ ...tdStyle, fontSize: 11, color: '#DC2626', maxWidth: 200 }}>
                          {log.error_msg
                            ? <span title={log.error_msg}>{log.error_msg.slice(0, 60)}{log.error_msg.length > 60 ? '…' : ''}</span>
                            : <span style={{ color: 'var(--c-text-faint)' }}>—</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {logs.length > 14 && (
              <div style={{ padding: 'var(--sp-3) var(--sp-5)', borderTop: '1px solid var(--c-border)', textAlign: 'center' }}>
                <button
                  onClick={() => setShowAll(v => !v)}
                  style={{
                    background: 'none', border: 'none', color: 'var(--c-secondary)',
                    fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {showAll ? '↑ Tampilkan lebih sedikit' : `↓ Lihat semua ${logs.length} riwayat`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Import Data Historis (Backfill) — hanya ADMIN_IT / SUPER_ADMIN ── */}
      {canConfig && (
        <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', marginBottom: 'var(--sp-5)', overflow: 'hidden' }}>
          <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)', background: 'var(--c-bg)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>📥</span>
            <div>
              <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--c-primary)' }}>Import Data Historis</span>
              <span style={{ fontSize: 11, color: 'var(--c-text-faint)', marginLeft: 10 }}>Tarik data kunjungan dari periode tertentu di masa lalu</span>
            </div>
          </div>

          <div style={{ padding: 'var(--sp-5)' }}>

            {/* Progress backfill yang sedang/sudah berjalan */}
            {bfState && (() => {
              const pct      = bfState.total > 0 ? Math.round(((bfState.done + bfState.failed) / bfState.total) * 100) : 0
              const isRunning = bfState.status === 'running'
              const statusMap: Record<string, { label: string; color: string }> = {
                running:   { label: 'Sedang berjalan',  color: '#D97706' },
                done:      { label: 'Selesai',           color: '#16A34A' },
                partial:   { label: 'Selesai (sebagian gagal)', color: '#EA580C' },
                failed:    { label: 'Gagal semua',       color: '#DC2626' },
                cancelled: { label: 'Dibatalkan',        color: '#94A3B8' },
              }
              const s = statusMap[bfState.status] ?? statusMap['done']
              return (
                <div style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', marginBottom: 'var(--sp-5)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--c-text)' }}>
                        Backfill {new Date(bfState.dari).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} — {new Date(bfState.sampai).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: s.color + '20', color: s.color }}>
                        {s.label}
                      </span>
                    </div>
                    {isRunning && (
                      <button
                        onClick={handleCancelBackfill}
                        disabled={cancelling}
                        style={{ padding: '5px 12px', borderRadius: 'var(--r-sm)', border: '1px solid #EF4444', background: 'none', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: cancelling ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                      >
                        {cancelling ? 'Membatalkan...' : 'Batalkan'}
                      </button>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div style={{ background: 'var(--c-border)', borderRadius: 99, height: 8, marginBottom: 10, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 99, transition: 'width 0.5s ease',
                      width: `${pct}%`,
                      background: bfState.failed > 0 ? 'linear-gradient(90deg, #16A34A, #EA580C)' : '#16A34A',
                    }} />
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--sp-4)', fontSize: 12, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--c-text-muted)' }}>Total: <strong>{bfState.total}</strong> tanggal</span>
                    <span style={{ color: '#16A34A' }}>Selesai: <strong>{bfState.done}</strong></span>
                    {bfState.failed > 0 && <span style={{ color: '#DC2626' }}>Gagal: <strong>{bfState.failed}</strong></span>}
                    {bfState.skipped > 0 && <span style={{ color: 'var(--c-text-faint)' }}>Dilewati (sudah ada): <strong>{bfState.skipped}</strong></span>}
                    <span style={{ color: 'var(--c-text-faint)', marginLeft: 'auto' }}>{pct}%</span>
                  </div>

                  {!isRunning && bfState.finishedAt && (
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--c-text-faint)' }}>
                      Selesai: {new Date(bfState.finishedAt).toLocaleString('id-ID')}
                      {' · '}Dimulai: {new Date(bfState.startedAt).toLocaleString('id-ID')}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Form input range */}
            {(!bfState || bfState.status !== 'running') && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
                  <div>
                    <label style={lbl}>Dari Tanggal</label>
                    <input type="date" value={bfDari} onChange={e => setBfDari(e.target.value)}
                      max={bfSampai || new Date(Date.now() - 86400000).toISOString().slice(0, 10)}
                      style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Sampai Tanggal</label>
                    <input type="date" value={bfSampai} onChange={e => setBfSampai(e.target.value)}
                      min={bfDari}
                      max={new Date(Date.now() - 86400000).toISOString().slice(0, 10)}
                      style={inp} />
                  </div>
                </div>

                {/* Estimasi */}
                {bfEstimasi && (
                  <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 'var(--r-sm)', padding: 'var(--sp-3) var(--sp-4)', marginBottom: 'var(--sp-4)', fontSize: 12 }}>
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', color: '#0369A1' }}>
                      <span>Total hari: <strong>{bfEstimasi.total}</strong></span>
                      <span>Akan diproses: <strong>{bfEstimasi.proses}</strong></span>
                      {bfEstimasi.skip > 0 && <span style={{ color: '#64748B' }}>Sudah ada (dilewati): <strong>{bfEstimasi.skip}</strong></span>}
                      {bfEstimasi.proses > 0 && (
                        <span style={{ marginLeft: 'auto', color: '#64748B' }}>
                          Estimasi: ~{Math.ceil(bfEstimasi.proses * 1.5 / 60)} menit
                        </span>
                      )}
                    </div>
                    {bfEstimasi.total > 366 && (
                      <div style={{ color: '#DC2626', marginTop: 6, fontWeight: 600 }}>Maksimal 366 hari per backfill</div>
                    )}
                  </div>
                )}

                {bfMsg   && <div style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', borderRadius: 'var(--r-sm)', padding: 'var(--sp-3) var(--sp-4)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--sp-3)' }}>✓ {bfMsg}</div>}
                {bfError && <div style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', borderLeft: '3px solid #EF4444', borderRadius: 'var(--r-sm)', padding: 'var(--sp-3) var(--sp-4)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--sp-3)' }}>{bfError}</div>}

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                  {/* Shortcut buttons */}
                  {[
                    { label: '7 hari terakhir',  days: 7 },
                    { label: '30 hari terakhir', days: 30 },
                    { label: '3 bulan terakhir', days: 90 },
                    { label: '1 tahun terakhir', days: 365 },
                  ].map(s => {
                    const sampai = new Date(Date.now() - 86400000)
                    const dari   = new Date(sampai)
                    dari.setDate(sampai.getDate() - (s.days - 1))
                    return (
                      <button
                        key={s.days}
                        onClick={() => {
                          setBfDari(dari.toISOString().slice(0, 10))
                          setBfSampai(sampai.toISOString().slice(0, 10))
                          setBfMsg(''); setBfError('')
                        }}
                        style={{
                          padding: '5px 12px', borderRadius: 'var(--r-sm)',
                          border: '1px solid var(--c-border)', background: 'var(--c-bg)',
                          fontSize: 12, fontWeight: 600, color: 'var(--c-text-muted)',
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        {s.label}
                      </button>
                    )
                  })}

                  <button
                    onClick={handleBackfill}
                    disabled={bfLoading || !bfDari || !bfSampai || (bfEstimasi?.proses === 0) || (bfEstimasi?.total ?? 0) > 366}
                    style={{
                      marginLeft: 'auto', padding: '9px 20px', borderRadius: 'var(--r-md)',
                      background: (bfLoading || !bfDari || !bfSampai || bfEstimasi?.proses === 0) ? '#94A3B8' : '#7C3AED',
                      border: 'none', color: 'white', fontFamily: 'inherit',
                      fontSize: 'var(--font-size-sm)', fontWeight: 700,
                      cursor: (bfLoading || !bfDari || !bfSampai || bfEstimasi?.proses === 0) ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <span>{bfLoading ? '⏳' : '📥'}</span>
                    {bfLoading ? 'Memulai...' : bfEstimasi?.proses === 0 ? 'Semua sudah ada' : `Mulai Import ${bfEstimasi ? `(${bfEstimasi.proses} hari)` : ''}`}
                  </button>
                </div>

                <p style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 'var(--sp-3)', marginBottom: 0 }}>
                  Proses berjalan di background — aman ditinggal. Tanggal yang sudah pernah berhasil di-sync akan dilewati otomatis.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Konfigurasi SIMRS — hanya ADMIN_IT / SUPER_ADMIN ── */}
      {canConfig && (
        <>
          <div style={section}>
            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-md)', color: 'var(--c-primary)', marginBottom: 'var(--sp-4)' }}>
              Koneksi API SIMRS
            </div>
            <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
              <div>
                <label style={lbl}>Base URL API SIMRS</label>
                <input
                  value={baseUrl}
                  onChange={e => setBaseUrl(e.target.value)}
                  placeholder="https://simrs.rumahsakit.com/api"
                  style={inp}
                />
                <p style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 4, marginBottom: 0 }}>
                  URL diberikan oleh tim IT RKZ setelah API SIMRS selesai dibuat.
                </p>
              </div>
              <div>
                <label style={lbl}>
                  API Key {initialData?.has_api_key ? '(kosongkan jika tidak diubah)' : ''}
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={initialData?.has_api_key ? '••••••••••••' : 'Bearer token dari SIMRS'}
                  style={inp}
                />
              </div>
            </div>
          </div>

          <div style={section}>
            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-md)', color: 'var(--c-primary)', marginBottom: 4 }}>
              Jadwal Sinkronisasi Otomatis
            </div>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', marginTop: 0, marginBottom: 'var(--sp-4)' }}>
              Sistem akan otomatis mengambil data kunjungan kemarin setiap hari pada jam yang dipilih.
            </p>
            <div style={{ maxWidth: 260 }}>
              <label style={lbl}>Jam Sync Harian (WIB)</label>
              <select
                value={jamSync}
                onChange={e => setJamSync(Number(e.target.value))}
                style={{ ...inp, cursor: 'pointer' }}
              >
                {JAM_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 6, marginBottom: 0 }}>
                Disarankan 00:00–02:00 WIB saat traffic rendah.
              </p>
            </div>
          </div>

          {error && (
            <div style={{ background: '#FEF2F2', color: '#B91C1C', borderRadius: 'var(--r-sm)', padding: 'var(--sp-3) var(--sp-4)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--sp-4)', borderLeft: '3px solid #EF4444' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', justifyContent: 'flex-end' }}>
            {saved && <span style={{ fontSize: 'var(--font-size-sm)', color: '#22C55E', fontWeight: 600 }}>✓ Konfigurasi tersimpan</span>}
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '10px 24px', borderRadius: 'var(--r-md)',
                background: saving ? '#94A3B8' : 'var(--c-secondary)',
                border: 'none', color: 'white', fontFamily: 'inherit',
                fontSize: 'var(--font-size-sm)', fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
