'use client'

/**
 * Graf jaringan akun — SVG, tanpa pustaka.
 *
 * Proyek ini sengaja ramping (20 dependensi) dan seluruh grafiknya dibuat
 * tangan. Menambah d3 demi satu tab akan menggandakan ukuran paket klien untuk
 * layar yang dibuka sekali sebulan.
 *
 * ══ TEMUAN DULU, GAMBAR BELAKANGAN ══
 *
 * Urutan di layar disengaja: kalimat temuan, lalu segmentasi akun, lalu graf,
 * lalu tabel. Grafnya sendiri TIDAK PERNAH bisa mengatakan "88% akun sudah
 * diam" — hanya angka yang bisa. Menaruh gambar paling atas membuat orang
 * memandanginya lalu pergi tanpa kesimpulan apa pun.
 *
 * Seluruh kalimat temuan DIHITUNG, bukan dikarang AI. Karena ia turunan
 * aritmetika dari angka yang sama yang tampil di layar, ia selalu benar dan
 * tidak pernah perlu ditinjau siapa pun.
 *
 * ══ TATA LETAK RADIAL ══
 *
 * Lihat catatan pada `tataLetak`. Ringkasnya: gaya-pegas membuat 68% akun yang
 * tak punya tepi terdorong menumpuk di sudut bingkai, dan posisinya tidak
 * berarti apa-apa. Pada radial, jarak dari pusat menyatakan seberapa sering akun
 * itu kembali — sehingga gambarnya menjadi temuannya sendiri.
 *
 * ══ YANG DITOLAK DARI RANCANGAN ══
 *
 * Tidak ada ukuran simpul berdasarkan "sentralitas". Godaannya besar — itu yang
 * dijual ASIGTA — tetapi sentralitas pada jaringan setipis ini adalah angka yang
 * terlihat ilmiah tanpa menjadi benar. Yang dipakai hanya DERAJAT: berapa akun
 * lain yang menyebut akun ini. Hitungan tidak bisa disalahtafsirkan.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { angka, kartu, tingkatDari } from './tampilan'

interface Simpul { id: string; sebutan: number; topik: string | null; segmen: string }
interface Sisi   { dari: string; ke: string; bobot: number }
interface Akun {
  id: string; jumlah: number; rentangHari: number; topik: string | null
  pertama: string; terakhir: string; derajat: number; segmen: string
}
interface Segmen { kunci: string; nama: string; jumlah: number; arti: string }
interface Data {
  simpul: Simpul[]; sisi: Sisi[]; akun: Akun[]; segmen: Segmen[]
  ringkasan: {
    totalAkun: number; sekaliSaja: number; berulang: number
    aktifSetahun: number; totalTepi: number
  }
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

/**
 * TATA LETAK RADIAL — menggantikan gaya-pegas.
 *
 * Gaya-pegas menempatkan simpul menurut TARIKAN SISI. Tetapi 68% akun tidak
 * punya sisi sama sekali: mereka murni benda yang saling menolak, terdorong
 * keluar, lalu terjepit di batas bingkai. Itulah gumpalan di sudut yang membuat
 * grafnya tidak terbaca.
 *
 * Lebih buruk lagi, pada gaya-pegas POSISI TIDAK BERARTI APA-APA — simpul di
 * kiri atas tidak lebih penting daripada yang di kanan bawah.
 *
 * Di sini jarak dari pusat menyatakan sesuatu yang nyata: seberapa sering akun
 * itu kembali menyebut RKZ. Akibatnya gambarnya menjadi temuannya sendiri —
 * inti tipis dengan cincin luar tebal ADALAH "68% sekali lewat", terlihat tanpa
 * perlu dibaca.
 *
 * Sudutnya diurutkan menurut kategori, sehingga warna membentuk busur alih-alih
 * bertaburan. Deterministik: bentuknya sama tiap kali dibuka, jadi tidak ada
 * yang ragu apakah datanya ikut berubah.
 *
 * Catatan jujur soal ASIGTA: bentuk bola mereka lahir dari jaringan tagar yang
 * PADAT. Data RKZ tipis, jadi gaya-pegas tidak akan pernah menghasilkan itu.
 * Radial memberi tampilan tersusun secara sengaja, bukan dengan berpura-pura
 * padat.
 */
function tataLetak(simpul: Simpul[]): Titik[] {
  if (!simpul.length) return []

  // Tiga cincin, dipilih menurut jumlah sebutan.
  const cincin = (n: number) => (n >= 5 ? 0 : n >= 2 ? 1 : 2)
  const JARI = [Math.min(L, T) * 0.17, Math.min(L, T) * 0.31, Math.min(L, T) * 0.44]

  const hasil: Titik[] = []
  for (let c = 0; c < 3; c++) {
    const isi = simpul
      .filter(s => cincin(s.sebutan) === c)
      // Urut menurut kategori lalu nama: warna sekelompok jadi berdampingan,
      // dan urutannya tidak berubah antar muat.
      .sort((a, b) => (a.topik ?? 'zz').localeCompare(b.topik ?? 'zz') || a.id.localeCompare(b.id))
    if (!isi.length) continue

    isi.forEach((s, k) => {
      // Cincin luar sering memuat ratusan simpul. Digeser setengah langkah
      // berselang-seling supaya tidak menjadi satu garis rapat yang menutupi
      // dirinya sendiri.
      const sudut = (k / isi.length) * Math.PI * 2 - Math.PI / 2
      const geser = c === 2 && k % 2 ? 9 : 0
      hasil.push({
        ...s,
        x: L / 2 + Math.cos(sudut) * (JARI[c] + geser),
        y: T / 2 + Math.sin(sudut) * (JARI[c] + geser),
      })
    })
  }
  return hasil
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
    () => data ? tataLetak(data.simpul) : [], [data])
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
      {/* Ambang yang SAMA dengan tab Ringkasan — dua ambang berbeda untuk hal
          yang sama akan membuat satu tab menyebut data "cukup" sementara tab
          sebelahnya menyebutnya "kurang". */}
      {data && tingkatDari(persenLabel).kunci !== 'andal' && (
        <div style={{ background: tingkatDari(persenLabel).latar, border: `1px solid ${tingkatDari(persenLabel).garis}`, borderRadius: 'var(--r-md)', padding: '11px 14px', fontSize: 13, color: tingkatDari(persenLabel).warna, lineHeight: 1.65, marginBottom: 'var(--sp-3)' }}>
          <strong>Keandalan {tingkatDari(persenLabel).nama} — {persenLabel}% sebutan pada rentang ini berlabel.</strong>{' '}
          Pembuangan spam bergantung pada label, jadi akun promosi kemungkinan masih
          duduk di dalam graf ini tanpa tertandai. Selesaikan peninjauan lebih dulu
          sebelum menarik kesimpulan tentang siapa yang sentral.
        </div>
      )}

      {/* TEMUAN DULU, GAMBAR BELAKANGAN.
          Grafnya tidak pernah bisa mengatakan "88% akun sudah diam" — hanya
          angka yang bisa. Menaruh gambar di atas membuat orang memandanginya
          lalu pergi tanpa kesimpulan apa pun. */}
      {data && data.ringkasan.totalAkun > 0 && (
        <div style={{ ...kartu, lineHeight: 1.75, fontSize: 13.5 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
            Yang terbaca dari jaringan ini
          </div>
          <Temuan data={data} />
        </div>
      )}

      {data && data.segmen.some(s2 => s2.jumlah > 0) && (
        <div style={{ ...kartu, padding: 0, overflow: 'hidden' }}>
          {data.segmen.filter(s2 => s2.jumlah > 0).map((s2, i, arr) => (
            <div key={s2.kunci} style={{
              display: 'flex', gap: 'var(--sp-3)', alignItems: 'baseline',
              padding: '11px var(--sp-5)',
              borderBottom: i < arr.length - 1 ? '1px solid var(--c-border)' : 'none',
            }}>
              <div style={{ flex: '0 0 52px', textAlign: 'right', fontSize: 18, fontWeight: 800, color: WARNA_SEGMEN[s2.kunci] ?? 'var(--c-text)' }}>
                {angka(s2.jumlah)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{s2.nama}</div>
                <div style={{ fontSize: 11.5, color: 'var(--c-text-muted)', lineHeight: 1.6 }}>{s2.arti}</div>
              </div>
            </div>
          ))}
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

          <TabelAkun akun={data.akun} namaTopik={k => topik.find(t => t.kode === k)?.nama ?? k ?? '—'} />

          <div style={{ ...kartu, display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap', fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.7 }}>
            <span><strong style={{ color: 'var(--c-text)' }}>{angka(data.simpul.length)}</strong> akun</span>
            <span><strong style={{ color: 'var(--c-text)' }}>{angka(data.sisi.length)}</strong> tepi antar-akun</span>
            <span>Label ditetapkan: <strong style={{ color: 'var(--c-text)' }}>{persenLabel}%</strong></span>
            {data.dibuangSpam > 0 && <span>{angka(data.dibuangSpam)} sebutan spam dibuang</span>}
            <span style={{ flexBasis: '100%', color: 'var(--c-text-faint)' }}>
              <strong>Jarak dari pusat = seberapa sering akun itu kembali.</strong> Cincin
              dalam ≥5 sebutan, tengah 2–4, luar sekali saja. Lingkaran{' '}
              <strong>berongga</strong> = akun yang hanya disebut orang lain, belum pernah
              menandai RKZ. Ukuran menyatakan jumlah sebutan — <em>bukan</em> sentralitas,
              yang pada jaringan setipis ini akan terlihat ilmiah tanpa menjadi benar.
            </span>
          </div>
        </>
      )}
    </div>
  )
}

const WARNA_SEGMEN: Record<string, string> = {
  pendukung: '#16A34A', ledakan: '#D97706', berulang: '#0891B2',
  sekali: '#64748B', menumpang: '#94A3B8',
}

const tglPendek = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })

/**
 * Kalimat temuan — DIHITUNG, bukan ditulis, dan bukan pula dikarang AI.
 *
 * Karena seluruhnya turunan aritmetika dari angka yang sama yang tampil di
 * layar, kalimat ini selalu benar dan tidak pernah perlu ditinjau siapa pun.
 * Itu bedanya dari ringkasan yang dihasilkan model: yang ini tidak bisa salah.
 */
function Temuan({ data }: { data: Data }) {
  const r = data.ringkasan
  if (!r.totalAkun) return null

  const persen = (a: number) => Math.round((a / r.totalAkun) * 100)
  const diam   = r.totalAkun - r.aktifSetahun

  const baris: React.ReactNode[] = []

  baris.push(
    <li key="sekali">
      <strong>{persen(r.sekaliSaja)}% akun menyebut RKZ satu kali saja</strong>{' '}
      ({angka(r.sekaliSaja)} dari {angka(r.totalAkun)}). Jaringan ini didominasi
      perjumpaan sekali lewat, bukan komunitas yang kembali.
    </li>,
  )

  if (diam > 0) {
    baris.push(
      <li key="diam">
        <strong>{angka(diam)} akun sudah tidak menyebut lagi dalam setahun terakhir</strong>{' '}
        — tersisa {angka(r.aktifSetahun)} yang masih aktif. Ini pertanyaan pertumbuhan,
        bukan pertanyaan reputasi: jangkauan lama tidak otomatis bertahan.
      </li>,
    )
  }

  const ledakan = data.segmen.find(s => s.kunci === 'ledakan')?.jumlah ?? 0
  if (ledakan > 0) {
    baris.push(
      <li key="ledakan">
        <strong>{angka(ledakan)} akun menyebut berulang dalam rentang kurang dari dua pekan.</strong>{' '}
        Pola itu menandai kampanye atau satu kegiatan, bukan hubungan yang berjalan —
        periksa isinya sebelum menghitungnya sebagai dukungan.
      </li>,
    )
  }

  baris.push(
    <li key="tepi">
      {r.totalTepi > 0
        ? <><strong>{angka(r.totalTepi)} tepi antar-akun</strong> terbaca dari takarir —
            artinya sebagian penyebut juga menyebut satu sama lain, dan graf ini punya
            struktur, bukan sekadar bintang berpusat RKZ.</>
        : <>Tidak ada tepi antar-akun pada rentang ini. Para penyebut tidak saling
            menyebut, jadi yang tergambar adalah bintang berpusat RKZ — bukan jaringan.</>}
    </li>,
  )

  return (
    <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>{baris}</ul>
  )
}

/**
 * Tabel peringkat — INILAH produk tab ini; grafnya pelengkap.
 *
 * Bisa diurutkan mata, disalin ke laporan, dan dibaca tanpa menafsirkan gambar.
 * Kolom "terakhir" sengaja ada di sebelah "jumlah": akun dengan 12 sebutan yang
 * berhenti pada 2019 dan akun dengan 4 sebutan yang masih berjalan bulan ini
 * adalah dua hal yang sangat berbeda, dan urutan menurut jumlah saja
 * menyembunyikannya.
 */
function TabelAkun({ akun, namaTopik }: {
  akun: Akun[]; namaTopik: (k: string | null) => string
}) {
  if (!akun.length) return null
  const th: React.CSSProperties = {
    textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 800,
    color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '.4px',
    borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = {
    padding: '8px 10px', fontSize: 12.5, borderBottom: '1px solid var(--c-border)',
    whiteSpace: 'nowrap',
  }
  return (
    <div style={{ ...kartu, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)' }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Akun yang Menyebut RKZ</div>
        <div style={{ fontSize: 11.5, color: 'var(--c-text-muted)', marginTop: 3 }}>
          Diurutkan menurut jumlah sebutan. Perhatikan kolom <strong>terakhir</strong> —
          banyak menyebut pada 2019 tidak sama dengan masih menyebut bulan ini.
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
          <thead><tr>
            <th style={th}>Akun</th>
            <th style={{ ...th, textAlign: 'right' }}>Sebutan</th>
            <th style={th}>Kategori</th>
            <th style={th}>Segmen</th>
            <th style={th}>Pertama</th>
            <th style={th}>Terakhir</th>
            <th style={{ ...th, textAlign: 'right' }} title="Berapa akun lain yang menyebut akun ini di takarirnya">Disebut</th>
          </tr></thead>
          <tbody>
            {akun.map(a => (
              <tr key={a.id}>
                <td style={{ ...td, fontWeight: 600 }}>@{a.id}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{angka(a.jumlah)}</td>
                <td style={{ ...td, color: 'var(--c-text-muted)' }}>{namaTopik(a.topik)}</td>
                <td style={td}>
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                    color: 'white', background: WARNA_SEGMEN[a.segmen] ?? '#64748B',
                  }}>{a.segmen}</span>
                </td>
                <td style={{ ...td, color: 'var(--c-text-faint)' }}>{tglPendek(a.pertama)}</td>
                <td style={{ ...td, color: 'var(--c-text-faint)' }}>{tglPendek(a.terakhir)}</td>
                <td style={{ ...td, textAlign: 'right', color: a.derajat ? 'var(--c-text)' : 'var(--c-text-faint)' }}>
                  {a.derajat || '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
