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
  newRencana:     number
  updatedRencana: number
  skippedRows:    number
  errors:         { row: number; noHp: string | null; alasan: string; sheet?: string }[]
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

      {/* Panduan penggunaan */}
      <div style={{
        background: 'var(--c-surface)', border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-lg)', marginBottom: 'var(--sp-6)', overflow: 'hidden',
      }}>
        <div style={{
          padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)',
          fontWeight: 700, color: 'var(--c-primary)', fontSize: 'var(--font-size-md)',
        }}>
          Cara Menggunakan
        </div>

        <div style={{ padding: 'var(--sp-5)' }}>
          {/* Tiga langkah */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: 'var(--sp-4)', marginBottom: 'var(--sp-5)',
          }}>
            {[
              { n: '1', judul: 'Unduh template', isi: 'Klik "Unduh Template" di atas. Berkasnya sudah berisi contoh pengisian dan sheet "Petunjuk" yang menjelaskan setiap kolom.' },
              { n: '2', judul: 'Isi data', isi: 'Sheet "Data Pasien": satu baris = satu pasien + (opsional) satu kunjungan. Sheet "Rencana Kontrol" opsional — isi bila ingin mengaktifkan pengingat kontrol & vaksin.' },
              { n: '3', judul: 'Unggah & periksa', isi: 'Unggah berkas di bawah. Setelah selesai, hasil per baris — termasuk yang dilewati beserta alasannya — langsung ditampilkan.' },
            ].map(s => (
              <div key={s.n} style={{ display: 'flex', gap: 'var(--sp-3)' }}>
                <div style={{
                  flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
                  background: 'var(--c-secondary)', color: 'white',
                  fontWeight: 800, fontSize: 'var(--font-size-sm)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{s.n}</div>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--c-primary)', fontSize: 'var(--font-size-sm)', marginBottom: 2 }}>
                    {s.judul}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', lineHeight: 1.55 }}>
                    {s.isi}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Kolom, dikelompokkan menurut perannya */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            {[
              { sheet: 'Sheet “Data Pasien”', grup: 'Wajib diisi', wajib: true, cols: ['nama', 'no_hp'] },
              { grup: 'Data pasien',        wajib: false, cols: ['no_rm', 'email', 'tanggal_lahir'] },
              { grup: 'Data kunjungan — hanya diproses bila tanggal_kunjungan diisi', wajib: false,
                cols: ['tanggal_kunjungan', 'unit', 'poli', 'dokter', 'diagnosa_icd', 'diagnosa_nama',
                       'tindakan', 'tindakan_kode', 'jenis_pembayaran', 'nama_instansi', 'status_kunjungan'] },
              { sheet: 'Sheet “Rencana Kontrol” — opsional, mengaktifkan Pengingat Kontrol & Pengingat Vaksin',
                grup: 'Wajib diisi', wajib: true, cols: ['no_hp', 'tanggal_rencana'] },
              { grup: 'Rincian jadwal', wajib: false,
                cols: ['no_rm', 'rencana_id', 'jenis', 'poli', 'unit', 'jenis_vaksin', 'keterangan', 'status'] },
            ].map(g => (
              <div key={(g.sheet ?? '') + g.grup} style={g.sheet ? { marginTop: 'var(--sp-2)' } : undefined}>
                {g.sheet && (
                  <div style={{
                    fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--c-primary)',
                    marginBottom: 'var(--sp-2)',
                  }}>
                    {g.sheet}
                  </div>
                )}
                <div style={{
                  fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--c-text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--sp-2)',
                }}>
                  {g.grup}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
                  {g.cols.map(col => (
                    <span key={col} style={{
                      background: g.wajib ? 'var(--c-secondary)' : 'var(--c-bg)',
                      color:      g.wajib ? 'white' : 'var(--c-text)',
                      border:     g.wajib ? 'none' : '1px solid var(--c-border)',
                      padding: '2px 8px', borderRadius: 'var(--r-full)',
                      fontSize: 'var(--font-size-xs)', fontWeight: 600, fontFamily: 'monospace',
                    }}>
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Perilaku yang perlu diketahui sebelum mengunggah */}
          <div style={{
            marginTop: 'var(--sp-5)', background: 'var(--c-secondary-light)',
            border: '1px solid #b3e0ea', borderRadius: 'var(--r-md)',
            padding: 'var(--sp-4)', fontSize: 'var(--font-size-xs)',
            color: 'var(--c-text)', lineHeight: 1.6,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div>
              <strong>Aman diunggah ulang.</strong> Berkas yang sama boleh diunggah lagi tanpa menggandakan data.
              Kunjungan dianggap sama bila tanggal, poli, dan tindakannya sama.
            </div>
            <div>
              <strong>Pencocokan pasien.</strong> Sistem mencari lewat no_rm lebih dulu, lalu no_hp — pasien yang
              sudah ada akan diperbarui, bukan dibuat ganda.
            </div>
            <div>
              <strong>Penjamin.</strong> Isi <code>jenis_pembayaran</code> dengan TUNAI atau NON_TUNAI, lalu
              <code> nama_instansi</code> untuk penjaminnya (mis. BPJS Kesehatan, Prudential). Ini yang membuat
              segmentasi berdasarkan penjamin bisa dipakai.
            </div>
            <div>
              <strong>Kunjungan batal.</strong> Baris dengan <code>status_kunjungan</code> berisi BATAL/CANCEL tetap
              memperbarui data pasien, tetapi kunjungannya tidak disimpan sebagai riwayat.
            </div>
            <div>
              <strong>Jadwal tidak dibatalkan otomatis.</strong> Jadwal yang sudah tersimpan tetap aktif meskipun
              tidak ikut disertakan pada impor berikutnya — satu berkas hanya memuat sebagian data. Untuk
              membatalkan, impor ulang baris jadwal itu dengan <code>status</code> = batal.
            </div>
            <div>
              <strong>Pasien harus ada lebih dulu.</strong> Baris jadwal tidak membuat pasien baru. Kalau pasiennya
              belum terdaftar, sertakan dulu di sheet “Data Pasien” pada berkas yang sama.
            </div>
            <div style={{ color: 'var(--c-text-muted)' }}>
              Format no_hp: 08xxx atau +628xxx · Format tanggal: DD/MM/YYYY atau YYYY-MM-DD
            </div>
          </div>
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

          {/* Stat cards — kartu jadwal hanya muncul bila berkas memuat sheet Rencana Kontrol */}
          {(() => {
            const kartu = [
              { label: 'Total Baris',    value: result.totalRows,      color: 'var(--c-primary)' },
              { label: 'Pasien Baru',    value: result.newPersons,     color: 'var(--c-success)' },
              { label: 'Diperbarui',     value: result.updatedPersons, color: 'var(--c-secondary)' },
              { label: 'Kunjungan Baru', value: result.newVisits,      color: '#7C3AED' },
              ...(result.newRencana || result.updatedRencana ? [
                { label: 'Jadwal Baru',       value: result.newRencana,     color: '#0E7490' },
                { label: 'Jadwal Diperbarui', value: result.updatedRencana, color: '#0E7490' },
              ] : []),
            ]
            return (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 0, borderBottom: '1px solid var(--c-border)',
              }}>
                {kartu.map((s, i) => (
                  <div key={s.label} style={{
                    padding: 'var(--sp-5)',
                    borderRight: i < kartu.length - 1 ? '1px solid var(--c-border)' : 'none',
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
            )
          })()}

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
                      {['Sheet', 'Baris', 'No. HP', 'Alasan'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--c-text-muted)', borderBottom: '1px solid var(--c-border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--c-border)' }}>
                        <td style={{ padding: '8px 12px', color: 'var(--c-text-muted)', whiteSpace: 'nowrap' }}>{e.sheet || 'Data Pasien'}</td>
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
