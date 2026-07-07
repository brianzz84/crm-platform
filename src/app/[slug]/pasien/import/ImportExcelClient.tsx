'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'

interface ImportLog {
  id:              string
  filename:        string | null
  status:          string
  total_rows:      number
  new_persons:     number
  updated_persons: number
  new_visits:      number
  skipped_rows:    number
  started_at:      string
  finished_at:     string | null
}

interface ImportResult {
  logId:          string
  totalRows:      number
  processedRows:  number
  newPersons:     number
  updatedPersons: number
  newVisits:      number
  skippedRows:    number
  errors:         { row: number; noHp: string | null; alasan: string }[]
}

interface Props {
  slug:        string
  initialLogs: ImportLog[]
}

type Stage = 'idle' | 'selected' | 'uploading' | 'done' | 'error'

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  DONE:       { bg: 'var(--c-success-light)', color: 'var(--c-success)', label: '✓ Selesai' },
  PROCESSING: { bg: 'var(--c-accent-light)',  color: '#9A6C00',          label: '⏳ Diproses' },
  FAILED:     { bg: 'var(--c-error-light)',   color: 'var(--c-error)',   label: '✗ Gagal' },
  PENDING:    { bg: '#F1F5F9',               color: '#64748B',           label: '○ Menunggu' },
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })
}

export default function ImportExcelClient({ slug, initialLogs }: Props) {
  const [logs,      setLogs]      = useState<ImportLog[]>(initialLogs)
  const [file,      setFile]      = useState<File | null>(null)
  const [stage,     setStage]     = useState<Stage>('idle')
  const [result,    setResult]    = useState<ImportResult | null>(null)
  const [errorMsg,  setErrorMsg]  = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls'].includes(ext || '')) {
      setErrorMsg('Format file harus .xlsx atau .xls')
      return
    }
    setFile(f)
    setStage('selected')
    setErrorMsg('')
    setResult(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  async function handleUpload() {
    if (!file) return
    setStage('uploading')
    setErrorMsg('')

    const form = new FormData()
    form.append('file', file)

    try {
      const res  = await fetch(`/api/${slug}/import`, { method: 'POST', body: form })
      const json = await res.json()

      if (!res.ok) {
        setErrorMsg(json.error || 'Gagal mengimpor file')
        setStage('error')
        return
      }

      setResult(json.data)
      setStage('done')

      // Refresh log list
      const logsRes  = await fetch(`/api/${slug}/import`)
      const logsJson = await logsRes.json()
      if (logsJson.success) setLogs(logsJson.data)

    } catch {
      setErrorMsg('Terjadi kesalahan jaringan. Coba lagi.')
      setStage('error')
    }
  }

  function reset() {
    setFile(null)
    setStage('idle')
    setResult(null)
    setErrorMsg('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1 }}>

      {/* Page header */}
      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', marginBottom: 'var(--sp-2)' }}>
          <Link href={`/${slug}/pasien`} style={{ color: 'var(--c-secondary)' }}>Data Pasien</Link>
          {' / Import Excel'}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--sp-4)' }}>
          <div>
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
              Import Excel Pasien
            </h1>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
              Upload file Excel untuk menambah atau memperbarui data pasien. No. HP digunakan sebagai kunci pencocokkan.
            </p>
          </div>
          <a
            href={`/api/${slug}/import/template`}
            download="template-import-pasien.xlsx"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)',
              padding: '9px var(--sp-4)',
              background: 'var(--c-primary-xlight)',
              color: 'var(--c-primary)',
              borderRadius: 'var(--r-md)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 600,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            ⬇ Unduh Template
          </a>
        </div>
      </div>

      {/* Info kolom */}
      <div style={{
        background: 'var(--c-secondary-light)', border: '1px solid #b3e0ea',
        borderRadius: 'var(--r-md)', padding: 'var(--sp-4)',
        marginBottom: 'var(--sp-6)', fontSize: 'var(--font-size-sm)',
      }}>
        <div style={{ fontWeight: 700, color: 'var(--c-secondary-dark)', marginBottom: 'var(--sp-2)' }}>
          📋 Format kolom Excel
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', color: 'var(--c-text)' }}>
          {[
            { col: 'nama', req: true },
            { col: 'no_hp', req: true },
            { col: 'no_rm', req: false },
            { col: 'email', req: false },
            { col: 'tanggal_lahir', req: false },
            { col: 'unit', req: false },
            { col: 'poli', req: false },
            { col: 'dokter', req: false },
            { col: 'tanggal_kunjungan', req: false },
            { col: 'diagnosa_icd', req: false },
            { col: 'diagnosa_nama', req: false },
            { col: 'tindakan', req: false },
          ].map(({ col, req }) => (
            <span key={col} style={{
              background: req ? 'var(--c-secondary)' : 'white',
              color:      req ? 'white' : 'var(--c-text-muted)',
              border:     req ? 'none' : '1px solid var(--c-border)',
              padding: '2px 8px', borderRadius: 'var(--r-full)',
              fontSize: 'var(--font-size-xs)', fontWeight: 600,
              fontFamily: 'monospace',
            }}>
              {col}{req ? ' *' : ''}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 'var(--sp-2)', fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)' }}>
          * Wajib diisi. Format no_hp: 08xxx atau +628xxx. Format tanggal: DD/MM/YYYY atau YYYY-MM-DD.
        </div>
      </div>

      {/* Upload area */}
      {stage !== 'done' && (
        <div style={{
          background: 'var(--c-surface)', border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-lg)', marginBottom: 'var(--sp-6)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)', fontWeight: 700, color: 'var(--c-primary)', fontSize: 'var(--font-size-md)' }}>
            Upload File
          </div>
          <div style={{ padding: 'var(--sp-5)' }}>

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
              onDragLeave={() => setIsDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragOver ? 'var(--c-secondary)' : file ? 'var(--c-success)' : 'var(--c-border)'}`,
                borderRadius: 'var(--r-md)',
                padding: 'var(--sp-10)',
                textAlign: 'center',
                cursor: 'pointer',
                background: isDragOver ? 'var(--c-secondary-light)' : file ? 'var(--c-success-light)' : 'var(--c-bg)',
                transition: 'var(--transition)',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
              {file ? (
                <>
                  <div style={{ fontSize: 32, marginBottom: 'var(--sp-2)' }}>📄</div>
                  <div style={{ fontWeight: 700, color: 'var(--c-success)', fontSize: 'var(--font-size-md)' }}>
                    {file.name}
                  </div>
                  <div style={{ color: 'var(--c-text-muted)', fontSize: 'var(--font-size-sm)', marginTop: 4 }}>
                    {(file.size / 1024).toFixed(1)} KB · Klik untuk ganti file
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 40, marginBottom: 'var(--sp-3)' }}>📂</div>
                  <div style={{ fontWeight: 700, color: 'var(--c-primary)', fontSize: 'var(--font-size-md)', marginBottom: 4 }}>
                    Seret file ke sini atau klik untuk pilih
                  </div>
                  <div style={{ color: 'var(--c-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                    Format yang didukung: .xlsx, .xls
                  </div>
                </>
              )}
            </div>

            {/* Error */}
            {errorMsg && (
              <div style={{
                marginTop: 'var(--sp-4)',
                background: 'var(--c-error-light)', color: 'var(--c-error)',
                borderLeft: '4px solid var(--c-error)',
                borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)',
                fontSize: 'var(--font-size-sm)',
              }}>
                ⚠ {errorMsg}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-4)', justifyContent: 'flex-end' }}>
              {file && stage !== 'uploading' && (
                <button onClick={reset} style={{
                  padding: '10px var(--sp-5)', borderRadius: 'var(--r-md)',
                  background: 'white', border: '1.5px solid var(--c-border)',
                  color: 'var(--c-text-muted)', fontFamily: 'inherit',
                  fontSize: 'var(--font-size-base)', fontWeight: 600, cursor: 'pointer',
                }}>
                  Batal
                </button>
              )}
              <button
                onClick={handleUpload}
                disabled={!file || stage === 'uploading'}
                style={{
                  padding: '10px var(--sp-5)', borderRadius: 'var(--r-md)',
                  background: !file || stage === 'uploading' ? '#94A3B8' : 'var(--c-secondary)',
                  border: 'none', color: 'white',
                  fontFamily: 'inherit', fontSize: 'var(--font-size-base)', fontWeight: 600,
                  cursor: !file || stage === 'uploading' ? 'not-allowed' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)',
                }}
              >
                {stage === 'uploading' ? (
                  <>
                    <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
                    Memproses...
                  </>
                ) : '⬆ Mulai Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hasil import */}
      {stage === 'done' && result && (
        <div style={{
          background: 'var(--c-surface)', border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-lg)', marginBottom: 'var(--sp-6)', overflow: 'hidden',
        }}>
          <div style={{
            padding: 'var(--sp-4) var(--sp-5)',
            background: 'var(--c-success-light)',
            borderBottom: '1px solid #C8E6C9',
            display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
          }}>
            <span style={{ fontSize: 22 }}>✅</span>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--c-success)', fontSize: 'var(--font-size-md)' }}>
                Import Selesai
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
                File: {file?.name}
              </div>
            </div>
            <button onClick={reset} style={{
              marginLeft: 'auto', padding: '7px var(--sp-4)',
              background: 'white', border: '1.5px solid var(--c-border)',
              borderRadius: 'var(--r-md)', cursor: 'pointer',
              fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--c-text-muted)',
              fontFamily: 'inherit',
            }}>
              Import Lagi
            </button>
          </div>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, borderBottom: '1px solid var(--c-border)' }}>
            {[
              { label: 'Total Baris', value: result.totalRows, color: 'var(--c-primary)' },
              { label: 'Pasien Baru', value: result.newPersons, color: 'var(--c-success)' },
              { label: 'Diperbarui', value: result.updatedPersons, color: 'var(--c-secondary)' },
              { label: 'Kunjungan Baru', value: result.newVisits, color: '#7C3AED' },
            ].map((s, i) => (
              <div key={i} style={{
                padding: 'var(--sp-5)',
                borderRight: i < 3 ? '1px solid var(--c-border)' : 'none',
              }}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--sp-1)' }}>
                  {s.label}
                </div>
                <div style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, color: s.color, lineHeight: 1 }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Baris gagal */}
          {result.skippedRows > 0 && (
            <div style={{ padding: 'var(--sp-4) var(--sp-5)' }}>
              <div style={{ fontWeight: 700, color: 'var(--c-error)', marginBottom: 'var(--sp-3)', fontSize: 'var(--font-size-sm)' }}>
                ⚠ {result.skippedRows} baris gagal diproses
              </div>
              <div style={{ maxHeight: 240, overflowY: 'auto', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-xs)' }}>
                  <thead>
                    <tr style={{ background: 'var(--c-bg)' }}>
                      {['Baris', 'No. HP', 'Alasan'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--c-text-muted)', borderBottom: '1px solid var(--c-border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--c-border)' }}>
                        <td style={{ padding: '8px 12px', color: 'var(--c-text-muted)' }}>{e.row}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{e.noHp || '—'}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--c-error)' }}>{e.alasan}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Riwayat import */}
      {logs.length > 0 && (
        <div style={{
          background: 'var(--c-surface)', border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-lg)', overflow: 'hidden',
        }}>
          <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)', fontWeight: 700, color: 'var(--c-primary)', fontSize: 'var(--font-size-md)' }}>
            Riwayat Import
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
              <thead>
                <tr style={{ background: 'var(--c-bg)' }}>
                  {['File', 'Status', 'Total', 'Baru', 'Update', 'Gagal', 'Waktu'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const st = STATUS_STYLE[log.status] || STATUS_STYLE.PENDING
                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--c-border)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--c-primary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.filename || '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ background: st.bg, color: st.color, padding: '2px 8px', borderRadius: 'var(--r-full)', fontSize: 'var(--font-size-xs)', fontWeight: 700 }}>
                          {st.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--c-text-muted)' }}>{log.total_rows}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--c-success)', fontWeight: 600 }}>{log.new_persons}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--c-secondary)', fontWeight: 600 }}>{log.updated_persons}</td>
                      <td style={{ padding: '10px 14px', color: log.skipped_rows > 0 ? 'var(--c-error)' : 'var(--c-text-muted)', fontWeight: log.skipped_rows > 0 ? 700 : 400 }}>
                        {log.skipped_rows}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--c-text-muted)', whiteSpace: 'nowrap' }}>
                        {formatDate(log.started_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
