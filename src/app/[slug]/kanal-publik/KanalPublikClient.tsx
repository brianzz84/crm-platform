'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import KontenTab from './KontenTab'

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

/* ─── Tipe Meta (cerminan bentuk dari src/lib/meta-kanal.ts) ─── */
interface TotalIg { jangkauan: number; tayangan: number; interaksi: number; akunTerlibat: number; suka: number; disimpan: number; followerBaru: number }
interface KontenIg {
  id: string; jenis: string; tanggal: string; permalink: string; teks: string; gambar: string
  tayangan: number
  jangkauan: number; suka: number; komentar: number; dibagikan: number
  disimpan: number; interaksi: number; rasioInteraksi: number
}
interface RingkasInstagram {
  akun: { id: string; username: string; follower: number; media: number; nama: string } | null
  periode: TotalIg
  banding: TotalIg | null
  bandingSeriKosong: boolean
  harian: { tanggal: string; jangkauan: number }[]
  bandingHarian: { tanggal: string; jangkauan: number }[]
  followerHarian: { tanggal: string; naik: number }[]
  semuaKonten: KontenIg[]
  rincianHarian: { tanggal: string; perJenis: Record<string, number>; perFollow: Record<string, number> }[]
  teratas: KontenIg[]
  engagementTeratas: KontenIg[]
  jenisKonten: { jenis: string; jumlah: number; jangkauan: number; rasioInteraksi: number }[]
  hariFollower: { tanggal: string; naik: number; konten: string[] }[]
  catatanUnik: string | null
  galat?: string
}
interface TotalFb { interaksi: number; followerBaru: number; kunjunganProfil: number; tayanganVideo: number; totalAksi: number }
interface RingkasFacebook {
  page: { id: string; nama: string; follower: number } | null
  periode: TotalFb
  banding: TotalFb | null
  bandingSeriKosong: boolean
  harian: { tanggal: string; interaksi: number }[]
  bandingHarian: { tanggal: string; interaksi: number }[]
  followerHarian: { tanggal: string; naik: number }[]
  semuaKonten: { id: string; jenis: string; tanggal: string; permalink: string; teks: string; gambar: string; jangkauan: number; interaksi: number }[]
  teratas: { id: string; tanggal: string; permalink: string; teks: string; gambar: string; reaksi: number; komentar: number; dibagikan: number; klik: number }[]
  komentarTersedia: boolean
  galatPostingan?: string
  galat?: string
}

type Tab = 'website' | 'instagram' | 'facebook' | 'youtube' | 'google-bisnis' | 'konten'
type Kanal = 'ga4' | 'youtube' | 'instagram' | 'facebook'

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

/** GA4 memakai YYYYMMDD pada dimensi `date`; kanal lain YYYY-MM-DD. */
function bacaTanggal(t: string): Date | null {
  const rapi = t.length === 8 && !t.includes('-')
    ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`
    : t
  const d = new Date(rapi + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) ? null : d
}

const HARI_NAMA = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

/** Kode dimensi Meta → sebutan yang dimengerti admin. */
const LABEL_RINCIAN: Record<string, string> = {
  POST: 'Postingan', STORY: 'Story', REEL: 'Reels', REELS: 'Reels',
  CAROUSEL_CONTAINER: 'Carousel', IGTV: 'IGTV', AD: 'Iklan',
  FOLLOWER: 'Follower', NON_FOLLOWER: 'Bukan follower',
  UNKNOWN: 'Tidak diketahui',
}
const akhirPekan = (d: Date | null) => !!d && (d.getUTCDay() === 0 || d.getUTCDay() === 6)

export interface KontenHarian {
  id: string; jenis: string; tanggal: string; teks: string
  gambar: string; permalink: string; jangkauan: number; interaksi: number
}

/**
 * Grafik batang harian.
 *
 * Yang membedakannya dari grafik biasa: MENJAWAB KENAPA. Menyorot satu batang
 * memunculkan konten yang terbit hari itu — lonjakan tidak lagi perlu ditelusuri
 * manual ke Instagram. Grafik yang hanya melaporkan angka memaksa pembacanya
 * mencari sebab di tempat lain; ini membawa sebabnya ke tempat angkanya.
 *
 * Akhir pekan diberi WARNA berbeda, bukan latar abu — arsiran mudah terbaca
 * sebagai "tidak ada data" alih-alih "hari yang berbeda".
 *
 * Nilai di ujung batang hanya ditampilkan penuh bila batangnya cukup lebar.
 * Tiga puluh angka yang saling menimpa sama tidak terbacanya dengan tidak ada
 * angka sama sekali, jadi selebihnya cukup puncak dan batang yang disorot.
 */
function TrenBatang({ data, label, satuan = '', banding, konten, rincian }: {
  data: { tanggal: string; nilai: number }[]
  label: string
  satuan?: string
  banding?: { tanggal: string; nilai: number }[] | null
  konten?: KontenHarian[]
  /** Rincian sumber per tanggal — menjawab lonjakan tanpa postingan baru. */
  rincian?: { tanggal: string; perJenis: Record<string, number>; perFollow: Record<string, number> }[]
}) {
  const [sorot, setSorot] = useState<number | null>(null)
  if (!data.length) return null

  const maks  = Math.max(...data.map(d => d.nilai), 1)
  const rata  = data.reduce((s, d) => s + d.nilai, 0) / data.length
  const iPuncak = data.findIndex(d => d.nilai === maks)

  const nLabel  = data.length <= 31
  const nNilai  = data.length <= 14          // angka penuh hanya bila batang lebar
  const setiap  = nLabel ? 1 : data.length <= 70 ? 7 : 14

  const kontenPerTgl = new Map<string, KontenHarian[]>()
  for (const k of konten ?? []) {
    const t = String(k.tanggal).slice(0, 10)
    if (!kontenPerTgl.has(t)) kontenPerTgl.set(t, [])
    kontenPerTgl.get(t)!.push(k)
  }

  const aktif   = sorot === null ? null : data[sorot]
  const tglAktif = aktif ? String(aktif.tanggal).slice(0, 10) : ''
  const dAktif  = aktif ? bacaTanggal(aktif.tanggal) : null
  // Pembanding dicocokkan by URUTAN hari, bukan tanggal — periode pembanding
  // adalah rentang lain, jadi tanggal yang sama tidak berarti apa-apa.
  const bandingAktif = sorot !== null && banding && banding[sorot] ? banding[sorot] : null
  const kontenAktif  = aktif ? (kontenPerTgl.get(tglAktif) ?? []) : []
  const rincianAktif = aktif ? (rincian ?? []).find(r => String(r.tanggal).slice(0, 10) === tglAktif) : undefined

  return (
    <div style={{ padding: 'var(--sp-5)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 'var(--sp-4)' }}>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>
          rata-rata {angka(rata)}/hari · puncak {angka(maks)}
        </span>
      </div>

      <div style={{ position: 'relative', height: 150 }} onMouseLeave={() => setSorot(null)}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${(rata / maks) * 100}%`, borderTop: '1px dashed var(--c-text-faint)', opacity: 0.45, pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: '100%' }}>
          {data.map((d, i) => {
            const tgl    = bacaTanggal(d.tanggal)
            const pekan  = akhirPekan(tgl)
            const puncak = i === iPuncak
            const disorot = sorot === i
            const tampilNilai = nNilai || puncak || disorot
            const warna = pekan ? '#F59E0B' : puncak ? 'var(--c-primary)' : 'var(--c-secondary)'
            return (
              <div key={d.tanggal} onMouseEnter={() => setSorot(i)}
                style={{ flex: 1, minWidth: 3, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', cursor: 'pointer' }}>
                {tampilNilai && (
                  <div style={{ fontSize: 9, fontWeight: 700, textAlign: 'center', color: disorot ? 'var(--c-text)' : 'var(--c-text-faint)', marginBottom: 2, whiteSpace: 'nowrap' }}>
                    {angka(d.nilai)}
                  </div>
                )}
                <div style={{
                  width: '100%', height: `${Math.max(2, (d.nilai / maks) * 92)}%`,
                  background: warna, borderRadius: '3px 3px 0 0',
                  opacity: disorot ? 1 : 0.85,
                  outline: disorot ? '2px solid var(--c-text)' : 'none', outlineOffset: 1,
                }} />
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 3, marginTop: 5 }}>
        {data.map((d, i) => {
          const tgl   = bacaTanggal(d.tanggal)
          const pekan = akhirPekan(tgl)
          const muat  = i % setiap === 0 || i === data.length - 1
          return (
            <div key={d.tanggal} style={{
              flex: 1, minWidth: 3, textAlign: 'center', fontSize: 9, lineHeight: 1.35,
              color: pekan ? '#B45309' : 'var(--c-text-faint)', fontWeight: pekan ? 700 : 400,
              overflow: 'hidden', whiteSpace: 'nowrap',
            }}>
              {muat && tgl ? (nLabel ? <>{HARI_NAMA[tgl.getUTCDay()]}<div style={{ fontSize: 8, opacity: 0.75 }}>{tgl.getUTCDate()}</div></> : tgl.getUTCDate()) : ''}
            </div>
          )
        })}
      </div>

      {/* Panel rincian. Sengaja DI BAWAH grafik, bukan mengambang di atas batang:
          isinya lebar (sampul + teks konten) dan popup mengambang akan terpotong
          tepi kartu justru saat batangnya di pinggir. */}
      <div style={{ marginTop: 'var(--sp-4)', borderTop: '1px solid var(--c-border)', paddingTop: 'var(--sp-4)', minHeight: 74 }}>
        {!aktif ? (
          <div style={{ fontSize: 11, color: 'var(--c-text-faint)', lineHeight: 1.6 }}>
            Arahkan kursor ke sebuah batang untuk melihat konten yang terbit hari itu.
            Batang <span style={{ color: '#B45309', fontWeight: 700 }}>oranye</span> = akhir pekan ·
            garis putus-putus = rata-rata.
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ fontWeight: 800, color: 'var(--c-primary)', fontSize: 'var(--font-size-sm)' }}>
                {dAktif ? `${HARI_NAMA[dAktif.getUTCDay()]}, ` : ''}{tglAktif}
              </span>
              <span style={{ fontWeight: 800, fontSize: 'var(--font-size-sm)' }}>{angka(aktif.nilai)} {satuan}</span>
              {bandingAktif && (
                <span style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>
                  pembanding {String(bandingAktif.tanggal).slice(0, 10)}: <strong>{angka(bandingAktif.nilai)}</strong>{' '}
                  <Delta kini={aktif.nilai} dulu={bandingAktif.nilai} />
                </span>
              )}
            </div>

            {rincianAktif && (Object.keys(rincianAktif.perJenis).length > 0 || Object.keys(rincianAktif.perFollow).length > 0) && (
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 10, paddingBottom: 10, borderBottom: '1px dashed var(--c-border)' }}>
                {([['Dari format', rincianAktif.perJenis], ['Dari audiens', rincianAktif.perFollow]] as const).map(([judul, peta]) => {
                  const isi = Object.entries(peta).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
                  if (!isi.length) return null
                  const jml = isi.reduce((s, [, n]) => s + n, 0)
                  return (
                    <div key={judul}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>{judul}</div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {isi.map(([k, n]) => (
                          <span key={k} style={{ fontSize: 12, color: 'var(--c-text)' }}>
                            {LABEL_RINCIAN[k] ?? k}{' '}
                            <strong>{angka(n)}</strong>
                            <span style={{ color: 'var(--c-text-faint)' }}> ({Math.round((n / jml) * 100)}%)</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {kontenAktif.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {kontenAktif.map(k => (
                  <div key={k.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    {k.gambar
                      ? <img src={k.gambar} alt="" loading="lazy" referrerPolicy="no-referrer"
                          onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                          style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 5, flexShrink: 0, background: 'var(--c-bg)' }} />
                      : <div style={{ width: 40, height: 40, borderRadius: 5, background: 'var(--c-bg)', flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {k.teks || <em style={{ color: 'var(--c-text-muted)' }}>{k.jenis} tanpa keterangan</em>}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--c-text-faint)', marginTop: 2 }}>
                        {k.jenis}{k.jangkauan ? ` · ${angka(k.jangkauan)} jangkauan` : ''}{k.interaksi ? ` · ${angka(k.interaksi)} interaksi` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>
                Tidak ada konten yang terbit hari itu — angkanya berasal dari konten lama yang masih beredar.
              </div>
            )}
          </div>
        )}
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

/**
 * Sampul konten. Sengaja memakai <img> biasa, bukan next/image: URL CDN Instagram
 * berumur pendek dan bertanda tangan, jadi mengoptimalkan atau menyimpannya justru
 * merugikan. Kalau tautannya sudah kedaluwarsa, elemennya disembunyikan supaya
 * tidak menyisakan ikon gambar rusak.
 */
function Sampul({ url, alt }: { url: string; alt: string }) {
  if (!url) return null
  return (
    <img src={url} alt={alt} loading="lazy" referrerPolicy="no-referrer"
      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0, background: 'var(--c-bg)' }} />
  )
}

function Peringkat({ judul, baris, catatan }: {
  judul: string; catatan?: string
  baris: { kiri: React.ReactNode; kanan: string; sub?: string; gambar?: string }[]
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
            {b.gambar && <Sampul url={b.gambar} alt="" />}
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

const persen = (n: number) => `${n.toFixed(n < 10 ? 1 : 0)}%`

/**
 * Judul konten yang tetap berguna saat keterangannya kosong. Sebagian konten
 * Instagram memang tidak berketerangan, dan menampilkan "(tanpa teks)" berjajar
 * membuat daftar tidak bisa dibaca — jenis dan tanggalnya jauh lebih menolong,
 * apalagi karena barisnya bisa diklik ke postingan aslinya.
 */
function labelKonten(k: { teks: string; jenis?: string; tanggal: string; permalink: string }) {
  const teks = k.teks || `${k.jenis ?? 'Postingan'} tanpa keterangan · ${k.tanggal}`
  if (!k.permalink) return teks
  return (
    <a href={k.permalink} target="_blank" rel="noopener noreferrer"
      style={{ color: k.teks ? 'var(--c-text)' : 'var(--c-text-muted)', textDecoration: 'none', fontStyle: k.teks ? 'normal' : 'italic' }}>
      {teks} ↗
    </a>
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
  status: {
    tersambung: boolean; akun: string | null; punyaGa4: boolean; punyaYoutube: boolean
    punyaIg: boolean; punyaFb: boolean
  }
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
  const [ig,  setIg]  = useState<RingkasInstagram | null>(null)
  const [fb,  setFb]  = useState<RingkasFacebook | null>(null)
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

  const ambil = useCallback(async (kanal: Kanal) => {
    setMuat(true); setGalat('')
    try {
      const q = new URLSearchParams({ kanal, mulai, selesai })
      if (pakaiBanding) { q.set('bandingMulai', bMulai); q.set('bandingSelesai', bSelesai) }
      const res  = await fetch(`/api/${slug}/kanal-publik?${q.toString()}`)
      const json = await res.json()
      if (!json.success) { setGalat(json.error || 'Gagal memuat data'); return }
      if      (kanal === 'ga4')       setGa4(json.data)
      else if (kanal === 'youtube')   setYt(json.data)
      else if (kanal === 'instagram') setIg(json.data)
      else                            setFb(json.data)
    } catch {
      setGalat('Gagal menghubungi server')
    } finally { setMuat(false) }
  }, [slug, mulai, selesai, pakaiBanding, bMulai, bSelesai])

  useEffect(() => {
    // Kanal Google dan kanal Meta punya syarat sambungan sendiri-sendiri.
    if (tab === 'website'   && status.tersambung) ambil('ga4')
    if (tab === 'youtube'   && status.tersambung) ambil('youtube')
    if (tab === 'instagram' && status.punyaIg)    ambil('instagram')
    if (tab === 'facebook'  && status.punyaFb)    ambil('facebook')
  }, [tab, status.tersambung, status.punyaIg, status.punyaFb, ambil])

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

      {/* Sengaja TIDAK ada gerbang tunggal di sini: Google dan Meta adalah dua
          integrasi terpisah, jadi Instagram tetap bisa dibuka meski Google belum
          tersambung — dan sebaliknya. Syaratnya diperiksa per tab. */}
      <>
          {/* Tab */}
          <div style={{ display: 'flex', gap: 'var(--sp-1)', borderBottom: '1px solid var(--c-border)', marginBottom: 'var(--sp-4)', flexWrap: 'wrap' }}>
            {([
              { k: 'website', label: 'Website (GA4)' },
              { k: 'instagram', label: 'Instagram' },
              { k: 'facebook', label: 'Facebook' },
              { k: 'youtube', label: 'YouTube' },
              { k: 'google-bisnis', label: 'Google Bisnis' },
              { k: 'konten', label: '🏷️ Sifat Konten' },
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
          {tab !== 'google-bisnis' && tab !== 'konten' && (
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
          {muat && <div style={{ color: 'var(--c-text-muted)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--sp-4)' }}>Memuat data…</div>}

          {/* Syarat sambungan per tab */}
          {(tab === 'website' || tab === 'youtube') && !status.tersambung && (
            <Pesan nada="info">
              Belum tersambung ke Google. Buka{' '}
              <Link href={`/${slug}/pengaturan/google-bisnis`} style={{ color: 'var(--c-secondary)', fontWeight: 600 }}>
                Pengaturan → Integrasi Google Business
              </Link>{' '}lalu klik <strong>Hubungkan dengan Google</strong>.
            </Pesan>
          )}
          {((tab === 'instagram' && !status.punyaIg) || (tab === 'facebook' && !status.punyaFb)) && (
            <Pesan nada="info">
              {tab === 'instagram' ? 'Instagram Business ID' : 'Facebook Page ID'} atau Token Insights belum diisi.
              Lengkapi di{' '}
              <Link href={`/${slug}/pengaturan/meta`} style={{ color: 'var(--c-secondary)', fontWeight: 600 }}>
                Pengaturan → Integrasi Meta
              </Link>{' '}bagian <strong>Analitik Media Sosial</strong>, lalu pastikan <strong>Jalankan Probe</strong> hijau.
            </Pesan>
          )}

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
                <TrenBatang label={`Sesi per hari — ${mulai} s/d ${selesai}`} satuan="sesi" data={ga4.harian.map(h => ({ tanggal: h.tanggal, nilai: h.sesi }))} />
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
                <TrenBatang label={`Tayangan per hari — ${mulai} s/d ${selesai}`} satuan="tayangan" data={yt.harian.map(h => ({ tanggal: h.tanggal, nilai: h.tayangan }))} />
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

          {/* ── Instagram ── */}
          {tab === 'instagram' && ig && (ig.galat ? <Pesan nada="galat">{ig.galat}</Pesan> : (
            <>
              {ig.catatanUnik && <Pesan nada="info">{ig.catatanUnik}</Pesan>}
              <div style={kartu}>
                {ig.akun && (
                  <div style={{ ...judulKartu, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <span>@{ig.akun.username}</span>
                    <span style={{ fontWeight: 400, fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)' }}>
                      {angka(ig.akun.follower)} follower · {angka(ig.akun.media)} konten sepanjang masa
                    </span>
                  </div>
                )}
                <Statistik items={[
                  // Jangkauan & follower baru berasal dari deret harian. Kalau deret
                  // pembandingnya kosong, selisihnya SENGAJA tidak ditampilkan —
                  // lihat catatan di bawah kartu.
                  { label: 'Jangkauan', nilai: angka(ig.periode.jangkauan), warna: 'var(--c-primary)',
                    delta: <Delta kini={ig.periode.jangkauan} dulu={ig.bandingSeriKosong ? null : ig.banding?.jangkauan} />,
                    catatan: 'penjumlahan jangkauan harian' },
                  { label: 'Tayangan', nilai: angka(ig.periode.tayangan), warna: 'var(--c-secondary)', delta: <Delta kini={ig.periode.tayangan} dulu={ig.banding?.tayangan} /> },
                  { label: 'Interaksi', nilai: angka(ig.periode.interaksi), warna: 'var(--c-success)',
                    delta: <Delta kini={ig.periode.interaksi} dulu={ig.banding?.interaksi} />,
                    catatan: `${persen(ig.periode.jangkauan ? (ig.periode.interaksi / ig.periode.jangkauan) * 100 : 0)} dari jangkauan · ${angka(ig.periode.suka)} suka · ${angka(ig.periode.disimpan)} disimpan` },
                  { label: 'Follower Baru', nilai: angka(ig.periode.followerBaru), warna: '#7C3AED',
                    delta: <Delta kini={ig.periode.followerBaru} dulu={ig.bandingSeriKosong ? null : ig.banding?.followerBaru} /> },
                ]} />
                {labelBanding && (
                  <div style={{ padding: '8px var(--sp-5)', fontSize: 11, color: 'var(--c-text-muted)', borderBottom: '1px solid var(--c-border)' }}>
                    Dibandingkan dengan {labelBanding}
                    {ig.bandingSeriKosong && (
                      <span style={{ color: '#B45309', fontWeight: 600 }}>
                        {' '}— kecuali <strong>Jangkauan</strong> dan <strong>Follower Baru</strong>: Instagram tidak
                        mengembalikan data harian untuk periode pembanding itu, jadi selisihnya tidak ditampilkan.
                        Riwayat kedua metrik ini disimpan Instagram jauh lebih pendek daripada tayangan dan interaksi.
                        Pilih periode pembanding yang lebih dekat ke hari ini agar bisa dibandingkan.
                      </span>
                    )}
                  </div>
                )}
                <TrenBatang label={`Jangkauan per hari — ${mulai} s/d ${selesai}`}
                  satuan="jangkauan"
                  data={ig.harian.map(h => ({ tanggal: h.tanggal, nilai: h.jangkauan }))}
                  banding={pakaiBanding && !ig.bandingSeriKosong ? ig.bandingHarian.map(h => ({ tanggal: h.tanggal, nilai: h.jangkauan })) : null}
                  konten={ig.semuaKonten} />
              </div>

              <div style={kartu}>
                <div style={judulKartu}>Pertumbuhan Follower</div>
                <TrenBatang label="Follower baru per hari" satuan="follower baru"
                  data={ig.followerHarian.map(f => ({ tanggal: f.tanggal, nilai: f.naik }))}
                  konten={ig.semuaKonten} />
                <p style={{ padding: '0 var(--sp-5) var(--sp-5)', margin: 0, fontSize: 11, color: 'var(--c-text-faint)', lineHeight: 1.6 }}>
                  Instagram hanya melaporkan follower yang <strong>bertambah</strong>, tidak yang berhenti mengikuti —
                  berbeda dari YouTube yang melaporkan keduanya. Jadi ini bukan pertumbuhan bersih, dan
                  penjumlahannya tidak akan sama dengan kenaikan total follower.
                </p>
              </div>

              <Peringkat judul="Konten dengan Jangkauan Terbesar"
                catatan="Seberapa jauh konten tersebar. Berguna untuk melihat apa yang menembus keluar dari lingkaran follower — tapi jangkauan besar belum tentu berarti tanggapannya bagus."
                baris={ig.teratas.map(k => ({
                  kiri: labelKonten(k),
                  gambar: k.gambar,
                  sub: `${k.jenis} · ${k.tanggal} · ${angka(k.tayangan)} tayangan · ${persen(k.rasioInteraksi)} interaksi · ${angka(k.suka)} suka · ${angka(k.komentar)} komentar · ${angka(k.dibagikan)} dibagikan · ${angka(k.disimpan)} disimpan`,
                  kanan: angka(k.jangkauan),
                }))} />

              <Peringkat judul="Konten dengan Tanggapan Terbaik"
                catatan="Interaksi per 100 orang yang melihat — mengukur MUTU tanggapan, bukan besarnya sebaran. Inilah yang menunjukkan konten mana yang benar-benar mengena, karena konten kecil yang direspons hangat bisa mengalahkan konten viral yang dilewati begitu saja. Hanya konten berjangkauan ≥300 yang diikutkan, sebab rasio tidak bermakna bila penyebutnya terlalu kecil."
                baris={ig.engagementTeratas.map(k => ({
                  kiri: labelKonten(k),
                  gambar: k.gambar,
                  sub: `${k.jenis} · ${k.tanggal} · ${angka(k.jangkauan)} jangkauan · ${angka(k.interaksi)} interaksi`,
                  kanan: persen(k.rasioInteraksi),
                }))} />

              <Peringkat judul="Hari dengan Follower Baru Terbanyak"
                catatan="Konten yang terbit pada hari yang sama ikut ditampilkan. Ini KETERKAITAN waktu, bukan sebab-akibat — Instagram tidak memberi tahu konten mana yang membuat seseorang menekan Ikuti, dan pertambahan follower pada satu hari bisa juga datang dari konten lama atau dari luar Instagram. Perlakukan sebagai petunjuk untuk ditelusuri, bukan kesimpulan."
                baris={ig.hariFollower.map(h => ({
                  kiri: h.tanggal,
                  sub: h.konten.length ? h.konten.join(' • ') : 'tidak ada konten terbit hari itu',
                  kanan: `+${angka(h.naik)}`,
                }))} />

              <Peringkat judul="Jenis Konten"
                catatan="Membandingkan format bukan hanya dari sebarannya tapi juga dari mutu tanggapannya — format yang jangkauannya kecil tapi rasionya tinggi sering lebih layak diperbanyak daripada sebaliknya."
                baris={ig.jenisKonten.map(j => ({
                  kiri: j.jenis,
                  sub: `${j.jumlah} konten · ${persen(j.rasioInteraksi)} interaksi per jangkauan`,
                  kanan: angka(j.jangkauan),
                }))} />
            </>
          ))}

          {/* ── Facebook ── */}
          {tab === 'facebook' && fb && (fb.galat ? <Pesan nada="galat">{fb.galat}</Pesan> : (
            <>
              <Pesan nada="info">
                <strong>Facebook tidak lagi menyediakan angka jangkauan.</strong> Meta sudah menghapus seluruh
                metric jangkauan Page maupun per postingan, jadi pertanyaan “berapa orang melihat konten kami”
                tidak bisa dijawab dari Facebook — bukan karena izin kurang, melainkan API-nya memang tidak
                menyediakannya lagi. Yang tersisa adalah metric <strong>aksi</strong>: interaksi, klik, kunjungan
                profil, dan follower baru. Untuk mengukur jangkauan, gunakan tab Instagram.
              </Pesan>

              <div style={kartu}>
                {fb.page && (
                  <div style={{ ...judulKartu, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <span>{fb.page.nama}</span>
                    <span style={{ fontWeight: 400, fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)' }}>
                      {angka(fb.page.follower)} follower
                    </span>
                  </div>
                )}
                {/* Seluruh angka Facebook berasal dari deret harian, jadi kalau deret
                    pembandingnya kosong TIDAK ADA selisih yang boleh ditampilkan. */}
                <Statistik items={[
                  { label: 'Interaksi Postingan', nilai: angka(fb.periode.interaksi), warna: 'var(--c-primary)', delta: <Delta kini={fb.periode.interaksi} dulu={fb.bandingSeriKosong ? null : fb.banding?.interaksi} /> },
                  { label: 'Kunjungan Profil', nilai: angka(fb.periode.kunjunganProfil), warna: 'var(--c-secondary)', delta: <Delta kini={fb.periode.kunjunganProfil} dulu={fb.bandingSeriKosong ? null : fb.banding?.kunjunganProfil} /> },
                  { label: 'Follower Baru', nilai: angka(fb.periode.followerBaru), warna: 'var(--c-success)', delta: <Delta kini={fb.periode.followerBaru} dulu={fb.bandingSeriKosong ? null : fb.banding?.followerBaru} /> },
                  { label: 'Tayangan Video', nilai: angka(fb.periode.tayanganVideo), warna: '#7C3AED', delta: <Delta kini={fb.periode.tayanganVideo} dulu={fb.bandingSeriKosong ? null : fb.banding?.tayanganVideo} /> },
                ]} />
                {labelBanding && (
                  <div style={{ padding: '8px var(--sp-5)', fontSize: 11, color: 'var(--c-text-muted)', borderBottom: '1px solid var(--c-border)' }}>
                    Dibandingkan dengan {labelBanding}
                    {fb.bandingSeriKosong && (
                      <span style={{ color: '#B45309', fontWeight: 600 }}>
                        {' '}— Facebook tidak mengembalikan data harian untuk periode itu, jadi selisihnya tidak
                        ditampilkan. Pilih periode pembanding yang lebih dekat ke hari ini.
                      </span>
                    )}
                  </div>
                )}
                <TrenBatang label={`Interaksi per hari — ${mulai} s/d ${selesai}`}
                  satuan="interaksi"
                  data={fb.harian.map(h => ({ tanggal: h.tanggal, nilai: h.interaksi }))}
                  banding={pakaiBanding && !fb.bandingSeriKosong ? fb.bandingHarian.map(h => ({ tanggal: h.tanggal, nilai: h.interaksi })) : null}
                  konten={fb.semuaKonten} />
              </div>

              <div style={kartu}>
                <div style={judulKartu}>Pertumbuhan Follower</div>
                <TrenBatang label="Follower baru per hari" satuan="follower baru"
                  data={fb.followerHarian.map(f => ({ tanggal: f.tanggal, nilai: f.naik }))}
                  konten={fb.semuaKonten} />
              </div>

              {!fb.komentarTersedia && (
                <Pesan nada="info">
                  <strong>Jumlah komentar belum bisa ditampilkan.</strong> Reaksi, klik, dan bagikan tetap terisi —
                  ketiganya ditarik lewat Insights per postingan. Yang belum hanya komentar, karena membaca komentar
                  menuntut izin <code>pages_read_user_content</code> yang belum ditambahkan ke aplikasi.
                  Izin itu <strong>hanya membaca</strong>, sama seperti lima izin yang sudah ada.
                  {' '}Menambahkannya: Dasbor App Meta → Kasus penggunaan → <em>Sesuaikan</em> pada &ldquo;Kelola segala
                  sesuatu di Halaman Anda&rdquo; → <strong>+ Tambahkan</strong> pada <code>pages_read_user_content</code>,
                  lalu <strong>buat token Page baru</strong> — izin tidak berlaku surut pada token lama.
                </Pesan>
              )}

              <Peringkat judul="Postingan Teratas"
                catatan="Diurutkan berdasarkan total tanggapan. Reaksi dan klik berasal dari Insights per postingan; jumlah bagikan dari penghitung postingan itu sendiri."
                baris={fb.teratas.map(p => ({
                  kiri: labelKonten(p),
                  gambar: p.gambar,
                  sub: `${p.tanggal} · ${angka(p.reaksi)} reaksi${fb.komentarTersedia ? ` · ${angka(p.komentar)} komentar` : ''} · ${angka(p.dibagikan)} dibagikan · ${angka(p.klik)} klik`,
                  kanan: angka(p.reaksi + p.komentar + p.dibagikan + p.klik),
                }))} />
            </>
          ))}

          {tab === 'konten' && <KontenTab slug={slug} />}

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
    </div>
  )
}
