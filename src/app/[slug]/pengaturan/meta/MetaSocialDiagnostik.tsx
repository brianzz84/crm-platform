'use client'

import { useState } from 'react'

interface HasilCek {
  kunci:  string
  label:  string
  status: 'ok' | 'gagal' | 'lewati'
  pesan:  string
  detail?: string
  fase?:  string
}

const BADGE: Record<HasilCek['status'], { txt: string; bg: string; fg: string; icon: string }> = {
  ok:     { txt: 'OK',      bg: '#F0FDF4', fg: '#16A34A', icon: '✓' },
  gagal:  { txt: 'Gagal',   bg: '#FEF2F2', fg: '#DC2626', icon: '✗' },
  lewati: { txt: 'Dilewati', bg: '#F1F5F9', fg: '#64748B', icon: '–' },
}

/**
 * Urutan yang TERBUKTI berhasil (3 Agu 2026). Sengaja tidak menyebut App Review
 * maupun System User: token Page lahir dari PERAN DI PAGE, bukan dari kepemilikan
 * Business Portfolio, dan admin app bisa memakai izin sensitif tanpa App Review.
 */
const PERSIAPAN = [
  'Instagram harus akun Professional/Business dan tertaut ke Facebook Page RKZ.',
  'Pastikan Anda punya peran penuh DI PAGE itu — bukan sekadar lewat portofolio bisnis.',
  'Dasbor App Meta → Kasus penggunaan → tambahkan "Kelola segala sesuatu di Halaman Anda" dan kasus penggunaan Instagram.',
  'Buka "Sesuaikan kasus penggunaan", lalu klik + Tambahkan pada TIAP izin satu per satu: pages_show_list, pages_read_engagement, read_insights, pages_read_user_content, instagram_basic, instagram_manage_insights. Menambah kasus penggunaannya saja tidak cukup — tanpa langkah ini Facebook mengabaikan izin tersebut tanpa pesan galat.',
  'pages_read_user_content diperlukan khusus untuk membaca komentar & reaksi per postingan Facebook. Tanpa izin ini penghitungnya pulang nol, sedangkan metrik lain tetap jalan. Sifatnya hanya membaca.',
  'Graph API Explorer → Generate Access Token → WAJIB diperpanjang di Access Token Debugger (Extend). Kalau langkah ini dilewat, token mati dalam hitungan jam.',
  'GET /me/accounts → salin access_token milik entri Page RKZ → isikan ke "Token Insights/Ads". Token Page turunan token panjang tidak kedaluwarsa.',
  'Fase 2 (inbox DM) nanti: tambahkan pages_manage_metadata.',
  'Fase 4 (iklan) nanti: tambahkan ads_read, dan pemilik Ad Account harus memberi akses ke app ini.',
]

export default function MetaSocialDiagnostik({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(false)
  const [hasil, setHasil]     = useState<HasilCek[] | null>(null)
  const [error, setError]     = useState('')
  const [buka, setBuka]       = useState<string | null>(null)

  async function jalankan() {
    setLoading(true); setError(''); setHasil(null)
    try {
      const res  = await fetch(`/api/${slug}/pengaturan/meta/probe`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error || 'Gagal menjalankan probe'); return }
      setHasil(json.data)
    } catch { setError('Gagal menghubungi server') }
    finally { setLoading(false) }
  }

  const kartu: React.CSSProperties = {
    background: 'white', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)',
    padding: 'var(--sp-5)', marginTop: 'var(--sp-5)',
  }

  return (
    <div style={kartu}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-primary)' }}>🔎 Probe Analitik Media Sosial</div>
          <p style={{ fontSize: 13, color: 'var(--c-text-muted)', margin: '4px 0 0', maxWidth: 560, lineHeight: 1.6 }}>
            Cek apakah token & izin sudah cukup untuk menarik data Facebook, Instagram, dan iklan —
            sebelum dashboard dibangun. Aman: hanya membaca, tidak mengubah apa pun.
          </p>
        </div>
        <button onClick={jalankan} disabled={loading} style={{
          padding: '9px 18px', borderRadius: 'var(--r-md)', border: 'none', flexShrink: 0,
          background: loading ? '#94A3B8' : 'var(--c-secondary)', color: 'white',
          fontFamily: 'inherit', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
        }}>
          {loading ? '⏳ Menjalankan…' : '▶ Jalankan Probe'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #EF4444', marginTop: 8 }}>{error}</div>
      )}

      {hasil && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {hasil.map(h => {
            const b = BADGE[h.status]
            return (
              <div key={h.kunci + h.label} style={{ border: '1px solid var(--c-border)', borderRadius: 8, overflow: 'hidden' }}>
                <div onClick={() => h.detail && setBuka(x => x === h.kunci ? null : h.kunci)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: h.detail ? 'pointer' : 'default' }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: b.bg, color: b.fg, fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{b.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>{h.label}</span>
                      {h.fase && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#EFF6FF', color: '#1D4ED8' }}>
                          baru dipakai {h.fase}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.5 }}>{h.pesan}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: b.bg, color: b.fg, flexShrink: 0 }}>{b.txt}</span>
                </div>
                {h.detail && buka === h.kunci && (
                  <pre style={{ margin: 0, padding: '8px 12px', background: 'var(--c-bg)', fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--c-text-muted)', borderTop: '1px solid var(--c-border)' }}>{h.detail}</pre>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Checklist persiapan */}
      <details style={{ marginTop: 14 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--c-secondary)' }}>Yang perlu disiapkan agar probe hijau</summary>
        <ol style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 13, color: 'var(--c-text-muted)', lineHeight: 1.7 }}>
          {PERSIAPAN.map((p, i) => <li key={i}>{p}</li>)}
        </ol>
      </details>
    </div>
  )
}
