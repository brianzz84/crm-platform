'use client'

import { useCallback, useEffect, useState } from 'react'

interface BarisIklan {
  source_id: string | null
  headline: string | null
  percakapan: number
  teridentifikasi: number
  orang: number
  konversi: number
  kunjungan: number
  poliTeratas: { nama: string; jumlah: number }[]
}

interface Laporan {
  mulai: string
  selesai: string
  jendelaHari: number
  totalPercakapan: number
  tanpaPerson: number
  totalOrang: number
  totalKonversi: number
  totalKunjungan: number
  perIklan: BarisIklan[]
  catatan: string[]
}

const hariLalu = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

export default function IklanClient({ slug }: { slug: string }) {
  const [mulai, setMulai]     = useState(hariLalu(90))
  const [selesai, setSelesai] = useState(hariLalu(0))
  const [jendela, setJendela] = useState(30)
  const [data, setData]       = useState<Laporan | null>(null)
  const [sibuk, setSibuk]     = useState(false)
  const [galat, setGalat]     = useState('')

  const muat = useCallback(async () => {
    setSibuk(true); setGalat('')
    try {
      const q = new URLSearchParams({ mulai, selesai, jendela: String(jendela) })
      const res  = await fetch(`/api/${slug}/iklan?${q}`)
      const json = await res.json()
      if (json.success) setData(json.data)
      else setGalat(json.error || 'Gagal memuat laporan')
    } catch { setGalat('Gagal menghubungi server') }
    finally { setSibuk(false) }
  }, [slug, mulai, selesai, jendela])

  useEffect(() => { muat() }, [muat])

  const kartu: React.CSSProperties = {
    background: 'white', border: '1px solid var(--c-border)',
    borderRadius: 'var(--r-lg)', padding: 'var(--sp-5)',
  }
  const th: React.CSSProperties = {
    textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 800,
    color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px',
    borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = {
    padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--c-border)',
    verticalAlign: 'top',
  }

  const ringkas = data ? [
    { l: 'Percakapan dari iklan', v: data.totalPercakapan },
    { l: 'Orang teridentifikasi', v: data.totalOrang },
    { l: 'Orang yang berkunjung', v: data.totalKonversi },
    { l: 'Total kunjungan',       v: data.totalKunjungan },
  ] : []

  return (
    <div style={{ padding: 'var(--sp-6)', maxWidth: 1200 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--c-primary)', margin: 0 }}>Iklan</h1>
      <p style={{ fontSize: 13, color: 'var(--c-text-muted)', margin: '6px 0 0', maxWidth: 720, lineHeight: 1.7 }}>
        Menelusuri iklan Click-to-WhatsApp sampai ke kunjungan yang benar-benar terjadi.
        Rantainya: iklan diklik &rarr; percakapan masuk &rarr; nomornya cocok dengan data
        pasien &rarr; kunjungan tercatat di SIMRS. Angka di sini <strong>tidak dikirim ke Meta</strong>.
      </p>

      <div style={{ ...kartu, marginTop: 'var(--sp-5)', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ fontSize: 12, color: 'var(--c-text-muted)', fontWeight: 700 }}>
          Iklan diklik antara<br />
          <input type="date" value={mulai} onChange={e => setMulai(e.target.value)}
            style={{ marginTop: 4, padding: '6px 10px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--c-border)', fontFamily: 'inherit', fontSize: 13 }} />
        </label>
        <label style={{ fontSize: 12, color: 'var(--c-text-muted)', fontWeight: 700 }}>
          sampai<br />
          <input type="date" value={selesai} onChange={e => setSelesai(e.target.value)}
            style={{ marginTop: 4, padding: '6px 10px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--c-border)', fontFamily: 'inherit', fontSize: 13 }} />
        </label>
        <label style={{ fontSize: 12, color: 'var(--c-text-muted)', fontWeight: 700 }}>
          Jendela atribusi<br />
          <select value={jendela} onChange={e => setJendela(Number(e.target.value))}
            style={{ marginTop: 4, padding: '6px 10px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--c-border)', fontFamily: 'inherit', fontSize: 13 }}>
            {[7, 14, 30, 60, 90].map(n => <option key={n} value={n}>{n} hari</option>)}
          </select>
        </label>
        <div style={{ fontSize: 11, color: 'var(--c-text-faint)', maxWidth: 260, lineHeight: 1.5 }}>
          Keputusan berobat lambat. Jendela 7 hari ala e-commerce biasanya melaporkan terlalu sedikit.
        </div>
      </div>

      {galat && (
        <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #EF4444', marginTop: 14 }}>{galat}</div>
      )}

      {sibuk && !data && (
        <p style={{ fontSize: 13, color: 'var(--c-text-muted)', marginTop: 16 }}>Memuat…</p>
      )}

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 1, background: 'var(--c-border)', border: '1px solid var(--c-border)', borderRadius: 8, overflow: 'hidden', marginTop: 'var(--sp-5)' }}>
            {ringkas.map(s => (
              <div key={s.l} style={{ background: 'white', padding: '12px 16px' }}>
                <div style={{ fontSize: 10, color: 'var(--c-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.l}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-primary)' }}>{s.v.toLocaleString('id-ID')}</div>
              </div>
            ))}
          </div>

          <div style={{ ...kartu, marginTop: 'var(--sp-5)', padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={th}>Iklan</th>
                  <th style={th}>Percakapan</th>
                  <th style={th}>Tertaut pasien</th>
                  <th style={th}>Orang</th>
                  <th style={th}>Berkunjung</th>
                  <th style={th}>Kunjungan</th>
                  <th style={th}>Poli terbanyak</th>
                </tr>
              </thead>
              <tbody>
                {data.perIklan.length === 0 && (
                  <tr><td style={{ ...td, color: 'var(--c-text-muted)' }} colSpan={7}>
                    Belum ada jejak iklan pada rentang ini.
                  </td></tr>
                )}
                {data.perIklan.map(b => (
                  <tr key={b.source_id ?? 'tanpa-id'}>
                    <td style={td}>
                      <div style={{ fontWeight: 700, color: 'var(--c-primary)' }}>
                        {b.headline || '(tanpa judul)'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--c-text-faint)', fontFamily: 'monospace' }}>
                        {b.source_id ?? 'tanpa id iklan'}
                      </div>
                    </td>
                    <td style={td}>{b.percakapan}</td>
                    <td style={td}>
                      {b.teridentifikasi}
                      {b.percakapan > b.teridentifikasi && (
                        <span style={{ color: '#B45309', fontSize: 11 }}>
                          {' '}(&minus;{b.percakapan - b.teridentifikasi})
                        </span>
                      )}
                    </td>
                    <td style={td}>{b.orang}</td>
                    <td style={{ ...td, fontWeight: 800, color: b.konversi ? '#16A34A' : 'var(--c-text-muted)' }}>
                      {b.konversi}
                    </td>
                    <td style={td}>{b.kunjungan}</td>
                    <td style={{ ...td, fontSize: 12, color: 'var(--c-text-muted)' }}>
                      {b.poliTeratas.length
                        ? b.poliTeratas.map(p => `${p.nama} (${p.jumlah})`).join(', ')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Catatan sengaja ditaruh SETELAH angka dan tidak bisa ditutup. Batas
              sebuah pengukuran adalah bagian dari pengukuran itu — laporan yang
              menyembunyikannya membuat orang mengambil keputusan dari angka yang
              mereka kira lebih pasti daripada sebenarnya. */}
          <div style={{ ...kartu, marginTop: 'var(--sp-5)', background: '#F8FAFC' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Yang perlu diketahui tentang angka ini
            </div>
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--c-text-muted)', lineHeight: 1.75 }}>
              {data.catatan.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
