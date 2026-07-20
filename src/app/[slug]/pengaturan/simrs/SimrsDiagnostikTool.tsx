'use client'

import { useCallback, useEffect, useState } from 'react'

type Jenis = 'kunjungan' | 'pasien'

interface FieldKosong { field: string; jumlahBaris: number }
interface Validasi {
  jumlahBaris: number
  fieldHilang: FieldKosong[]
  fieldKosongPenting: FieldKosong[]
  fieldAsing: string[]
}
interface HasilUji {
  berhasil: boolean
  statusHttp: number | null
  durasiMs: number
  errorPesan: string | null
  raw: unknown
  validasi: Validasi | null
}
interface RiwayatRow {
  id: string
  jenis: string
  parameter: Record<string, string>
  berhasil: boolean
  http_status: number | null
  durasi_ms: number
  jumlah_baris: number | null
  field_hilang: string[]
  field_asing: string[]
  pesan_error: string | null
  dilakukan_oleh_nama: string
  created_at: string
}

const kartu: React.CSSProperties = {
  background: 'white', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)',
  padding: 'var(--sp-5)', boxShadow: 'var(--shadow-sm)', marginBottom: 'var(--sp-5)',
}
const inp: React.CSSProperties = {
  padding: '9px 12px', fontFamily: 'inherit', fontSize: 'var(--font-size-sm)',
  border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-sm)',
  outline: 'none', background: 'white', color: 'var(--c-text)', boxSizing: 'border-box',
}

function todayStr() { return new Date().toISOString().slice(0, 10) }

export default function SimrsDiagnostikTool({ slug }: { slug: string }) {
  const [jenis, setJenis]   = useState<Jenis>('kunjungan')
  const [tanggal, setTanggal] = useState(todayStr())
  const [noRm, setNoRm]     = useState('')
  const [loading, setLoading] = useState(false)
  const [hasil, setHasil]   = useState<HasilUji | null>(null)
  const [error, setError]   = useState('')
  const [showRaw, setShowRaw] = useState(false)

  const [riwayat, setRiwayat] = useState<RiwayatRow[]>([])
  const [loadingRiwayat, setLoadingRiwayat] = useState(true)

  const muatRiwayat = useCallback(async () => {
    try {
      const res  = await fetch(`/api/${slug}/simrs/diagnostik`)
      const json = await res.json()
      if (json.success) setRiwayat(json.data ?? [])
    } catch {}
    setLoadingRiwayat(false)
  }, [slug])

  useEffect(() => { muatRiwayat() }, [muatRiwayat])

  async function jalankan() {
    setLoading(true); setError(''); setHasil(null); setShowRaw(false)
    try {
      const body = jenis === 'kunjungan' ? { jenis, tanggal } : { jenis, no_rm: noRm }
      const res  = await fetch(`/api/${slug}/simrs/diagnostik`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.success) { setError(json.error || 'Gagal menjalankan uji'); return }
      setHasil(json.data)
      await muatRiwayat()
    } catch { setError('Gagal menghubungi server') }
    finally { setLoading(false) }
  }

  const bisaJalan = jenis === 'kunjungan' ? !!tanggal : noRm.trim().length > 0

  return (
    <div style={kartu}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-primary)', marginBottom: 4 }}>
        🔧 Tools Diagnostik API
      </div>
      <p style={{ fontSize: 13, color: 'var(--c-text-muted)', marginBottom: 'var(--sp-4)', lineHeight: 1.6 }}>
        Uji koneksi ke endpoint SIMRS yang sudah dikonfigurasi di atas, dan periksa apakah field yang
        dikembalikan sudah sesuai yang kita butuhkan — sebelum sync otomatis dinyalakan untuk data pasien
        sungguhan. Hanya menguji endpoint yang sudah tersimpan (bukan URL bebas), dan respons pasien
        tidak pernah disimpan sebagai log — hanya ringkasan hasil validasi.
      </p>

      {/* Form */}
      <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 'var(--sp-4)' }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--c-text)', marginBottom: 4 }}>Endpoint</label>
          <select value={jenis} onChange={e => setJenis(e.target.value as Jenis)} style={{ ...inp, minWidth: 180 }}>
            <option value="kunjungan">Kunjungan (delta harian)</option>
            <option value="pasien">Pasien (by No. RM)</option>
          </select>
        </div>

        {jenis === 'kunjungan' ? (
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--c-text)', marginBottom: 4 }}>Tanggal</label>
            <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} style={inp} />
          </div>
        ) : (
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--c-text)', marginBottom: 4 }}>No. Rekam Medis</label>
            <input value={noRm} onChange={e => setNoRm(e.target.value)} placeholder="mis. RM123456" style={{ ...inp, minWidth: 180 }} />
          </div>
        )}

        <button onClick={jalankan} disabled={loading || !bisaJalan}
          style={{
            padding: '9px 20px', borderRadius: 'var(--r-sm)', border: 'none',
            background: loading || !bisaJalan ? 'var(--c-border)' : 'var(--c-secondary)',
            color: loading || !bisaJalan ? 'var(--c-text-faint)' : 'white',
            fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
            cursor: loading || !bisaJalan ? 'not-allowed' : 'pointer',
          }}>
          {loading ? '⏳ Menguji…' : '▶ Jalankan Uji'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#FDECEA', border: '1px solid #FBBABA', borderRadius: 'var(--r-md)', padding: '10px 14px', fontSize: 13, color: '#C0392B', marginBottom: 'var(--sp-4)' }}>
          ⚠ {error}
        </div>
      )}

      {/* Hasil */}
      {hasil && (
        <div style={{ border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <span style={{
              padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
              background: hasil.berhasil ? '#E8F5E9' : '#FDECEA', color: hasil.berhasil ? '#278B58' : '#C0392B',
            }}>
              {hasil.berhasil ? '✓ Berhasil' : '✗ Gagal'}
            </span>
            {hasil.statusHttp !== null && <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>HTTP {hasil.statusHttp}</span>}
            <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>{hasil.durasiMs}ms</span>
            {hasil.validasi && <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>{hasil.validasi.jumlahBaris} baris</span>}
          </div>

          {hasil.errorPesan && (
            <div style={{ fontSize: 13, color: '#C0392B', marginBottom: 'var(--sp-3)' }}>{hasil.errorPesan}</div>
          )}

          {hasil.validasi && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 'var(--sp-3)' }}>
              {hasil.validasi.fieldHilang.length > 0 && (
                <div style={{ fontSize: 12, color: '#C0392B' }}>
                  <strong>Field wajib hilang:</strong> {hasil.validasi.fieldHilang.map(f => `${f.field} (${f.jumlahBaris} baris)`).join(', ')}
                </div>
              )}
              {hasil.validasi.fieldKosongPenting.length > 0 && (
                <div style={{ fontSize: 12, color: '#9A6C00' }}>
                  <strong>Field penting kosong:</strong> {hasil.validasi.fieldKosongPenting.map(f => `${f.field} (${f.jumlahBaris} baris)`).join(', ')}
                </div>
              )}
              {hasil.validasi.fieldAsing.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
                  <strong>Field asing (tidak dikenali, info saja):</strong> {hasil.validasi.fieldAsing.join(', ')}
                </div>
              )}
              {hasil.validasi.fieldHilang.length === 0 && hasil.validasi.fieldKosongPenting.length === 0 && hasil.validasi.fieldAsing.length === 0 && (
                <div style={{ fontSize: 12, color: '#278B58' }}>✓ Semua field wajib & penting terisi, tidak ada field asing.</div>
              )}
            </div>
          )}

          <button onClick={() => setShowRaw(s => !s)}
            style={{ fontSize: 12, color: 'var(--c-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
            {showRaw ? '▲ Sembunyikan respons mentah' : '▼ Lihat respons mentah'}
          </button>
          {showRaw && (
            <pre style={{
              marginTop: 8, padding: 'var(--sp-3)', background: 'var(--c-bg)', borderRadius: 'var(--r-sm)',
              fontSize: 11, overflow: 'auto', maxHeight: 320, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {JSON.stringify(hasil.raw, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Riwayat */}
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
        Riwayat Pengujian
      </div>
      {loadingRiwayat ? (
        <div style={{ fontSize: 13, color: 'var(--c-text-muted)' }}>Memuat…</div>
      ) : riwayat.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--c-text-muted)' }}>Belum ada pengujian.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Waktu', 'Endpoint', 'Parameter', 'Hasil', 'Durasi', 'Baris', 'Oleh'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', borderBottom: '2px solid var(--c-border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {riwayat.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--c-border)' }}>
                  <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', color: 'var(--c-text-muted)' }}>
                    {new Date(r.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '6px 10px' }}>{r.jenis}</td>
                  <td style={{ padding: '6px 10px', color: 'var(--c-text-muted)' }}>{Object.values(r.parameter)[0]}</td>
                  <td style={{ padding: '6px 10px' }}>
                    <span style={{ color: r.berhasil ? '#278B58' : '#C0392B', fontWeight: 600 }}>
                      {r.berhasil ? '✓' : '✗'} {r.http_status ?? '—'}
                    </span>
                    {r.field_hilang.length > 0 && <span style={{ color: '#C0392B', marginLeft: 6 }}>({r.field_hilang.length} hilang)</span>}
                  </td>
                  <td style={{ padding: '6px 10px', color: 'var(--c-text-muted)' }}>{r.durasi_ms}ms</td>
                  <td style={{ padding: '6px 10px', color: 'var(--c-text-muted)' }}>{r.jumlah_baris ?? '—'}</td>
                  <td style={{ padding: '6px 10px', color: 'var(--c-text-muted)' }}>{r.dilakukan_oleh_nama}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
