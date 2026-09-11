'use client'

/**
 * Graf jaringan akun — SVG, tanpa pustaka.
 *
 * Proyek ini sengaja ramping (20 dependensi) dan seluruh grafiknya dibuat
 * tangan. Menambah d3 demi satu tab akan menggandakan ukuran paket klien untuk
 * layar yang dibuka sekali sebulan.
 *
 * ══ TATA LETAK ══
 *
 * Gaya-pegas sederhana: tiap pasang simpul saling menolak, tiap sisi menarik,
 * dan seluruhnya ditarik lembut ke tengah. Dijalankan SEKALI saat data tiba —
 * bukan animasi berkelanjutan, karena grafik yang terus bergoyang membuat orang
 * menunggu alih-alih membaca.
 *
 * ══ YANG DITOLAK DARI RANCANGAN ══
 *
 * Tidak ada ukuran simpul berdasarkan "sentralitas". Godaannya besar — itu yang
 * dijual ASIGTA — tetapi sentralitas pada graf yang 40% simpulnya belum
 * berlabel adalah angka yang terlihat ilmiah tanpa menjadi benar. Ukuran di sini
 * hanya menyatakan JUMLAH SEBUTAN, yang tidak bisa disalahtafsirkan.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { angka, kartu } from './tampilan'

interface Simpul { id: string; sebutan: number; topik: string | null }
interface Sisi   { dari: string; ke: string; bobot: number }
interface Data {
  simpul: Simpul[]; sisi: Sisi[]
  totalSebutan: number; tanpaLabel: number; dibuangSpam: number; bulan: number
}
interface Kategori { kode: string; nama: string; warna: string }

interface Titik extends Simpul { x: number; y: number }

const L = 820, T = 560
const RENTANG = [
  { label: '3 bulan', bulan: 3 },
  { label: '12 bulan', bulan: 12 },
  { label: '3 tahun', bulan: 36 },
  { label: 'Semua', bulan: 120 },
]

/** Jari-jari simpul dari jumlah sebutan. Akar, bukan linear: akun dengan 40
 *  sebutan tidak boleh sepuluh kali lebih lebar daripada yang punya 4. */
const jari = (n: number) => 5 + Math.sqrt(n) * 3.2

function tataLetak(simpul: Simpul[], sisi: Sisi[]): Titik[] {
  const n = simpul.length
  if (!n) return []

  // Mulai dari lingkaran, bukan acak: hasil akhirnya jadi sama tiap kali dibuka,
  // dan graf yang berubah bentuk tiap muat ulang membuat orang ragu apakah
  // datanya ikut berubah.
  const titik: Titik[] = simpul.map((s, i) => ({
    ...s,
    x: L / 2 + Math.cos((i / n) * Math.PI * 2) * (Math.min(L, T) / 2.6),
    y: T / 2 + Math.sin((i / n) * Math.PI * 2) * (Math.min(L, T) / 2.6),
  }))
  const indeks = new Map(titik.map((t, i) => [t.id, i]))

  for (let putaran = 0; putaran < 220; putaran++) {
    const dx = new Array(n).fill(0), dy = new Array(n).fill(0)

    // Tolakan antar semua pasangan.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ax = titik[i].x - titik[j].x, ay = titik[i].y - titik[j].y
        let d2 = ax * ax + ay * ay
        if (d2 < 1) { ax = Math.random() - .5; ay = Math.random() - .5; d2 = 1 }
        const gaya = 2600 / d2
        dx[i] += ax * gaya; dy[i] += ay * gaya
        dx[j] -= ax * gaya; dy[j] -= ay * gaya
      }
    }

    // Tarikan sepanjang sisi.
    for (const e of sisi) {
      const a = indeks.get(e.dari), b = indeks.get(e.ke)
      if (a === undefined || b === undefined) continue
      const ax = titik[b].x - titik[a].x, ay = titik[b].y - titik[a].y
      const gaya = 0.012
      dx[a] += ax * gaya; dy[a] += ay * gaya
      dx[b] -= ax * gaya; dy[b] -= ay * gaya
    }

    const dingin = 1 - putaran / 220
    for (let i = 0; i < n; i++) {
      // Tarikan lembut ke tengah menahan simpul terpencil kabur dari bingkai.
      dx[i] += (L / 2 - titik[i].x) * 0.006
      dy[i] += (T / 2 - titik[i].y) * 0.006
      titik[i].x = Math.max(24, Math.min(L - 24, titik[i].x + dx[i] * dingin * 0.5))
      titik[i].y = Math.max(24, Math.min(T - 24, titik[i].y + dy[i] * dingin * 0.5))
    }
  }
  return titik
}

export default function GrafTab({ slug, topik }: { slug: string; topik: Kategori[] }) {
  const [bulan, setBulan] = useState(12)
  const [spam, setSpam]   = useState(false)
  const [data, setData]   = useState<Data | null>(null)
  const [muat, setMuat]   = useState(true)
  const [galat, setGalat] = useState('')
  const [sorot, setSorot] = useState<string | null>(null)

  const ambil = useCallback(async () => {
    setMuat(true); setGalat('')
    try {
      const res  = await fetch(`/api/${slug}/sebutan/graf?bulan=${bulan}&spam=${spam ? 1 : 0}`)
      const json = await res.json()
      if (!json.success) { setGalat(json.error ?? 'Gagal memuat graf.'); return }
      setData(json)
    } catch { setGalat('Gagal menghubungi server.') }
    finally { setMuat(false) }
  }, [slug, bulan, spam])

  useEffect(() => { ambil() }, [ambil])

  const titik = useMemo(
    () => data ? tataLetak(data.simpul, data.sisi) : [], [data])
  const posisi = useMemo(() => new Map(titik.map(t => [t.id, t])), [titik])

  const warna = (kode: string | null) =>
    topik.find(t => t.kode === kode)?.warna ?? '#94A3B8'

  const persenLabel = data && data.totalSebutan
    ? Math.floor(((data.totalSebutan - data.tanpaLabel) / data.totalSebutan) * 100)
    : 0

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--sp-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        {RENTANG.map(r => (
          <button key={r.bulan} onClick={() => setBulan(r.bulan)} style={pil(bulan === r.bulan)}>
            {r.label}
          </button>
        ))}
        <span style={{ width: 12 }} />
        <button onClick={() => setSpam(s => !s)} style={pil(spam)}>
          {spam ? '✓ Spam disertakan' : 'Spam dibuang'}
        </button>
      </div>

      {galat && (
        <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, marginBottom: 'var(--sp-3)' }}>{galat}</div>
      )}

      {/* Cakupan label MENENTUKAN seberapa jauh graf ini boleh dipercaya, jadi ia
          diletakkan di atas gambarnya — bukan sebagai catatan kaki. Pembuangan
          spam bergantung pada label; pada cakupan rendah, akun promosi masih
          duduk di dalam graf tanpa ada yang tahu. */}
      {data && persenLabel < 60 && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 'var(--r-md)', padding: '11px 14px', fontSize: 13, color: '#92400E', lineHeight: 1.65, marginBottom: 'var(--sp-3)' }}>
          <strong>Baru {persenLabel}% sebutan pada rentang ini yang berlabel.</strong>{' '}
          Pembuangan spam bergantung pada label, jadi akun promosi kemungkinan masih
          duduk di dalam graf ini tanpa tertandai. Selesaikan peninjauan lebih dulu
          sebelum menarik kesimpulan tentang siapa yang sentral.
        </div>
      )}

      {muat ? (
        <div style={{ color: 'var(--c-text-muted)', fontSize: 13 }}>Menyusun graf…</div>
      ) : !data?.simpul.length ? (
        <div style={{ ...kartu, fontSize: 13, color: 'var(--c-text-muted)', lineHeight: 1.7 }}>
          Tidak ada akun pada rentang ini. Perlebar rentangnya, atau tarik sebutan lebih dulu.
        </div>
      ) : (
        <>
          <div style={{ ...kartu, padding: 0, overflow: 'hidden' }}>
            <svg viewBox={`0 0 ${L} ${T}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
              {data.sisi.map((e, i) => {
                const a = posisi.get(e.dari), b = posisi.get(e.ke)
                if (!a || !b) return null
                const aktif = sorot === e.dari || sorot === e.ke
                return (
                  <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={aktif ? 'var(--c-secondary)' : '#CBD5E1'}
                    strokeWidth={aktif ? 2 : 1}
                    opacity={sorot && !aktif ? .18 : .6} />
                )
              })}
              {titik.map(t => {
                const aktif = sorot === t.id
                return (
                  <g key={t.id}
                    onMouseEnter={() => setSorot(t.id)}
                    onMouseLeave={() => setSorot(null)}
                    style={{ cursor: 'pointer' }}>
                    <circle cx={t.x} cy={t.y} r={jari(t.sebutan)}
                      fill={warna(t.topik)}
                      // Akun yang HANYA disebut orang lain digambar berongga —
                      // ia belum pernah menandai RKZ, dan menyamakannya dengan
                      // penyebut aktif akan melebihkan jangkauan jaringan.
                      fillOpacity={t.sebutan ? (sorot && !aktif ? .25 : .85) : .12}
                      stroke={warna(t.topik)} strokeWidth={1.5}
                      strokeOpacity={sorot && !aktif ? .3 : 1} />
                    {(aktif || t.sebutan >= 3) && (
                      <text x={t.x} y={t.y - jari(t.sebutan) - 4} textAnchor="middle"
                        style={{ fontSize: 10, fill: 'var(--c-text)', fontWeight: aktif ? 700 : 400 }}>
                        @{t.id}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
          </div>

          <div style={{ ...kartu, display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap', fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.7 }}>
            <span><strong style={{ color: 'var(--c-text)' }}>{angka(data.simpul.length)}</strong> akun</span>
            <span><strong style={{ color: 'var(--c-text)' }}>{angka(data.sisi.length)}</strong> tepi antar-akun</span>
            <span>Label ditetapkan: <strong style={{ color: 'var(--c-text)' }}>{persenLabel}%</strong></span>
            {data.dibuangSpam > 0 && <span>{angka(data.dibuangSpam)} sebutan spam dibuang</span>}
            <span style={{ flexBasis: '100%', color: 'var(--c-text-faint)' }}>
              Lingkaran <strong>berongga</strong> = akun yang hanya disebut orang lain, belum
              pernah menandai RKZ. Ukuran menyatakan jumlah sebutan — <em>bukan</em>
              sentralitas, yang pada cakupan label seperti ini akan terlihat ilmiah tanpa
              menjadi benar.
            </span>
          </div>
        </>
      )}
    </div>
  )
}

const pil = (aktif: boolean): React.CSSProperties => ({
  padding: '6px 14px', borderRadius: 999, fontFamily: 'inherit', fontSize: 12,
  fontWeight: aktif ? 700 : 500, cursor: 'pointer',
  border: `1.5px solid ${aktif ? 'var(--c-secondary)' : 'var(--c-border)'}`,
  background: aktif ? 'var(--c-secondary)' : 'white',
  color: aktif ? 'white' : 'var(--c-text-muted)',
})
