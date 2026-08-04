'use client'

import { useCallback, useEffect, useState } from 'react'

interface Sifat { kode: string; nama: string; deskripsi: string | null; warna: string }
interface Konten {
  id: string; kanal: string; jenis: string; tanggal: string
  teks: string | null; permalink: string | null; sampul: string | null
  sifat: string | null; sifat_usulan: string | null
  jangkauan: number; tayangan: number; interaksi: number; suka: number
}

const angka = (n: number) => Math.round(n).toLocaleString('id-ID')

const tombol = (utama: boolean): React.CSSProperties => ({
  padding: '6px 13px', borderRadius: 'var(--r-md)', cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 12, fontWeight: 700,
  border: utama ? 'none' : '1.5px solid var(--c-border)',
  background: utama ? 'var(--c-secondary)' : 'white',
  color: utama ? 'white' : 'var(--c-text-muted)',
})

export default function KontenTab({ slug }: { slug: string }) {
  const [rows, setRows]   = useState<Konten[]>([])
  const [sifat, setSifat] = useState<Sifat[]>([])
  const [belum, setBelum] = useState(0)
  const [total, setTotal] = useState(0)
  const [hal, setHal]     = useState(1)
  const [totalHal, setTotalHal] = useState(1)
  const [filterKanal, setFilterKanal]   = useState<'' | 'IG' | 'FB'>('')
  const [filterStatus, setFilterStatus] = useState<'semua' | 'belum' | 'sudah'>('semua')
  const [muat, setMuat]   = useState(true)
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  const [kabar, setKabar] = useState('')

  const load = useCallback(async () => {
    setMuat(true); setGalat('')
    try {
      const p = new URLSearchParams({ status: filterStatus, hal: String(hal) })
      if (filterKanal) p.set('kanal', filterKanal)
      const res  = await fetch(`/api/${slug}/kanal-publik/konten?${p}`)
      const json = await res.json()
      if (!json.success) { setGalat(json.error || 'Gagal memuat konten'); return }
      setRows(json.data); setSifat(json.sifat); setBelum(json.belumDitandai)
      setTotal(json.total); setTotalHal(json.totalHal)
    } catch { setGalat('Gagal menghubungi server') }
    finally { setMuat(false) }
  }, [slug, filterKanal, filterStatus, hal])

  useEffect(() => { load() }, [load])

  async function tandai(id: string, kode: string | null) {
    setSibuk(true); setGalat('')
    try {
      const res  = await fetch(`/api/${slug}/kanal-publik/konten`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, sifat: kode }),
      })
      const json = await res.json()
      if (!json.success) { setGalat(json.error || 'Gagal menandai'); return }
      setRows(rs => rs.map(r => r.id === id ? { ...r, sifat: json.data.sifat, sifat_usulan: null } : r))
      setBelum(b => Math.max(0, b + (kode ? -1 : 1)))
    } catch { setGalat('Gagal menghubungi server') }
    finally { setSibuk(false) }
  }

  /**
   * Setujui seluruh usulan yang masih menggantung.
   *
   * Alurnya sengaja: admin membaca daftarnya, membetulkan yang perlu, lalu
   * menyetujui sisanya. Karena itu tombol ini TIDAK PERNAH menimpa konten yang
   * sudah ditandai manusia — pembetulan yang sudah dilakukan tidak boleh
   * terhapus oleh satu klik berikutnya.
   */
  async function setujuiSemua() {
    const n = rows.filter(r => !r.sifat && r.sifat_usulan).length
    if (!n) return
    if (!confirm(`Setujui ${n} usulan AI yang belum ditandai?\n\nKonten yang sudah Anda tandai sendiri tidak akan tersentuh.`)) return

    setSibuk(true)
    try {
      const res  = await fetch(`/api/${slug}/kanal-publik/konten`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'setujui_semua' }),
      })
      const json = await res.json()
      if (!json.success) { alert(json.error || 'Gagal menyetujui'); return }
      alert(`${json.disetujui} usulan disetujui` +
            (json.dilewati ? `, ${json.dilewati} dilewati karena sifatnya sudah tidak aktif.` : '.'))
      load()
    } catch { alert('Gagal menghubungi server') }
    finally { setSibuk(false) }
  }

  async function usulkan() {
    setSibuk(true); setGalat(''); setKabar('')
    try {
      const res  = await fetch(`/api/${slug}/kanal-publik/konten/usulan`, { method: 'POST' })
      const json = await res.json()
      if (!json.success) { setGalat(json.error || 'Gagal meminta usulan'); return }
      setKabar(
        `${json.diperiksa} konten diperiksa — ${json.diusulkan} diusulkan, ` +
        `${json.ragu} dinyatakan ragu oleh AI${json.ditolak ? `, ${json.ditolak} kode karangan dibuang` : ''}.`,
      )
      load()
    } catch { setGalat('Gagal menghubungi server') }
    finally { setSibuk(false) }
  }

  const cariSifat = (kode: string | null) => sifat.find(s => s.kode === kode)

  return (
    <div>
      <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', padding: 'var(--sp-4) var(--sp-5)', marginBottom: 'var(--sp-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Kanal</span>
          {([['', 'Semua'], ['IG', 'Instagram'], ['FB', 'Facebook']] as const).map(([k, l]) => (
            <button key={k} onClick={() => { setFilterKanal(k as any); setHal(1) }} style={tombol(filterKanal === k)}>{l}</button>
          ))}
          <span style={{ width: 12 }} />
          <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</span>
          {([['semua', 'Semua'], ['belum', 'Belum ditandai'], ['sudah', 'Sudah']] as const).map(([k, l]) => (
            <button key={k} onClick={() => { setFilterStatus(k); setHal(1) }} style={tombol(filterStatus === k)}>{l}</button>
          ))}
          <button onClick={usulkan} disabled={sibuk || !belum} style={{ ...tombol(true), marginLeft: 'auto', background: sibuk || !belum ? '#94A3B8' : 'var(--c-primary)' }}>
            {sibuk ? '⏳ Memproses…' : '✨ Usulkan sifat dengan AI'}
          </button>
          {rows.some(r => !r.sifat && r.sifat_usulan) && (
            <button onClick={setujuiSemua} disabled={sibuk} style={{ ...tombol(true), background: sibuk ? '#94A3B8' : 'var(--c-success)' }}>
              ✓ Setujui semua usulan ({rows.filter(r => !r.sifat && r.sifat_usulan).length})
            </button>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginTop: 8, lineHeight: 1.6 }}>
          {angka(total)} konten terekam · <strong>{angka(belum)}</strong> belum ditandai.
          Usulan AI masuk sebagai saran — laporan hanya menghitung sifat yang sudah Anda setujui.
        </div>
      </div>

      {galat && <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #EF4444', marginBottom: 'var(--sp-4)' }}>{galat}</div>}
      {kabar && <div style={{ background: '#F0FDF4', color: '#15803D', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #22C55E', marginBottom: 'var(--sp-4)' }}>{kabar}</div>}

      {muat ? (
        <div style={{ color: 'var(--c-text-muted)', fontSize: 'var(--font-size-sm)' }}>Memuat…</div>
      ) : !rows.length ? (
        <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', padding: 'var(--sp-6)', color: 'var(--c-text-muted)', fontSize: 'var(--font-size-sm)', lineHeight: 1.7 }}>
          Belum ada konten yang cocok. Kalau tabelnya masih kosong, jalankan{' '}
          <strong>Tarik konten lama</strong> di Pengaturan → Integrasi Meta → Snapshot Kanal Publik —
          daftar konten bisa ditarik mundur, berbeda dari metrik harian.
        </div>
      ) : (
        <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
          {rows.map((r, i) => {
            const aktif  = cariSifat(r.sifat)
            const usulan = cariSifat(r.sifat_usulan)
            return (
              <div key={r.id} style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: i < rows.length - 1 ? '1px solid var(--c-border)' : 'none', display: 'flex', gap: 'var(--sp-4)', alignItems: 'flex-start' }}>
                {r.sampul
                  ? <img src={r.sampul} alt="" loading="lazy" referrerPolicy="no-referrer"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                      style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, flexShrink: 0, background: 'var(--c-bg)' }} />
                  : <div style={{ width: 56, height: 56, borderRadius: 6, background: 'var(--c-bg)', flexShrink: 0 }} />}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text)', lineHeight: 1.5 }}>
                    {r.permalink
                      ? <a href={r.permalink} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                          {r.teks || <em style={{ color: 'var(--c-text-muted)' }}>{r.jenis} tanpa keterangan</em>} ↗
                        </a>
                      : (r.teks || <em style={{ color: 'var(--c-text-muted)' }}>{r.jenis} tanpa keterangan</em>)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 3 }}>
                    {r.kanal === 'IG' ? 'Instagram' : 'Facebook'} · {r.jenis} · {String(r.tanggal).slice(0, 10)} ·{' '}
                    {angka(r.jangkauan)} jangkauan · {angka(r.interaksi)} interaksi
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                    {sifat.map(s => {
                      const dipilih = r.sifat === s.kode
                      const disaran = !r.sifat && r.sifat_usulan === s.kode
                      return (
                        <button key={s.kode} onClick={() => tandai(r.id, dipilih ? null : s.kode)} disabled={sibuk}
                          title={s.deskripsi ?? undefined}
                          style={{
                            padding: '4px 10px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
                            fontSize: 11, fontWeight: dipilih ? 800 : 600,
                            border: `1.5px ${disaran ? 'dashed' : 'solid'} ${dipilih || disaran ? s.warna : 'var(--c-border)'}`,
                            background: dipilih ? s.warna : 'white',
                            color: dipilih ? 'white' : disaran ? s.warna : 'var(--c-text-muted)',
                          }}>
                          {s.nama}{disaran ? ' ✨' : ''}
                        </button>
                      )
                    })}
                    {usulan && !r.sifat && (
                      <button onClick={() => tandai(r.id, usulan.kode)} disabled={sibuk} style={{ ...tombol(true), background: usulan.warna }}>
                        ✓ Setujui {usulan.nama}
                      </button>
                    )}
                  </div>
                </div>

                {aktif && (
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 5, background: aktif.warna, color: 'white', flexShrink: 0 }}>
                    {aktif.nama}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {totalHal > 1 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 'var(--sp-4)' }}>
          <button onClick={() => setHal(h => Math.max(1, h - 1))} disabled={hal <= 1} style={tombol(false)}>← Sebelumnya</button>
          <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>Halaman {hal} dari {totalHal}</span>
          <button onClick={() => setHal(h => Math.min(totalHal, h + 1))} disabled={hal >= totalHal} style={tombol(false)}>Berikutnya →</button>
        </div>
      )}
    </div>
  )
}
