'use client'

/**
 * Panel Instagram Messaging — jalur Instagram Login.
 *
 * Berdiri terpisah dari MetaConfigForm karena tokennya memang integrasi lain:
 * host, jenis token, dan model izinnya berbeda. Menyatukannya ke satu formulir
 * adalah bentuk kesalahan yang sudah pernah terjadi — satu kolom token ambigu
 * membuat pengiriman WhatsApp mati karena tertimpa.
 *
 * Yang paling penting di layar ini: TANGGAL KEDALUWARSA. Token jalur ini mati
 * dalam 60 hari, sementara tiga token Meta lainnya abadi. Tidak menampilkannya
 * di mana pun adalah sebab sesungguhnya sepuluh hari kegagalan senyap pada
 * Agustus 2026.
 */

import { useCallback, useEffect, useState } from 'react'

interface Status {
  tersambung: boolean
  username: string | null
  userId: string | null
  kedaluwarsa: string | null
  sisaHari: number | null
  disegarkanPada: string | null
  aktif: boolean
}

interface Cek {
  kunci: string; label: string; status: 'ok' | 'gagal' | 'lewati'
  pesan: string; arti?: 'akses' | 'tidak-jelas' | 'konfigurasi'; detail?: string
}

const kartu: React.CSSProperties = {
  background: 'white', border: '1px solid var(--c-border)',
  borderRadius: 'var(--r-lg)', padding: 'var(--sp-5)', marginTop: 'var(--sp-5)',
}

const tombol = (utama: boolean, sibuk: boolean): React.CSSProperties => ({
  padding: '8px 16px', borderRadius: 'var(--r-md)', fontFamily: 'inherit',
  fontSize: 13, fontWeight: 700, cursor: sibuk ? 'wait' : 'pointer',
  border: utama ? 'none' : '1.5px solid var(--c-border)',
  background: utama ? (sibuk ? '#94A3B8' : 'var(--c-secondary)') : 'white',
  color: utama ? 'white' : 'var(--c-text-muted)',
})

const tanggal = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

/** Warna umur token: merah di bawah 14 hari, kuning di bawah 30. */
function warnaSisa(n: number | null): string {
  if (n == null) return 'var(--c-text-muted)'
  return n < 14 ? '#B91C1C' : n < 30 ? '#B45309' : 'var(--c-success)'
}

export default function InstagramMessagingPanel({ slug }: { slug: string }) {
  const [st, setSt]       = useState<Status | null>(null)
  const [cek, setCek]     = useState<Cek[] | null>(null)
  const [sibuk, setSibuk] = useState('')
  const [galat, setGalat] = useState('')
  const [kabar, setKabar] = useState('')

  const muat = useCallback(async () => {
    try {
      const res  = await fetch(`/api/${slug}/instagram/token`)
      const json = await res.json()
      if (json.success) setSt(json.data); else setGalat(json.error ?? 'Gagal memuat status.')
    } catch { setGalat('Gagal menghubungi server.') }
  }, [slug])

  useEffect(() => { muat() }, [muat])

  async function segarkan() {
    setSibuk('segar'); setGalat(''); setKabar('')
    try {
      const res  = await fetch(`/api/${slug}/instagram/token`, { method: 'POST' })
      const json = await res.json()
      if (json.data) setSt(json.data)
      if (json.success) setKabar(json.pesan); else setGalat(json.pesan ?? json.error ?? 'Gagal menyegarkan.')
    } catch { setGalat('Gagal menghubungi server.') }
    finally { setSibuk('') }
  }

  async function jalankanProbe() {
    setSibuk('probe'); setGalat(''); setKabar(''); setCek(null)
    try {
      const res  = await fetch(`/api/${slug}/instagram/probe`)
      const json = await res.json()
      if (json.success) setCek(json.hasil); else setGalat(json.error ?? 'Probe gagal.')
    } catch { setGalat('Gagal menghubungi server.') }
    finally { setSibuk('') }
  }

  return (
    <div style={kartu}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-primary)' }}>📩 Instagram Messaging</div>
          <p style={{ fontSize: 13, color: 'var(--c-text-muted)', margin: '4px 0 0', maxWidth: 640, lineHeight: 1.6 }}>
            Jalur <strong>Instagram Login</strong> — terpisah dari token Halaman yang dipakai
            analitik. Terbukti melayani baca dan balas DM tanpa App Review, karena CRM hanya
            melayani akun Instagram milik rumah sakit sendiri.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
          <a href={`/api/${slug}/instagram/oauth/start`} style={{ textDecoration: 'none' }}>
            <span style={tombol(!st?.tersambung, false)}>
              {st?.tersambung ? '↻ Sambungkan ulang' : '🔗 Hubungkan Instagram'}
            </span>
          </a>
          {st?.tersambung && (
            <>
              <button onClick={segarkan} disabled={!!sibuk} style={tombol(false, sibuk === 'segar')}>
                {sibuk === 'segar' ? '⏳ Menyegarkan…' : '⟲ Segarkan token'}
              </button>
              <button onClick={jalankanProbe} disabled={!!sibuk} style={tombol(true, sibuk === 'probe')}>
                {sibuk === 'probe' ? '⏳ Menguji…' : '▶ Jalankan probe'}
              </button>
            </>
          )}
        </div>
      </div>

      {galat && (
        <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #EF4444', marginTop: 12 }}>{galat}</div>
      )}
      {kabar && (
        <div style={{ background: '#F0FDF4', color: '#16A34A', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #16A34A', marginTop: 12 }}>{kabar}</div>
      )}

      {st && !st.tersambung && (
        <div style={{ background: '#FFFBEB', color: '#92400E', padding: '12px 15px', borderRadius: 'var(--r-sm)', fontSize: 12.5, marginTop: 14, lineHeight: 1.65 }}>
          <strong>Belum tersambung.</strong> Sebelum menekan Hubungkan, pastikan alamat callback
          sudah terdaftar di Dasbor App → Instagram → <em>Siapkan login bisnis Instagram</em>:
          <div style={{ fontFamily: 'monospace', fontSize: 11.5, marginTop: 6, wordBreak: 'break-all' }}>
            {typeof window !== 'undefined' ? window.location.origin : ''}/api/instagram/oauth/callback
          </div>
        </div>
      )}

      {st?.tersambung && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1, background: 'var(--c-border)', border: '1px solid var(--c-border)', borderRadius: 8, overflow: 'hidden', marginTop: 14 }}>
          {[
            { l: 'Akun', v: st.username ? `@${st.username}` : '—', w: undefined },
            { l: 'Sisa umur token', v: st.sisaHari != null ? `${st.sisaHari} hari` : '—', w: warnaSisa(st.sisaHari) },
            { l: 'Kedaluwarsa', v: tanggal(st.kedaluwarsa), w: undefined },
            { l: 'Disegarkan', v: tanggal(st.disegarkanPada), w: undefined },
          ].map(s => (
            <div key={s.l} style={{ background: 'white', padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--c-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.l}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: s.w ?? 'var(--c-primary)' }}>{s.v}</div>
            </div>
          ))}
        </div>
      )}

      {cek && (
        <div style={{ marginTop: 14, border: '1px solid var(--c-border)', borderRadius: 8, overflow: 'hidden' }}>
          {cek.map(c => (
            <div key={c.kunci} style={{ padding: '11px 14px', borderBottom: '1px solid var(--c-border)', background: 'white' }}>
              <div style={{ display: 'flex', gap: 9, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ color: c.status === 'ok' ? 'var(--c-success)' : c.status === 'gagal' ? '#B91C1C' : 'var(--c-text-muted)', fontWeight: 800 }}>
                  {c.status === 'ok' ? '✓' : c.status === 'gagal' ? '✗' : '–'}
                </span>
                <strong style={{ fontSize: 13 }}>{c.label}</strong>
                {/* Golongan galat ditampilkan karena inilah yang dulu disalahbaca:
                    timeout pernah disimpulkan sebagai batas akses, dan kekeliruan
                    itu hampir membuat App Review diajukan tanpa perlu. */}
                {c.arti && (
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                    background: c.arti === 'akses' ? '#FEF2F2' : c.arti === 'tidak-jelas' ? '#FFFBEB' : '#F1F5F9',
                    color:      c.arti === 'akses' ? '#B91C1C' : c.arti === 'tidak-jelas' ? '#92400E' : '#475569',
                  }}>
                    {c.arti === 'akses' ? 'batas akses' : c.arti === 'tidak-jelas' ? 'tidak jelas' : 'konfigurasi'}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--c-text-muted)', marginTop: 3, lineHeight: 1.55 }}>{c.pesan}</div>
              {c.detail && (
                <div style={{ fontSize: 12, color: 'var(--c-text-faint)', marginTop: 4, lineHeight: 1.55 }}>{c.detail}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 12, lineHeight: 1.6 }}>
        Berbeda dari token WhatsApp, Halaman, dan Ads di halaman ini — yang tidak pernah
        kedaluwarsa — token Instagram Messaging <strong>mati dalam 60 hari</strong>. Penyegaran
        berjalan otomatis tiap dini hari begitu umurnya melewati 30 hari; tombol di atas hanya
        untuk memaksanya lebih awal.
      </p>
    </div>
  )
}
