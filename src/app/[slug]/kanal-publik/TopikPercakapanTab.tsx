'use client'

/**
 * Peninjauan topik percakapan.
 *
 * Sepadan dengan KontenTab untuk sifat konten: AI mengusulkan, manusia menetapkan.
 * Laporan hanya menghitung yang sudah ditetapkan — jadi selama tidak ada yang
 * ditinjau di sini, tabel topik di Laporan memang kosong, dan itu jujur.
 *
 * Cuplikan pesan ditampilkan karena tanpa itu peninjauan hanya jadi stempel.
 * Yang tampil hanya pesan MASUK pertama: cukup untuk menilai keperluan orang,
 * dan tidak menjadikan layar ini salinan kedua Inbox.
 */

import { useCallback, useEffect, useState } from 'react'

interface Topik { kode: string; nama: string; warna: string }

interface Baris {
  id: string
  kanal: string
  nama: string | null
  terakhirPada: string
  topik: string | null
  topikUsulan: string | null
  topikAlasan: string | null
  cuplikan: string
}

const WARNA_KANAL: Record<string, string> = { WA: '#25D366', IG: '#E1306C', FB: '#1877F2' }

const kartu: React.CSSProperties = {
  background: 'white', border: '1px solid var(--c-border)',
  borderRadius: 'var(--r-lg)', padding: 'var(--sp-5)', marginBottom: 'var(--sp-4)',
}

const tombol = (utama: boolean, sibuk: boolean): React.CSSProperties => ({
  padding: '8px 16px', borderRadius: 'var(--r-md)', fontFamily: 'inherit',
  fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: sibuk ? 'wait' : 'pointer',
  border: utama ? 'none' : '1.5px solid var(--c-border)',
  background: utama ? (sibuk ? '#94A3B8' : 'var(--c-secondary)') : 'white',
  color: utama ? 'white' : 'var(--c-text-muted)',
})

const tanggal = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

export default function TopikPercakapanTab({ slug }: { slug: string }) {
  const [topik, setTopik]   = useState<Topik[]>([])
  const [rows, setRows]     = useState<Baris[]>([])
  const [perlu, setPerlu]   = useState(0)
  const [saring, setSaring] = useState<'perlu' | 'selesai' | 'semua'>('perlu')
  const [muat, setMuat]     = useState(true)
  const [sibuk, setSibuk]   = useState('')
  const [galat, setGalat]   = useState('')
  const [kabar, setKabar]   = useState('')

  const ambil = useCallback(async () => {
    setMuat(true); setGalat('')
    try {
      const res  = await fetch(`/api/${slug}/kanal-publik/percakapan?saring=${saring}`)
      const json = await res.json()
      if (!json.success) { setGalat(json.error ?? 'Gagal memuat.'); return }
      setTopik(json.topik ?? []); setRows(json.data ?? []); setPerlu(json.jumlahPerlu ?? 0)
    } catch { setGalat('Gagal menghubungi server.') }
    finally { setMuat(false) }
  }, [slug, saring])

  useEffect(() => { ambil() }, [ambil])

  async function usulkan() {
    setSibuk('ai'); setGalat(''); setKabar('')
    try {
      const res  = await fetch(`/api/${slug}/kanal-publik/percakapan/usulan`, { method: 'POST' })
      const json = await res.json()
      if (!json.success) { setGalat(json.error ?? 'Gagal meminta usulan.'); return }
      setKabar(json.pesan ?? [
        `${json.diperiksa} percakapan diperiksa`,
        `${json.diusulkan} diusulkan`,
        // Dilaporkan apa adanya: kalau AI sering ragu, itu pertanda uraian topik
        // di Library perlu dipertajam — bukan sesuatu yang perlu disembunyikan.
        json.ragu ? `${json.ragu} dibiarkan kosong karena AI ragu` : '',
      ].filter(Boolean).join(', ') + '.')
      ambil()
    } catch { setGalat('Gagal menghubungi server.') }
    finally { setSibuk('') }
  }

  async function tetapkan(id: string, kode: string | null) {
    setSibuk(id); setGalat('')
    try {
      const res = await fetch(`/api/${slug}/kanal-publik/percakapan`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, topik: kode }),
      })
      const json = await res.json()
      if (!json.success) { setGalat(json.error ?? 'Gagal menyimpan.'); return }
      ambil()
    } catch { setGalat('Gagal menghubungi server.') }
    finally { setSibuk('') }
  }

  async function setujuiSemua() {
    if (!window.confirm(
      'Setujui semua usulan AI yang belum ditinjau?\n\n' +
      'Setelah ini angkanya masuk ke laporan triwulan. Lakukan hanya bila daftar ' +
      'di bawah sudah Anda baca.'
    )) return
    setSibuk('semua'); setGalat(''); setKabar('')
    try {
      const res  = await fetch(`/api/${slug}/kanal-publik/percakapan`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setujuiSemua: true }),
      })
      const json = await res.json()
      if (!json.success) { setGalat(json.error ?? 'Gagal menyetujui.'); return }
      setKabar(`${json.disetujui} percakapan ditetapkan topiknya.`)
      ambil()
    } catch { setGalat('Gagal menghubungi server.') }
    finally { setSibuk('') }
  }

  const namaTopik = (k: string | null) => topik.find(t => t.kode === k)?.nama ?? k ?? '—'
  const warnaTopik = (k: string | null) => topik.find(t => t.kode === k)?.warna ?? '#94A3B8'
  const adaUsulan = rows.some(r => !r.topik && r.topikUsulan)

  return (
    <div>
      <div style={kartu}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-primary)' }}>💬 Topik Percakapan</div>
            <p style={{ fontSize: 13, color: 'var(--c-text-muted)', margin: '4px 0 0', maxWidth: 680, lineHeight: 1.6 }}>
              Menjawab pertanyaan yang tidak bisa dijawab laporan mana pun: <strong>orang
              menghubungi RKZ untuk apa</strong>. AI membaca satu percakapan utuh lalu
              mengusulkan topiknya — <strong>usulan itu tidak masuk laporan sampai Anda tetapkan
              di sini</strong>. Daftar kategorinya bisa disunting di Library → Topik Percakapan.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
            <button onClick={usulkan} disabled={!!sibuk} style={tombol(true, sibuk === 'ai')}>
              {sibuk === 'ai' ? '⏳ Membaca…' : '✨ Minta usulan AI'}
            </button>
            {adaUsulan && (
              <button onClick={setujuiSemua} disabled={!!sibuk} style={tombol(false, sibuk === 'semua')}>
                {sibuk === 'semua' ? '⏳…' : '✓ Setujui semua usulan'}
              </button>
            )}
          </div>
        </div>

        {perlu > 0 && (
          <div style={{ marginTop: 'var(--sp-4)', background: '#FFFBEB', borderLeft: '3px solid #F59E0B', color: '#92400E', padding: 'var(--sp-3) var(--sp-4)', borderRadius: 'var(--r-md)', fontSize: 13, lineHeight: 1.6 }}>
              <strong>{perlu} percakapan belum ditetapkan topiknya.</strong> Selama belum,
              percakapan itu muncul sebagai “belum ditetapkan” di Laporan → Percakapan dan
              tidak masuk tabel topik.
          </div>
        )}

        {galat && <div style={{ marginTop: 'var(--sp-3)', background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #EF4444' }}>{galat}</div>}
        {kabar && <div style={{ marginTop: 'var(--sp-3)', background: '#F0FDF4', color: '#15803D', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #22C55E' }}>{kabar}</div>}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--sp-3)', flexWrap: 'wrap' }}>
        {([['perlu', 'Perlu ditinjau'], ['selesai', 'Sudah ditetapkan'], ['semua', 'Semua']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setSaring(k)} style={{
            padding: '6px 14px', borderRadius: 999, fontFamily: 'inherit', fontSize: 12,
            fontWeight: saring === k ? 700 : 500, cursor: 'pointer',
            border: `1.5px solid ${saring === k ? 'var(--c-secondary)' : 'var(--c-border)'}`,
            background: saring === k ? 'var(--c-secondary)' : 'white',
            color: saring === k ? 'white' : 'var(--c-text-muted)',
          }}>{label}</button>
        ))}
      </div>

      {muat ? (
        <div style={{ color: 'var(--c-text-muted)', fontSize: 'var(--font-size-sm)' }}>Memuat…</div>
      ) : !rows.length ? (
        <div style={{ ...kartu, color: 'var(--c-text-muted)', fontSize: 'var(--font-size-sm)' }}>
          {saring === 'perlu'
            ? 'Tidak ada yang perlu ditinjau.'
            : 'Belum ada percakapan pada saringan ini.'}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', overflow: 'hidden', background: 'white' }}>
          {rows.map((r, i) => (
            <div key={r.id} style={{
              padding: 'var(--sp-4)', display: 'grid', gap: 'var(--sp-2)',
              borderBottom: i < rows.length - 1 ? '1px solid var(--c-border)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: 'white', background: WARNA_KANAL[r.kanal] ?? '#64748B', padding: '2px 7px', borderRadius: 4 }}>{r.kanal}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>{r.nama || 'Tanpa nama'}</span>
                <span style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>{tanggal(r.terakhirPada)}</span>
                {r.topik && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'white', background: warnaTopik(r.topik), padding: '2px 8px', borderRadius: 4 }}>
                    {namaTopik(r.topik)}
                  </span>
                )}
              </div>

              <div style={{ fontSize: 13, color: 'var(--c-text-muted)', lineHeight: 1.6, fontStyle: 'italic' }}>
                “{r.cuplikan || '(tanpa teks)'}”
              </div>

              {!r.topik && r.topikUsulan && (
                <div style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
                  Usulan AI: <strong style={{ color: warnaTopik(r.topikUsulan) }}>{namaTopik(r.topikUsulan)}</strong>
                  {r.topikAlasan && <> — {r.topikAlasan}</>}
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {!r.topik && r.topikUsulan && (
                  <button onClick={() => tetapkan(r.id, r.topikUsulan)} disabled={!!sibuk}
                    style={{ padding: '5px 12px', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--c-primary)', color: 'white', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    ✓ Setuju
                  </button>
                )}
                <select
                  value={r.topik ?? ''}
                  onChange={e => tetapkan(r.id, e.target.value || null)}
                  disabled={!!sibuk}
                  style={{
                    padding: '5px 10px', borderRadius: 'var(--r-sm)', fontFamily: 'inherit',
                    fontSize: 12, border: '1.5px solid var(--c-border)', background: 'white',
                    color: 'var(--c-text)',
                  }}>
                  <option value="">{r.topik ? '— batalkan penetapan —' : 'Tetapkan topik…'}</option>
                  {topik.map(t => <option key={t.kode} value={t.kode}>{t.nama}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
