'use client'

import { useCallback, useEffect, useState } from 'react'

interface Konfig {
  aktif: boolean
  jam_snapshot: number
  last_run_at: string | null
  last_status: string | null
  last_pesan: string | null
  barisHarian: number
  jumlahKonten: number
  terekamSejak: string | null
}

const WARNA: Record<string, { bg: string; fg: string; label: string }> = {
  ok:       { bg: '#F0FDF4', fg: '#16A34A', label: 'Berhasil' },
  sebagian: { bg: '#FFFBEB', fg: '#B45309', label: 'Sebagian' },
  gagal:    { bg: '#FEF2F2', fg: '#DC2626', label: 'Gagal' },
}

export default function SnapshotPanel({ slug }: { slug: string }) {
  const [cfg, setCfg]       = useState<Konfig | null>(null)
  const [sibuk, setSibuk]   = useState(false)
  const [galat, setGalat]   = useState('')

  const muat = useCallback(async () => {
    try {
      const res  = await fetch(`/api/${slug}/pengaturan/snapshot`)
      const json = await res.json()
      if (json.success) setCfg(json.data)
      else setGalat(json.error || 'Gagal memuat konfigurasi')
    } catch { setGalat('Gagal menghubungi server') }
  }, [slug])

  useEffect(() => { muat() }, [muat])

  async function simpan(patch: Partial<Pick<Konfig, 'aktif' | 'jam_snapshot'>>) {
    setSibuk(true); setGalat('')
    try {
      const res  = await fetch(`/api/${slug}/pengaturan/snapshot`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (json.success) setCfg(json.data); else setGalat(json.error || 'Gagal menyimpan')
    } catch { setGalat('Gagal menghubungi server') }
    finally { setSibuk(false) }
  }

  async function tarikKontenLama() {
    setSibuk(true); setGalat('')
    try {
      const res  = await fetch(`/api/${slug}/pengaturan/snapshot`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'backfill', hari: 90 }),
      })
      const json = await res.json()
      if (json.success) setCfg(json.data); else setGalat(json.error || 'Gagal menarik konten lama')
    } catch { setGalat('Gagal menghubungi server') }
    finally { setSibuk(false) }
  }

  /**
   * Tarik riwayat percakapan Messenger.
   *
   * Ada tombolnya sendiri karena penarikan riwayat berbeda sifat dari penarikan
   * rutin: sekali jalan, jauh ke belakang, dan hanya diperlukan saat pertama
   * menyambungkan atau setelah perbaikan kolektor. Menyuruh admin membuka konsol
   * peramban untuk itu bukan rancangan yang layak dipakai berulang.
   */
  async function tarikRiwayatDm() {
    setSibuk(true); setGalat('')
    try {
      const res  = await fetch(`/api/${slug}/pengaturan/snapshot`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'dm', hari: 120 }),
      })
      const json = await res.json()
      if (!json.success) { setGalat(json.error || 'Gagal menarik riwayat DM'); return }
      const h = json.hasil ?? {}
      alert(`${h.percakapan ?? 0} percakapan diperiksa, ${h.pesanBaru ?? 0} pesan baru tersimpan.\n\n` +
            'Pesan yang sudah ada ikut diperbarui — termasuk arah masuk/keluarnya.')
      muat()
    } catch { setGalat('Gagal menghubungi server') }
    finally { setSibuk(false) }
  }

  async function jalankanSekarang() {
    setSibuk(true); setGalat('')
    try {
      const res  = await fetch(`/api/${slug}/pengaturan/snapshot`, { method: 'POST' })
      const json = await res.json()
      if (json.success) setCfg(json.data); else setGalat(json.error || 'Gagal menjalankan')
    } catch { setGalat('Gagal menghubungi server') }
    finally { setSibuk(false) }
  }

  const kartu: React.CSSProperties = {
    background: 'white', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)',
    padding: 'var(--sp-5)', marginTop: 'var(--sp-5)',
  }

  const st = cfg?.last_status ? WARNA[cfg.last_status] : null

  return (
    <div style={kartu}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-primary)' }}>📸 Snapshot Kanal Publik</div>
          <p style={{ fontSize: 13, color: 'var(--c-text-muted)', margin: '4px 0 0', maxWidth: 620, lineHeight: 1.6 }}>
            Merekam angka medsos tiap malam supaya laporan triwulanan tetap bisa dibuat.
            Instagram menghapus riwayat hariannya dalam hitungan pekan, dan performa
            &ldquo;7 hari pertama&rdquo; sebuah konten hanya bisa diketahui bila diukur tepat pada
            hari ketujuh — keduanya mustahil ditarik belakangan.
          </p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flexShrink: 0 }}>
          <input type="checkbox" checked={!!cfg?.aktif} disabled={sibuk || !cfg}
            onChange={e => simpan({ aktif: e.target.checked })}
            style={{ width: 16, height: 16, cursor: 'pointer' }} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>{cfg?.aktif ? 'Aktif' : 'Nonaktif'}</span>
        </label>
      </div>

      {galat && (
        <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #EF4444', marginTop: 10 }}>{galat}</div>
      )}

      {cfg && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
            <label style={{ fontSize: 13, color: 'var(--c-text-muted)' }}>Jalan tiap hari pukul</label>
            <select value={cfg.jam_snapshot} disabled={sibuk}
              onChange={e => simpan({ jam_snapshot: Number(e.target.value) })}
              style={{ padding: '6px 10px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--c-border)', fontSize: 13, fontFamily: 'inherit' }}>
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}:00 WIB</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
              {/* Hanya DAFTAR KONTEN yang bisa ditarik mundur; metrik harian sudah
                  hilang dari API dan tidak akan pernah kembali. */}
              <button onClick={tarikKontenLama} disabled={sibuk} style={{
                padding: '8px 16px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--c-border)',
                background: 'white', color: 'var(--c-text-muted)',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: sibuk ? 'wait' : 'pointer',
              }}>
                ⟲ Tarik konten lama (90 hari)
              </button>
              <button onClick={tarikRiwayatDm} disabled={sibuk} style={{
                padding: '8px 16px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--c-border)',
                background: 'white', color: 'var(--c-text-muted)',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: sibuk ? 'wait' : 'pointer',
              }}>
                💬 Tarik riwayat DM (120 hari)
              </button>
              <button onClick={jalankanSekarang} disabled={sibuk} style={{
                padding: '8px 16px', borderRadius: 'var(--r-md)', border: 'none',
                background: sibuk ? '#94A3B8' : 'var(--c-secondary)', color: 'white',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: sibuk ? 'wait' : 'pointer',
              }}>
                {sibuk ? '⏳ Memproses…' : '▶ Jalankan sekarang'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1, background: 'var(--c-border)', border: '1px solid var(--c-border)', borderRadius: 8, overflow: 'hidden', marginTop: 14 }}>
            {[
              { l: 'Baris harian', v: cfg.barisHarian.toLocaleString('id-ID') },
              { l: 'Konten terekam', v: cfg.jumlahKonten.toLocaleString('id-ID') },
              { l: 'Terekam sejak', v: cfg.terekamSejak ? String(cfg.terekamSejak).slice(0, 10) : '—' },
              { l: 'Jalan terakhir', v: cfg.last_run_at ? new Date(cfg.last_run_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '—' },
            ].map(s => (
              <div key={s.l} style={{ background: 'white', padding: '10px 14px' }}>
                <div style={{ fontSize: 10, color: 'var(--c-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.l}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--c-primary)' }}>{s.v}</div>
              </div>
            ))}
          </div>

          {st && (
            <div style={{ marginTop: 10, background: st.bg, color: st.fg, padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 12, lineHeight: 1.6 }}>
              <strong>{st.label}</strong>
              {cfg.last_pesan && <> — {cfg.last_pesan}</>}
            </div>
          )}

          <p style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 12, lineHeight: 1.6 }}>
            Snapshot hanya merekam sejak hari ia dinyalakan; periode sebelum itu sudah hilang dari
            API dan tidak bisa direkonstruksi. Saat pertama dijalankan, riwayat yang masih tersisa
            di Meta (sekitar 30 hari terakhir) ikut terbawa. YouTube dan GA4 direkam di tingkat akun
            saja — performa per video YouTube bisa dihitung ulang kapan pun langsung dari Google,
            jadi menyalinnya tidak menambah kemampuan apa pun.
          </p>
        </>
      )}
    </div>
  )
}
