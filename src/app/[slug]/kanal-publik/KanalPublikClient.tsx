'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

/* ─── Tipe (cerminan bentuk dari src/lib/google-kanal.ts) ─── */
interface TotalYouTube { tayangan: number; menitDitonton: number; retensiPersen: number; subscriberNaik: number; subscriberTurun: number }
interface RingkasYouTube {
  channel: { id: string; nama: string; subscriber: number; video: number; totalTayangan: number } | null
  periode: TotalYouTube
  banding: TotalYouTube | null
  harian:  { tanggal: string; tayangan: number; menitDitonton: number }[]
  subscriberHarian: { tanggal: string; naik: number; turun: number; bersih: number }[]
  teratas: { videoId: string; judul: string; tayangan: number; retensiPersen: number }[]
  sumberTrafik: { nama: string; tayangan: number }[]
  demografi:    { kelompok: string; gender: string; persen: number }[]
  jenisKonten:  { jenis: string; tayangan: number }[]
  galat?: string
}
interface TotalGa4 { sesi: number; pengguna: number; tayanganHalaman: number; rerataDetik: number }
interface RingkasGa4 {
  propertyId: string | null
  periode: TotalGa4
  banding: TotalGa4 | null
  harian:  { tanggal: string; sesi: number; pengguna: number }[]
  sumber:  { nama: string; sesi: number }[]
  halaman: { path: string; tayangan: number }[]
  pendarat: { path: string; sesi: number }[]
  perangkat: { nama: string; sesi: number }[]
  kota:      { nama: string; sesi: number }[]
  baruKembali: { nama: string; pengguna: number }[]
  galat?: string
}

type Tab = 'website' | 'youtube' | 'google-bisnis'

/* ─── Bantuan tanggal ─── */
const iso = (d: Date) => d.toISOString().slice(0, 10)
const hariLalu = (n: number) => iso(new Date(Date.now() - n * 86_400_000))
const panjangHari = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1
function geser(tgl: string, hari: number) { return iso(new Date(Date.parse(tgl) + hari * 86_400_000)) }
function setahunLalu(tgl: string) {
  const d = new Date(Date.parse(tgl)); d.setFullYear(d.getFullYear() - 1); return iso(d)
}

const angka = (n: number) => Math.round(n).toLocaleString('id-ID')

/* ─── Gaya bersama ─── */
const kartu: React.CSSProperties = {
  background: 'var(--c-surface)', border: '1px solid var(--c-border)',
  borderRadius: 'var(--r-lg)', overflow: 'hidden', marginBottom: 'var(--sp-5)',
}
const judulKartu: React.CSSProperties = {
  padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)',
  fontWeight: 700, fontSize: 'var(--font-size-md)', color: 'var(--c-primary)',
}
const inputTgl: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--c-border)',
  fontSize: 12, fontFamily: 'inherit', outline: 'none', background: 'white', color: 'var(--c-text)',
}
const tombolKecil = (aktif: boolean): React.CSSProperties => ({
  padding: '5px 11px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 12, fontWeight: 600,
  border: `1.5px solid ${aktif ? 'var(--c-secondary)' : 'var(--c-border)'}`,
  background: aktif ? 'var(--c-secondary)' : 'white',
  color: aktif ? 'white' : 'var(--c-text-muted)',
})

/** Selisih terhadap pembanding — inti dari fitur perbandingan. */
function Delta({ kini, dulu, terbalik }: { kini: number; dulu: number | null | undefined; terbalik?: boolean }) {
  if (dulu === null || dulu === undefined) return null
  const beda = kini - dulu
  if (beda === 0) return <span style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>= sama</span>
  // `terbalik` untuk metrik yang naiknya justru buruk (mis. subscriber hilang).
  const baik = terbalik ? beda < 0 : beda > 0
  const persen = dulu === 0 ? null : Math.abs((beda / dulu) * 100)
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: baik ? '#15803D' : '#B91C1C' }}>
      {beda > 0 ? '▲' : '▼'} {angka(Math.abs(beda))}
      {persen !== null && ` (${persen.toFixed(persen < 10 ? 1 : 0)}%)`}
    </span>
  )
}

function Statistik({ items }: {
  items: { label: string; nilai: string; warna: string; catatan?: string; delta?: React.ReactNode }[]
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', borderBottom: '1px solid var(--c-border)' }}>
      {items.map((s, i) => (
        <div key={s.label} style={{ padding: 'var(--sp-5)', borderRight: i < items.length - 1 ? '1px solid var(--c-border)' : 'none' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--sp-1)' }}>
            {s.label}
          </div>
          <div style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, color: s.warna, lineHeight: 1.1 }}>{s.nilai}</div>
          {s.delta && <div style={{ marginTop: 3 }}>{s.delta}</div>}
          {s.catatan && <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 3 }}>{s.catatan}</div>}
        </div>
      ))}
    </div>
  )
}

function TrenBatang({ data, label }: { data: { tanggal: string; nilai: number }[]; label: string }) {
  if (!data.length) return null
  const maks = Math.max(...data.map(d => d.nilai), 1)
  return (
    <div style={{ padding: 'var(--sp-5)' }}>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', fontWeight: 600, marginBottom: 'var(--sp-3)' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120 }}>
        {data.map(d => (
          <div key={d.tanggal} title={`${d.tanggal}: ${angka(d.nilai)}`} style={{
            flex: 1, minWidth: 2, height: `${Math.max(2, (d.nilai / maks) * 100)}%`,
            background: 'var(--c-secondary)', borderRadius: '2px 2px 0 0', opacity: 0.85,
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--c-text-faint)', marginTop: 6 }}>
        <span>{data[0]?.tanggal}</span><span>puncak {angka(maks)}</span><span>{data[data.length - 1]?.tanggal}</span>
      </div>
    </div>
  )
}

/**
 * Perjalanan subscriber: batang ke ATAS = bertambah, ke BAWAH = berhenti
 * berlangganan. Keduanya angka EKSAK dari API — berbeda dengan garis kumulatif
 * di bawahnya yang direkonstruksi.
 */
function PerjalananSubscriber({ data, totalSekarang }: {
  data: { tanggal: string; naik: number; turun: number; bersih: number }[]
  totalSekarang: number
}) {
  if (!data.length) return null
  const maks = Math.max(...data.map(d => Math.max(d.naik, d.turun)), 1)
  const totalNaik  = data.reduce((s, d) => s + d.naik, 0)
  const totalTurun = data.reduce((s, d) => s + d.turun, 0)
  const bersih     = totalNaik - totalTurun

  // Rekonstruksi mundur: API tidak menyediakan jumlah absolut per hari di masa lalu.
  const awal = totalSekarang - bersih
  let jalan = awal
  const kumulatif = data.map(d => { jalan += d.bersih; return { tanggal: d.tanggal, nilai: jalan } })
  const kMin = Math.min(...kumulatif.map(k => k.nilai)), kMaks = Math.max(...kumulatif.map(k => k.nilai))

  return (
    <div style={kartu}>
      <div style={judulKartu}>Perjalanan Subscriber</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', borderBottom: '1px solid var(--c-border)' }}>
        {[
          { l: 'Bertambah', v: `+${angka(totalNaik)}`,  c: '#15803D' },
          { l: 'Berhenti',  v: `−${angka(totalTurun)}`, c: '#B91C1C' },
          { l: 'Bersih',    v: `${bersih >= 0 ? '+' : '−'}${angka(Math.abs(bersih))}`, c: bersih >= 0 ? '#15803D' : '#B91C1C' },
          { l: 'Total kini', v: angka(totalSekarang), c: 'var(--c-primary)' },
        ].map((s, i) => (
          <div key={s.l} style={{ padding: 'var(--sp-4) var(--sp-5)', borderRight: i < 3 ? '1px solid var(--c-border)' : 'none' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.l}</div>
            <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: s.c, lineHeight: 1.2 }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Batang dua arah */}
      <div style={{ padding: 'var(--sp-5)' }}>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', fontWeight: 600, marginBottom: 'var(--sp-3)' }}>
          Naik &amp; turun per hari — angka eksak dari YouTube
        </div>
        <div style={{ display: 'flex', gap: 2, height: 140 }}>
          {data.map(d => (
            <div key={d.tanggal} title={`${d.tanggal} · +${d.naik} / −${d.turun} · bersih ${d.bersih}`}
              style={{ flex: 1, minWidth: 2, display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                <div style={{ width: '100%', height: `${(d.naik / maks) * 100}%`, background: '#22C55E', borderRadius: '2px 2px 0 0' }} />
              </div>
              <div style={{ height: 1, background: 'var(--c-border)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ width: '100%', height: `${(d.turun / maks) * 100}%`, background: '#EF4444', borderRadius: '0 0 2px 2px' }} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--c-text-faint)', marginTop: 6 }}>
          <span>{data[0]?.tanggal}</span>
          <span>puncak harian {angka(maks)}</span>
          <span>{data[data.length - 1]?.tanggal}</span>
        </div>
      </div>

      {/* Kurva kumulatif — rekonstruksi */}
      <div style={{ padding: '0 var(--sp-5) var(--sp-5)' }}>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>
          Perkiraan total subscriber dari waktu ke waktu
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 70 }}>
          {kumulatif.map(k => (
            <div key={k.tanggal} title={`${k.tanggal}: ±${angka(k.nilai)}`} style={{
              flex: 1, minWidth: 1,
              height: `${kMaks === kMin ? 100 : 10 + ((k.nilai - kMin) / (kMaks - kMin)) * 90}%`,
              background: 'var(--c-primary)', opacity: 0.5, borderRadius: '1px 1px 0 0',
            }} />
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 8, lineHeight: 1.6 }}>
          <strong>Ini rekonstruksi, bukan angka historis asli.</strong> YouTube hanya menyediakan jumlah yang
          bertambah dan berhenti per hari, bukan total subscriber pada tanggal lampau. Kurva ini dihitung mundur
          dari total hari ini ({angka(totalSekarang)}), jadi bentuk trennya dapat dipercaya sedangkan angka
          harian mutlaknya adalah perkiraan.
        </p>
      </div>
    </div>
  )
}

function Peringkat({ judul, baris, catatan }: {
  judul: string; catatan?: string
  baris: { kiri: string; kanan: string; sub?: string }[]
}) {
  if (!baris.length) return null
  return (
    <div style={kartu}>
      <div style={judulKartu}>{judul}</div>
      {catatan && (
        <div style={{ padding: '10px var(--sp-5)', fontSize: 11, color: 'var(--c-text-muted)', borderBottom: '1px solid var(--c-border)', lineHeight: 1.6 }}>
          {catatan}
        </div>
      )}
      <div>
        {baris.map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: '10px var(--sp-5)', borderBottom: i < baris.length - 1 ? '1px solid var(--c-border)' : 'none' }}>
            <span style={{ fontSize: 11, color: 'var(--c-text-faint)', width: 18, flexShrink: 0 }}>{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.kiri}</div>
              {b.sub && <div style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>{b.sub}</div>}
            </div>
            <span style={{ fontWeight: 700, color: 'var(--c-primary)', fontSize: 'var(--font-size-sm)', flexShrink: 0 }}>{b.kanan}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Pesan({ nada, children }: { nada: 'info' | 'galat'; children: React.ReactNode }) {
  const g = nada === 'galat'
    ? { bg: '#FEF2F2', warna: '#B91C1C', garis: '#EF4444' }
    : { bg: '#FFFBEB', warna: '#92400E', garis: '#F59E0B' }
  return (
    <div style={{ background: g.bg, color: g.warna, borderLeft: `3px solid ${g.garis}`, borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', marginBottom: 'var(--sp-5)', fontSize: 'var(--font-size-sm)', lineHeight: 1.7 }}>
      {children}
    </div>
  )
}

export default function KanalPublikClient({
  slug, status,
}: {
  slug: string
  status: { tersambung: boolean; akun: string | null; punyaGa4: boolean; punyaYoutube: boolean }
}) {
  const [tab, setTab] = useState<Tab>('website')

  // Periode utama — bawaan 30 hari terakhir (berakhir kemarin; data hari ini belum lengkap).
  const [mulai,   setMulai]   = useState(hariLalu(30))
  const [selesai, setSelesai] = useState(hariLalu(1))
  const [pakaiBanding, setPakaiBanding] = useState(false)
  const [bMulai,   setBMulai]   = useState(hariLalu(60))
  const [bSelesai, setBSelesai] = useState(hariLalu(31))

  const [yt,  setYt]  = useState<RingkasYouTube | null>(null)
  const [ga4, setGa4] = useState<RingkasGa4 | null>(null)
  const [muat, setMuat] = useState(false)
  const [galat, setGalat] = useState('')

  const panjangUtama  = panjangHari(mulai, selesai)
  const panjangBandin = panjangHari(bMulai, bSelesai)
  const panjangBeda   = pakaiBanding && panjangUtama !== panjangBandin

  function pilihPreset(hari: number) {
    setMulai(hariLalu(hari)); setSelesai(hariLalu(1))
    // Pembanding ikut menyesuaikan supaya panjangnya tetap sama.
    setBMulai(hariLalu(hari * 2)); setBSelesai(hariLalu(hari + 1))
  }
  function bandingSebelumnya() {
    setBSelesai(geser(mulai, -1)); setBMulai(geser(mulai, -panjangUtama))
  }
  function bandingTahunLalu() {
    setBMulai(setahunLalu(mulai)); setBSelesai(setahunLalu(selesai))
  }

  const ambil = useCallback(async (kanal: 'ga4' | 'youtube') => {
    setMuat(true); setGalat('')
    try {
      const q = new URLSearchParams({ kanal, mulai, selesai })
      if (pakaiBanding) { q.set('bandingMulai', bMulai); q.set('bandingSelesai', bSelesai) }
      const res  = await fetch(`/api/${slug}/kanal-publik?${q.toString()}`)
      const json = await res.json()
      if (!json.success) { setGalat(json.error || 'Gagal memuat data'); return }
      if (kanal === 'ga4') setGa4(json.data); else setYt(json.data)
    } catch {
      setGalat('Gagal menghubungi server')
    } finally { setMuat(false) }
  }, [slug, mulai, selesai, pakaiBanding, bMulai, bSelesai])

  useEffect(() => {
    if (!status.tersambung) return
    if (tab === 'website') ambil('ga4')
    if (tab === 'youtube') ambil('youtube')
  }, [tab, status.tersambung, ambil])

  const labelBanding = pakaiBanding ? `${bMulai} → ${bSelesai}` : null

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1 }}>
      <div style={{ marginBottom: 'var(--sp-5)' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>Kanal Publik</h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', maxWidth: '70ch' }}>
          Performa kanal yang menjangkau <strong>audiens anonim</strong> — website, YouTube, dan profil Google.
          Berbeda dari menu lain yang seluruhnya tentang pasien yang sudah dikenal, di sini yang diukur adalah
          konten dan jangkauannya, bukan orangnya.
        </p>
      </div>

      {!status.tersambung ? (
        <Pesan nada="info">
          Belum tersambung ke Google. Buka{' '}
          <Link href={`/${slug}/pengaturan/google-bisnis`} style={{ color: 'var(--c-secondary)', fontWeight: 600 }}>
            Pengaturan → Integrasi Google Business
          </Link>{' '}lalu klik <strong>Hubungkan dengan Google</strong>.
        </Pesan>
      ) : (
        <>
          {/* Tab */}
          <div style={{ display: 'flex', gap: 'var(--sp-1)', borderBottom: '1px solid var(--c-border)', marginBottom: 'var(--sp-4)' }}>
            {([
              { k: 'website', label: 'Website (GA4)' },
              { k: 'youtube', label: 'YouTube' },
              { k: 'google-bisnis', label: 'Google Bisnis' },
            ] as const).map(t => (
              <button key={t.k} onClick={() => setTab(t.k)} style={{
                padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 'var(--font-size-sm)', fontWeight: tab === t.k ? 700 : 500,
                color: tab === t.k ? 'var(--c-secondary)' : 'var(--c-text-faint)',
                borderBottom: tab === t.k ? '2px solid var(--c-secondary)' : '2px solid transparent',
              }}>{t.label}</button>
            ))}
          </div>

          {/* Penyaring periode */}
          {tab !== 'google-bisnis' && (
            <div style={{ ...kartu, padding: 'var(--sp-4) var(--sp-5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--c-text)', textTransform: 'uppercase', letterSpacing: '0.5px', minWidth: 70 }}>Periode</span>
                <input type="date" value={mulai} max={selesai} onChange={e => setMulai(e.target.value)} style={inputTgl} />
                <span style={{ color: 'var(--c-text-faint)' }}>→</span>
                <input type="date" value={selesai} min={mulai} max={hariLalu(0)} onChange={e => setSelesai(e.target.value)} style={inputTgl} />
                <span style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>{panjangUtama} hari</span>
                <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                  {[7, 30, 90].map(n => (
                    <button key={n} onClick={() => pilihPreset(n)} style={tombolKecil(panjangUtama === n && selesai === hariLalu(1))}>
                      {n} hari
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap', marginTop: 'var(--sp-3)', paddingTop: 'var(--sp-3)', borderTop: '1px solid var(--c-border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minWidth: 70 }}>
                  <input type="checkbox" checked={pakaiBanding} onChange={e => setPakaiBanding(e.target.checked)} style={{ width: 15, height: 15, cursor: 'pointer' }} />
                  <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--c-text)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Banding</span>
                </label>
                {pakaiBanding && (
                  <>
                    <input type="date" value={bMulai} max={bSelesai} onChange={e => setBMulai(e.target.value)} style={inputTgl} />
                    <span style={{ color: 'var(--c-text-faint)' }}>→</span>
                    <input type="date" value={bSelesai} min={bMulai} onChange={e => setBSelesai(e.target.value)} style={inputTgl} />
                    <span style={{ fontSize: 11, color: panjangBeda ? '#B91C1C' : 'var(--c-text-faint)', fontWeight: panjangBeda ? 700 : 400 }}>
                      {panjangBandin} hari
                    </span>
                    <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                      <button onClick={bandingSebelumnya} style={tombolKecil(false)}>Periode sebelumnya</button>
                      <button onClick={bandingTahunLalu}  style={tombolKecil(false)}>Tahun lalu</button>
                    </div>
                  </>
                )}
              </div>

              {panjangBeda && (
                <div style={{ marginTop: 'var(--sp-3)', fontSize: 11, color: '#B91C1C', lineHeight: 1.6 }}>
                  ⚠ Panjang periode berbeda ({panjangUtama} vs {panjangBandin} hari). Selisihnya akan terlihat
                  dramatis padahal sebagian besar hanya karena rentangnya tidak sama panjang. Klik
                  <strong> Periode sebelumnya</strong> untuk menyamakan.
                </div>
              )}
            </div>
          )}

          {galat && <Pesan nada="galat">⚠ {galat}</Pesan>}
          {muat && <div style={{ color: 'var(--c-text-muted)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--sp-4)' }}>Memuat data dari Google…</div>}

          {/* ── Website (GA4) ── */}
          {tab === 'website' && ga4 && (ga4.galat ? <Pesan nada="info">{ga4.galat}</Pesan> : (
            <>
              {ga4.periode.sesi === 0 && (
                <Pesan nada="info">
                  Properti <code>{ga4.propertyId}</code> tidak mengembalikan data pada rentang ini. Periksa{' '}
                  <strong>GA4 Property ID</strong> di{' '}
                  <Link href={`/${slug}/pengaturan/google-bisnis`} style={{ color: 'var(--c-secondary)', fontWeight: 600 }}>Pengaturan</Link>.
                </Pesan>
              )}
              <div style={kartu}>
                <Statistik items={[
                  { label: 'Sesi', nilai: angka(ga4.periode.sesi), warna: 'var(--c-primary)', delta: <Delta kini={ga4.periode.sesi} dulu={ga4.banding?.sesi} /> },
                  { label: 'Pengguna Aktif', nilai: angka(ga4.periode.pengguna), warna: 'var(--c-success)', delta: <Delta kini={ga4.periode.pengguna} dulu={ga4.banding?.pengguna} /> },
                  { label: 'Tayangan Halaman', nilai: angka(ga4.periode.tayanganHalaman), warna: 'var(--c-secondary)', delta: <Delta kini={ga4.periode.tayanganHalaman} dulu={ga4.banding?.tayanganHalaman} /> },
                  { label: 'Rerata Sesi', nilai: `${ga4.periode.rerataDetik} dtk`, warna: '#7C3AED', delta: <Delta kini={ga4.periode.rerataDetik} dulu={ga4.banding?.rerataDetik} /> },
                ]} />
                {labelBanding && (
                  <div style={{ padding: '8px var(--sp-5)', fontSize: 11, color: 'var(--c-text-muted)', borderBottom: '1px solid var(--c-border)' }}>
                    Dibandingkan dengan {labelBanding}
                  </div>
                )}
                <TrenBatang label={`Sesi per hari — ${mulai} s/d ${selesai}`} data={ga4.harian.map(h => ({ tanggal: h.tanggal, nilai: h.sesi }))} />
              </div>
              <Peringkat judul="Sumber Trafik" baris={ga4.sumber.map(s => ({ kiri: s.nama, kanan: angka(s.sesi) + ' sesi' }))} />
              <Peringkat judul="Halaman Pendarat" catatan="Halaman pertama yang dibuka pengunjung — berbeda dari halaman terpopuler, dan inilah yang menentukan kesan pertama."
                baris={ga4.pendarat.map(h => ({ kiri: h.path, kanan: angka(h.sesi) + ' sesi' }))} />
              <Peringkat judul="Halaman Terpopuler" baris={ga4.halaman.map(h => ({ kiri: h.path, kanan: angka(h.tayangan) }))} />
              <Peringkat judul="Kota Pengunjung" catatan="Memetakan jangkauan nyata RKZ — berguna untuk memutuskan wilayah yang layak digarap."
                baris={ga4.kota.map(k => ({ kiri: k.nama, kanan: angka(k.sesi) + ' sesi' }))} />
              <Peringkat judul="Perangkat" baris={ga4.perangkat.map(p => ({ kiri: p.nama, kanan: angka(p.sesi) + ' sesi' }))} />
              <Peringkat judul="Pengunjung Baru vs Kembali" baris={ga4.baruKembali.map(b => ({ kiri: b.nama, kanan: angka(b.pengguna) }))} />
            </>
          ))}

          {/* ── YouTube ── */}
          {tab === 'youtube' && yt && (yt.galat ? <Pesan nada="galat">{yt.galat}</Pesan> : (
            <>
              <div style={kartu}>
                {yt.channel && (
                  <div style={{ ...judulKartu, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <span>{yt.channel.nama}</span>
                    <span style={{ fontWeight: 400, fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)' }}>
                      {angka(yt.channel.subscriber)} subscriber · {angka(yt.channel.video)} video · {angka(yt.channel.totalTayangan)} tayangan sepanjang masa
                    </span>
                  </div>
                )}
                <Statistik items={[
                  { label: 'Tayangan', nilai: angka(yt.periode.tayangan), warna: 'var(--c-primary)', delta: <Delta kini={yt.periode.tayangan} dulu={yt.banding?.tayangan} /> },
                  { label: 'Menit Ditonton', nilai: angka(yt.periode.menitDitonton), warna: 'var(--c-success)', delta: <Delta kini={yt.periode.menitDitonton} dulu={yt.banding?.menitDitonton} /> },
                  { label: 'Rata² Ditonton', nilai: `${yt.periode.retensiPersen.toFixed(1)}%`, warna: '#7C3AED',
                    delta: <Delta kini={yt.periode.retensiPersen} dulu={yt.banding?.retensiPersen} />,
                    catatan: 'bisa >100% bila ditonton berulang' },
                  { label: 'Subscriber Baru', nilai: angka(yt.periode.subscriberNaik), warna: 'var(--c-secondary)', delta: <Delta kini={yt.periode.subscriberNaik} dulu={yt.banding?.subscriberNaik} /> },
                ]} />
                {labelBanding && (
                  <div style={{ padding: '8px var(--sp-5)', fontSize: 11, color: 'var(--c-text-muted)', borderBottom: '1px solid var(--c-border)' }}>
                    Dibandingkan dengan {labelBanding}
                  </div>
                )}
                <TrenBatang label={`Tayangan per hari — ${mulai} s/d ${selesai}`} data={yt.harian.map(h => ({ tanggal: h.tanggal, nilai: h.tayangan }))} />
              </div>

              <PerjalananSubscriber data={yt.subscriberHarian} totalSekarang={yt.channel?.subscriber ?? 0} />

              <Peringkat judul="Video Teratas" catatan="Retensi disertakan karena “ramai” bisa datang dari judul yang memancing, sedangkan orang bertahan menonton tidak bisa dipalsukan."
                baris={yt.teratas.map(v => ({ kiri: v.judul, sub: `rata² ditonton ${v.retensiPersen.toFixed(1)}%`, kanan: angka(v.tayangan) }))} />
              <Peringkat judul="Bagaimana Penonton Menemukan Video" baris={yt.sumberTrafik.map(s => ({ kiri: s.nama, kanan: angka(s.tayangan) }))} />
              <Peringkat judul="Jenis Konten" catatan="Shorts dan video biasa berperilaku sangat berbeda — menggabungkannya membuat angka retensi menyesatkan."
                baris={yt.jenisKonten.map(j => ({ kiri: j.jenis, kanan: angka(j.tayangan) }))} />
              <Peringkat judul="Demografi Penonton"
                baris={yt.demografi.slice(0, 10).map(d => ({ kiri: `${d.kelompok} · ${d.gender === 'female' ? 'Perempuan' : d.gender === 'male' ? 'Laki-laki' : d.gender}`, kanan: `${d.persen.toFixed(1)}%` }))} />
            </>
          ))}

          {/* ── Google Bisnis ── */}
          {tab === 'google-bisnis' && (
            <Pesan nada="info">
              <strong>Menunggu persetujuan Google.</strong> Akses Google Business Profile API masih ditinjau,
              sehingga kuota project masih 0 permintaan/menit. Status persisnya bisa dilihat lewat tombol{' '}
              <strong>Jalankan Probe</strong> di{' '}
              <Link href={`/${slug}/pengaturan/google-bisnis`} style={{ color: 'var(--c-secondary)', fontWeight: 600 }}>
                Pengaturan → Integrasi Google Business
              </Link>. Begitu disetujui, tab ini diisi performa lokasi, status listing, dan ulasan pasien.
            </Pesan>
          )}
        </>
      )}
    </div>
  )
}
