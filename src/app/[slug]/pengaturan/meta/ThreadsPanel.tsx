'use client'

/**
 * Panel Threads — jalur ketiga, terpisah penuh dari Instagram dan Facebook.
 *
 * Berdiri sendiri karena kredensialnya memang integrasi lain: host sendiri, App
 * ID sendiri, token sendiri. Menyatukannya dengan panel Instagram sudah pernah
 * menjadi bentuk kesalahan yang sama — satu kolom token ambigu membuat satu
 * jalur mati karena tertimpa jalur lain.
 *
 * TAHAP 0. Panel ini belum menarik apa pun ke Sebutan Publik; ia hanya
 * menyambungkan dan MENGUJI. Hasil ujinya yang menentukan apakah kolektor layak
 * dibangun — pola yang sudah menyelamatkan kita sekali pada pencarian tagar
 * Instagram, yang ternyata terkunci App Review.
 */

import { useCallback, useEffect, useState } from 'react'

interface Cek {
  kunci: string; label: string; status: 'ok' | 'gagal' | 'lewati'
  pesan: string; detail?: string
}

const kartu: React.CSSProperties = {
  background: 'white', border: '1px solid var(--c-border)',
  borderRadius: 'var(--r-lg)', padding: 'var(--sp-5)', marginTop: 'var(--sp-5)',
}

const WARNA: Record<string, string> = {
  ok: 'var(--c-success)', gagal: '#DC2626', lewati: '#B45309',
}
const IKON: Record<string, string> = { ok: '✓', gagal: '✕', lewati: '!' }

export default function ThreadsPanel({ slug }: { slug: string }) {
  const [hasil, setHasil] = useState<Cek[] | null>(null)
  const [kata, setKata]   = useState('RKZ Surabaya')
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')

  // Pesan hasil OAuth dibawa lewat query string oleh callback.
  const [kabar, setKabar] = useState('')
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.get('threads') === 'ok') setKabar('Threads tersambung. Jalankan uji di bawah.')
    const e = q.get('threads_error')
    if (e) setGalat(e)
  }, [])

  const uji = useCallback(async () => {
    setSibuk(true); setGalat(''); setHasil(null)
    try {
      const res  = await fetch(`/api/${slug}/threads/probe`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kata }),
      })
      const json = await res.json()
      setHasil(json.hasil ?? [])
      if (json.error) setGalat(json.error)
    } catch { setGalat('Gagal menghubungi server.') }
    finally { setSibuk(false) }
  }, [slug, kata])

  return (
    <div style={kartu}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ maxWidth: 640 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--c-primary)' }}>
            🧵 Threads <span style={{ fontSize: 11, fontWeight: 700, color: '#B45309', background: '#FFFBEB', padding: '2px 8px', borderRadius: 999, marginLeft: 6 }}>Tahap uji</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--c-text-muted)', margin: '6px 0 0', lineHeight: 1.65 }}>
            Threads memberi <strong>pencarian teks penuh</strong> atas unggahan publik orang
            lain — hal yang tidak diberikan Instagram maupun Facebook di tingkat akses mana
            pun. Panel ini <strong>belum menarik apa pun</strong>; ia menyambungkan lalu
            menguji apakah pencarian itu benar-benar boleh dipakai.
          </p>
        </div>
        <div style={{ display: 'grid', gap: 6, flexShrink: 0, justifyItems: 'end' }}>
          <a href={`/api/${slug}/threads/oauth/start`}
            style={{
              padding: '9px 18px', borderRadius: 'var(--r-md)', background: 'var(--c-primary)',
              color: 'white', textDecoration: 'none', fontSize: 13, fontWeight: 700,
            }}>
            Hubungkan Threads
          </a>
          {/* Cadangan bila layar izin menolak karena threads_keyword_search
              belum aktif di dasbor. Penyambungan tetap selesai dengan izin
              dasar, lalu probe memanggil pencarian apa adanya — galat dari
              endpointnya sendiri jauh lebih berguna daripada layar izin yang
              menolak tanpa keterangan. */}
          <a href={`/api/${slug}/threads/oauth/start?dasar=1`}
            style={{ fontSize: 11.5, color: 'var(--c-secondary)', textDecoration: 'none' }}>
            Layar izin ditolak? Hubungkan dengan izin dasar saja →
          </a>
        </div>
      </div>

      {kabar && (
        <div style={{ marginTop: 'var(--sp-4)', background: '#F0FDF4', color: '#15803D', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #22C55E' }}>{kabar}</div>
      )}
      {galat && (
        <div style={{ marginTop: 'var(--sp-4)', background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #EF4444', lineHeight: 1.6 }}>{galat}</div>
      )}

      <div style={{ marginTop: 'var(--sp-4)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={kata} onChange={e => setKata(e.target.value)}
          placeholder="Kata uji"
          style={{
            flex: '1 1 220px', padding: '8px 12px', borderRadius: 'var(--r-md)',
            border: '1.5px solid var(--c-border)', fontFamily: 'inherit', fontSize: 13,
          }} />
        <button onClick={uji} disabled={sibuk} style={{
          padding: '8px 18px', borderRadius: 'var(--r-md)', border: 'none',
          background: sibuk ? '#94A3B8' : 'var(--c-secondary)', color: 'white',
          fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
          cursor: sibuk ? 'wait' : 'pointer', flexShrink: 0,
        }}>{sibuk ? '⏳ Menguji…' : 'Jalankan uji'}</button>
      </div>

      {hasil && hasil.length > 0 && (
        <div style={{ marginTop: 'var(--sp-4)', display: 'grid', gap: 8 }}>
          {hasil.map(c => (
            <div key={c.kunci} style={{
              border: '1px solid var(--c-border)', borderLeft: `4px solid ${WARNA[c.status]}`,
              borderRadius: 'var(--r-md)', padding: '11px 14px',
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ color: WARNA[c.status], fontWeight: 800 }}>{IKON[c.status]}</span>
                <strong style={{ fontSize: 13 }}>{c.label}</strong>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--c-text-muted)', lineHeight: 1.65, marginTop: 4 }}>
                {c.pesan}
              </div>
              {c.detail && (
                <pre style={{
                  marginTop: 8, marginBottom: 0, fontSize: 11, lineHeight: 1.55,
                  background: 'var(--c-bg-subtle,#F8FAFC)', padding: '8px 10px',
                  borderRadius: 'var(--r-sm)', overflowX: 'auto', whiteSpace: 'pre-wrap',
                  color: 'var(--c-text-muted)',
                }}>{c.detail}</pre>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 'var(--sp-4)', fontSize: 11.5, color: 'var(--c-text-faint)', lineHeight: 1.7 }}>
        Menuntut <code>THREADS_APP_ID</code> dan <code>THREADS_APP_SECRET</code> di server —
        keduanya <strong>berbeda</strong> dari App ID Meta maupun Instagram, diambil di Dasbor
        App → Threads API. Bila layar izin menolak, kemungkinan akun Instagram RKZ belum
        pernah mengaktifkan Threads; itu satu kali klik di aplikasi Threads, di luar CRM.
      </div>
    </div>
  )
}
