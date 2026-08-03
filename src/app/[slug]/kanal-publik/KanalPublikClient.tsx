'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

/* ─── Tipe (cerminan bentuk dari src/lib/google-kanal.ts) ─── */
interface RingkasYouTube {
  channel: { id: string; nama: string; subscriber: number; video: number; totalTayangan: number } | null
  periode: { tayangan: number; menitDitonton: number; retensiPersen: number; subscriberBaru: number }
  harian:  { tanggal: string; tayangan: number; menitDitonton: number }[]
  teratas: { videoId: string; judul: string; tayangan: number; retensiPersen: number }[]
  galat?:  string
}
interface RingkasGa4 {
  propertyId: string | null
  periode: { sesi: number; pengguna: number; tayanganHalaman: number; rerataDetik: number }
  harian:  { tanggal: string; sesi: number; pengguna: number }[]
  sumber:  { nama: string; sesi: number }[]
  halaman: { path: string; tayangan: number }[]
  galat?:  string
}

type Tab = 'website' | 'youtube' | 'google-bisnis'
const RENTANG = [7, 28, 90] as const

const angka = (n: number) => n.toLocaleString('id-ID')

/* ─── Gaya bersama ─── */
const kartu: React.CSSProperties = {
  background: 'var(--c-surface)', border: '1px solid var(--c-border)',
  borderRadius: 'var(--r-lg)', overflow: 'hidden', marginBottom: 'var(--sp-5)',
}
const judulKartu: React.CSSProperties = {
  padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)',
  fontWeight: 700, fontSize: 'var(--font-size-md)', color: 'var(--c-primary)',
}

function Statistik({ items }: { items: { label: string; nilai: string; warna: string; catatan?: string }[] }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      borderBottom: '1px solid var(--c-border)',
    }}>
      {items.map((s, i) => (
        <div key={s.label} style={{
          padding: 'var(--sp-5)',
          borderRight: i < items.length - 1 ? '1px solid var(--c-border)' : 'none',
        }}>
          <div style={{
            fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--sp-1)',
          }}>{s.label}</div>
          <div style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, color: s.warna, lineHeight: 1.1 }}>
            {s.nilai}
          </div>
          {s.catatan && (
            <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 3 }}>{s.catatan}</div>
          )}
        </div>
      ))}
    </div>
  )
}

/** Grafik batang sederhana — cukup untuk melihat bentuk tren tanpa menambah pustaka chart. */
function TrenBatang({ data, label }: { data: { tanggal: string; nilai: number }[]; label: string }) {
  if (!data.length) return null
  const maks = Math.max(...data.map(d => d.nilai), 1)
  return (
    <div style={{ padding: 'var(--sp-5)' }}>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', fontWeight: 600, marginBottom: 'var(--sp-3)' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120 }}>
        {data.map(d => (
          <div key={d.tanggal} title={`${d.tanggal}: ${angka(d.nilai)}`} style={{
            flex: 1, minWidth: 2,
            height: `${Math.max(2, (d.nilai / maks) * 100)}%`,
            background: 'var(--c-secondary)', borderRadius: '2px 2px 0 0', opacity: 0.85,
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--c-text-faint)', marginTop: 6 }}>
        <span>{data[0]?.tanggal}</span>
        <span>puncak {angka(maks)}</span>
        <span>{data[data.length - 1]?.tanggal}</span>
      </div>
    </div>
  )
}

function Peringkat({ judul, baris }: { judul: string; baris: { kiri: string; kanan: string; sub?: string }[] }) {
  if (!baris.length) return null
  return (
    <div style={kartu}>
      <div style={judulKartu}>{judul}</div>
      <div>
        {baris.map((b, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
            padding: '10px var(--sp-5)',
            borderBottom: i < baris.length - 1 ? '1px solid var(--c-border)' : 'none',
          }}>
            <span style={{ fontSize: 11, color: 'var(--c-text-faint)', width: 18, flexShrink: 0 }}>{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {b.kiri}
              </div>
              {b.sub && <div style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>{b.sub}</div>}
            </div>
            <span style={{ fontWeight: 700, color: 'var(--c-primary)', fontSize: 'var(--font-size-sm)', flexShrink: 0 }}>
              {b.kanan}
            </span>
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
    <div style={{
      background: g.bg, color: g.warna, borderLeft: `3px solid ${g.garis}`,
      borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', marginBottom: 'var(--sp-5)',
      fontSize: 'var(--font-size-sm)', lineHeight: 1.7,
    }}>{children}</div>
  )
}

export default function KanalPublikClient({
  slug, status,
}: {
  slug: string
  status: { tersambung: boolean; akun: string | null; punyaGa4: boolean; punyaYoutube: boolean }
}) {
  const [tab,  setTab]  = useState<Tab>('website')
  const [hari, setHari] = useState<number>(28)
  const [yt,   setYt]   = useState<RingkasYouTube | null>(null)
  const [ga4,  setGa4]  = useState<RingkasGa4 | null>(null)
  const [muat, setMuat] = useState(false)
  const [galat, setGalat] = useState('')

  const ambil = useCallback(async (kanal: 'ga4' | 'youtube', n: number) => {
    setMuat(true); setGalat('')
    try {
      const res  = await fetch(`/api/${slug}/kanal-publik?kanal=${kanal}&hari=${n}`)
      const json = await res.json()
      if (!json.success) { setGalat(json.error || 'Gagal memuat data'); return }
      if (kanal === 'ga4') setGa4(json.data); else setYt(json.data)
    } catch {
      setGalat('Gagal menghubungi server')
    } finally {
      setMuat(false)
    }
  }, [slug])

  useEffect(() => {
    if (!status.tersambung) return
    if (tab === 'website') ambil('ga4', hari)
    if (tab === 'youtube') ambil('youtube', hari)
  }, [tab, hari, status.tersambung, ambil])

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1 }}>
      {/* Header */}
      <div style={{ marginBottom: 'var(--sp-5)' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
          Kanal Publik
        </h1>
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
          </Link>{' '}
          lalu klik <strong>Hubungkan dengan Google</strong>.
        </Pesan>
      ) : (
        <>
          {/* Tab + rentang */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 'var(--sp-4)', flexWrap: 'wrap',
            borderBottom: '1px solid var(--c-border)', marginBottom: 'var(--sp-5)',
          }}>
            <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
              {([
                { k: 'website',       label: 'Website (GA4)' },
                { k: 'youtube',       label: 'YouTube' },
                { k: 'google-bisnis', label: 'Google Bisnis' },
              ] as const).map(t => (
                <button key={t.k} onClick={() => setTab(t.k)} style={{
                  padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 'var(--font-size-sm)',
                  fontWeight: tab === t.k ? 700 : 500,
                  color: tab === t.k ? 'var(--c-secondary)' : 'var(--c-text-faint)',
                  borderBottom: tab === t.k ? '2px solid var(--c-secondary)' : '2px solid transparent',
                }}>
                  {t.label}
                </button>
              ))}
            </div>
            {tab !== 'google-bisnis' && (
              <div style={{ display: 'flex', gap: 6, paddingBottom: 6 }}>
                {RENTANG.map(n => (
                  <button key={n} onClick={() => setHari(n)} style={{
                    padding: '5px 12px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 12, fontWeight: 600,
                    border: `1.5px solid ${hari === n ? 'var(--c-secondary)' : 'var(--c-border)'}`,
                    background: hari === n ? 'var(--c-secondary)' : 'white',
                    color: hari === n ? 'white' : 'var(--c-text-muted)',
                  }}>{n} hari</button>
                ))}
              </div>
            )}
          </div>

          {galat && <Pesan nada="galat">⚠ {galat}</Pesan>}
          {muat && <div style={{ color: 'var(--c-text-muted)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--sp-4)' }}>Memuat data dari Google…</div>}

          {/* ── Website (GA4) ── */}
          {tab === 'website' && ga4 && (
            ga4.galat ? <Pesan nada="info">{ga4.galat}</Pesan> : (
              <>
                {ga4.periode.sesi === 0 && (
                  <Pesan nada="info">
                    Properti <code>{ga4.propertyId}</code> tidak mengembalikan data pada rentang ini. Kemungkinan
                    besar properti yang dipilih bukan properti website utama — periksa <strong>GA4 Property ID</strong>{' '}
                    di{' '}
                    <Link href={`/${slug}/pengaturan/google-bisnis`} style={{ color: 'var(--c-secondary)', fontWeight: 600 }}>
                      Pengaturan
                    </Link>.
                  </Pesan>
                )}
                <div style={kartu}>
                  <Statistik items={[
                    { label: 'Sesi',            nilai: angka(ga4.periode.sesi),            warna: 'var(--c-primary)' },
                    { label: 'Pengguna Aktif',  nilai: angka(ga4.periode.pengguna),        warna: 'var(--c-success)' },
                    { label: 'Tayangan Halaman', nilai: angka(ga4.periode.tayanganHalaman), warna: 'var(--c-secondary)' },
                    { label: 'Rerata Sesi',     nilai: `${ga4.periode.rerataDetik} dtk`,   warna: '#7C3AED' },
                  ]} />
                  <TrenBatang label={`Sesi per hari — ${hari} hari terakhir`}
                    data={ga4.harian.map(h => ({ tanggal: h.tanggal, nilai: h.sesi }))} />
                </div>
                <Peringkat judul="Sumber Trafik" baris={ga4.sumber.map(s => ({ kiri: s.nama, kanan: angka(s.sesi) + ' sesi' }))} />
                <Peringkat judul="Halaman Terpopuler" baris={ga4.halaman.map(h => ({ kiri: h.path, kanan: angka(h.tayangan) }))} />
              </>
            )
          )}

          {/* ── YouTube ── */}
          {tab === 'youtube' && yt && (
            yt.galat ? <Pesan nada="galat">{yt.galat}</Pesan> : (
              <>
                <div style={kartu}>
                  {yt.channel && (
                    <div style={{ ...judulKartu, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <span>{yt.channel.nama}</span>
                      <span style={{ fontWeight: 400, fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)' }}>
                        {angka(yt.channel.subscriber)} subscriber · {angka(yt.channel.video)} video ·{' '}
                        {angka(yt.channel.totalTayangan)} tayangan sepanjang masa
                      </span>
                    </div>
                  )}
                  <Statistik items={[
                    { label: 'Tayangan',       nilai: angka(yt.periode.tayangan),                warna: 'var(--c-primary)' },
                    { label: 'Menit Ditonton', nilai: angka(yt.periode.menitDitonton),           warna: 'var(--c-success)' },
                    { label: 'Retensi Rata²',  nilai: `${yt.periode.retensiPersen.toFixed(1)}%`, warna: '#7C3AED',
                      catatan: 'seberapa jauh penonton bertahan' },
                    { label: 'Subscriber Baru', nilai: angka(yt.periode.subscriberBaru),         warna: 'var(--c-secondary)' },
                  ]} />
                  <TrenBatang label={`Tayangan per hari — ${hari} hari terakhir`}
                    data={yt.harian.map(h => ({ tanggal: h.tanggal, nilai: h.tayangan }))} />
                </div>
                <Peringkat
                  judul="Video Teratas"
                  baris={yt.teratas.map(v => ({
                    kiri: v.judul,
                    sub:  `retensi ${v.retensiPersen.toFixed(1)}%`,
                    kanan: angka(v.tayangan),
                  }))}
                />
              </>
            )
          )}

          {/* ── Google Bisnis — masih menunggu persetujuan ── */}
          {tab === 'google-bisnis' && (
            <Pesan nada="info">
              <strong>Menunggu persetujuan Google.</strong> Akses Google Business Profile API diajukan lewat kasus
              dukungan dan masih ditinjau, sehingga kuota project masih 0 permintaan/menit. Status persisnya bisa
              dilihat kapan saja lewat tombol <strong>Jalankan Probe</strong> di{' '}
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
