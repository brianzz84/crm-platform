'use client'

/**
 * Laporan percakapan — responsivitas Inbox lintas kanal.
 *
 * Sebelum ini laporan triwulan tidak menyebut Inbox sama sekali. Yang diukur di
 * sini bukan berapa banyak konten diterbitkan, melainkan seberapa cepat orang
 * dijawab — pekerjaan harian petugas, dan satu-satunya bagian laporan yang
 * langsung bisa ditindaklanjuti oleh mereka.
 */

import { useCallback, useEffect, useState } from 'react'

type Kanal = 'WA' | 'FB' | 'IG'
/** Urutannya tetap agar kolom tabel topik tidak berpindah antar-periode. */
const KANAL: Kanal[] = ['WA', 'FB', 'IG']

interface Sel {
  percakapan: number; pesanMasuk: number; pesanKeluar: number
  dijawab: number; tidakDijawab: number; medianMenit: number | null
}
interface BarisKanal { kanal: Kanal; perBulan: Record<string, Sel>; total: Sel }
interface BarisLabel {
  kode: string; nama: string; warna: string
  perKanal: Record<string, number>; total: number
}
interface Laporan {
  bulan: string[]
  terekamSejak: Record<string, string | null>
  perKanal: BarisKanal[]
  jamSibuk: number[]
  topik: BarisLabel[]
  poli: BarisLabel[]
  basisPercakapan: number
  tanpaTopik: number
  ringkas: {
    pesanMasuk: number; pesanKeluar: number
    dijawab: number; tidakDijawab: number; medianMenit: number | null
  }
}

const NAMA_KANAL: Record<Kanal, string> = { WA: 'WhatsApp', FB: 'Facebook', IG: 'Instagram' }
const WARNA_KANAL: Record<Kanal, string> = { WA: '#25D366', FB: '#1877F2', IG: '#C13584' }

const angka = (n: number) => Math.round(n).toLocaleString('id-ID')
const NAMA_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const labelBulan = (b: string) => `${NAMA_BULAN[Number(b.slice(5, 7)) - 1] ?? b} ${b.slice(2, 4)}`

/** Menit mentah tidak terbaca manusia: 1.437 menit tidak berarti apa-apa. */
function durasi(menit: number | null): string {
  if (menit == null) return '—'
  if (menit < 60) return `${menit} mnt`
  if (menit < 1440) {
    const j = Math.floor(menit / 60), m = menit % 60
    return m ? `${j} jam ${m} mnt` : `${j} jam`
  }
  const h = Math.floor(menit / 1440), j = Math.round((menit % 1440) / 60)
  return j ? `${h} hr ${j} jam` : `${h} hari`
}

/** Ambang dipilih dari sudut pandang orang yang menunggu dibalas, bukan sistem. */
function warnaDurasi(menit: number | null): string | undefined {
  if (menit == null) return 'var(--c-text-muted)'
  return menit <= 60 ? '#16A34A' : menit <= 24 * 60 ? '#B45309' : '#B91C1C'
}

const kartu: React.CSSProperties = {
  background: 'white', border: '1px solid var(--c-border)',
  borderRadius: 'var(--r-lg)', marginBottom: 'var(--sp-5)', overflow: 'hidden',
}
const judulKartu: React.CSSProperties = {
  padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)',
  fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--c-primary)',
}
const th: React.CSSProperties = {
  padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--c-text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'right',
  borderBottom: '1.5px solid var(--c-border)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  padding: '9px 10px', fontSize: 13, textAlign: 'right',
  borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap',
}
const kiri: React.CSSProperties = { textAlign: 'left' }
const gulir: React.CSSProperties = { overflowX: 'auto', padding: 'var(--sp-4) var(--sp-5)' }

export default function LaporanPercakapan(
  { slug, mulai, selesai }: { slug: string; mulai: string; selesai: string },
) {
  const [data, setData] = useState<Laporan | null>(null)
  const [muat, setMuat] = useState(false)
  const [galat, setGalat] = useState('')

  const ambil = useCallback(async () => {
    setMuat(true); setGalat('')
    try {
      const q = new URLSearchParams({ kanal: 'PERCAKAPAN', mulai, selesai })
      const res  = await fetch(`/api/${slug}/kanal-publik/laporan?${q}`)
      const json = await res.json()
      if (!json.success) { setGalat(json.error || 'Gagal memuat laporan'); return }
      setData(json.data)
    } catch { setGalat('Gagal menghubungi server') }
    finally { setMuat(false) }
  }, [slug, mulai, selesai])

  useEffect(() => { ambil() }, [ambil])

  if (galat) {
    return <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #EF4444' }}>{galat}</div>
  }
  if (muat && !data) return <div style={{ color: 'var(--c-text-muted)', fontSize: 13 }}>Menghitung…</div>
  if (!data) return null

  const r = data.ringkas
  const totalGiliran = r.dijawab + r.tidakDijawab
  const persenJawab  = totalGiliran > 0 ? (r.dijawab / totalGiliran) * 100 : 0
  const puncakJam    = Math.max(...data.jamSibuk, 1)
  // Pembagi persentase adalah JUMLAH PERCAKAPAN, bukan jumlah label. Satu
  // percakapan boleh punya beberapa label, jadi kolom Total menjumlah lebih
  // besar dari basis dan persennya bisa melampaui 100% — wajar untuk pelabelan
  // ganda, menyesatkan bila basisnya tidak dinyatakan di layar.
  const basis        = data.basisPercakapan

  // Kanal yang riwayatnya belum menutupi awal periode. Tanpa keterangan ini,
  // laporan akan terbaca seolah kanal itu memang sepi — padahal datanya belum ada.
  const belumPenuh = (Object.entries(data.terekamSejak) as [Kanal, string | null][])
    .filter(([, sejak]) => sejak && sejak > mulai)

  return (
    <div>
      {belumPenuh.length > 0 && (
        <div style={{ background: '#FFFBEB', borderLeft: '3px solid #F59E0B', color: '#92400E', padding: 'var(--sp-4)', borderRadius: 'var(--r-md)', fontSize: 13, lineHeight: 1.7, marginBottom: 'var(--sp-5)' }}>
          <strong>Sebagian kanal belum terekam sepanjang periode ini.</strong>{' '}
          {belumPenuh.map(([k, s]) => `${NAMA_KANAL[k]} sejak ${s}`).join('; ')}.
          {' '}Angka sebelum tanggal itu <strong>bukan berarti sepi</strong> — percakapannya memang
          belum masuk ke CRM. Bandingkan antarkanal hanya pada periode yang sama-sama terekam.
        </div>
      )}

      {/* ── Ringkasan ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1, background: 'var(--c-border)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', marginBottom: 'var(--sp-5)' }}>
        {[
          { l: 'Pesan masuk',   v: angka(r.pesanMasuk),  w: undefined },
          { l: 'Pesan keluar',  v: angka(r.pesanKeluar), w: undefined },
          { l: 'Dijawab',       v: `${persenJawab.toFixed(0)}%`, w: persenJawab >= 80 ? '#16A34A' : persenJawab >= 50 ? '#B45309' : '#B91C1C' },
          { l: 'Belum dijawab', v: angka(r.tidakDijawab), w: r.tidakDijawab > 0 ? '#B91C1C' : undefined },
          { l: 'Median respons', v: durasi(r.medianMenit), w: warnaDurasi(r.medianMenit) },
        ].map(s => (
          <div key={s.l} style={{ background: 'white', padding: '10px 14px' }}>
            <div style={{ fontSize: 10, color: 'var(--c-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.l}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: s.w ?? 'var(--c-primary)' }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* ── Per kanal ── */}
      <div style={kartu}>
        <div style={judulKartu}>Responsivitas per Kanal</div>
        <div style={gulir}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ ...th, ...kiri }}>Kanal</th>
                <th style={th}>Percakapan</th>
                <th style={th}>Masuk</th>
                <th style={th}>Keluar</th>
                <th style={th}>Dijawab</th>
                <th style={th}>Belum Dijawab</th>
                <th style={th}>Median Respons</th>
              </tr>
            </thead>
            <tbody>
              {data.perKanal.map(k => {
                const g = k.total.dijawab + k.total.tidakDijawab
                return (
                  <tr key={k.kanal}>
                    <td style={{ ...td, ...kiri, fontWeight: 700 }}>
                      <span style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: WARNA_KANAL[k.kanal], marginRight: 8,
                      }} />
                      {NAMA_KANAL[k.kanal]}
                    </td>
                    <td style={td}>{angka(k.total.percakapan)}</td>
                    <td style={td}>{angka(k.total.pesanMasuk)}</td>
                    <td style={td}>{angka(k.total.pesanKeluar)}</td>
                    <td style={td}>
                      {angka(k.total.dijawab)}
                      {g > 0 && (
                        <span style={{ color: 'var(--c-text-faint)', fontSize: 11, fontWeight: 400 }}>
                          {' '}({Math.round((k.total.dijawab / g) * 100)}%)
                        </span>
                      )}
                    </td>
                    <td style={{ ...td, color: k.total.tidakDijawab > 0 ? '#B91C1C' : undefined }}>
                      {angka(k.total.tidakDijawab)}
                    </td>
                    <td style={{ ...td, fontWeight: 700, color: warnaDurasi(k.total.medianMenit) }}>
                      {durasi(k.total.medianMenit)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '0 var(--sp-5) var(--sp-4)', fontSize: 11, color: 'var(--c-text-faint)', lineHeight: 1.6 }}>
          Satu <strong>giliran</strong> adalah rentetan pesan masuk yang belum dijawab, bukan tiap
          pesan — pengirim yang menulis lima pesan berturut-turut tidak menciptakan lima kewajiban
          menjawab. Median dipakai, bukan rata-rata, karena satu percakapan yang terlambat berhari-hari
          akan menarik rata-rata sampai tidak menggambarkan hari biasa. Catatan internal tidak
          dihitung sebagai balasan.
        </div>
      </div>

      {/* ── Per bulan ── */}
      {data.bulan.length > 0 && (
        <div style={kartu}>
          <div style={judulKartu}>Median Respons per Bulan</div>
          <div style={gulir}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr>
                  <th style={{ ...th, ...kiri }}>Kanal</th>
                  {data.bulan.map(b => <th key={b} style={th}>{labelBulan(b)}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.perKanal.map(k => (
                  <tr key={k.kanal}>
                    <td style={{ ...td, ...kiri, fontWeight: 700 }}>{NAMA_KANAL[k.kanal]}</td>
                    {data.bulan.map(b => {
                      const sel = k.perBulan[b]
                      return (
                        <td key={b} style={{ ...td, color: warnaDurasi(sel?.medianMenit ?? null), fontWeight: sel?.medianMenit != null ? 700 : 400 }}>
                          {durasi(sel?.medianMenit ?? null)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Keperluan & poli ── */}
      <TabelLabel
        judul="Keperluan yang Ditanyakan" kolom="Keperluan"
        baris={data.topik} basis={basis} tanpaLabel={data.tanpaTopik}
        catatan="Satu percakapan dihitung sekali per keperluan. Karena satu percakapan boleh
                 punya beberapa keperluan, kolom Total menjumlah lebih besar dari jumlah
                 percakapan dan porsinya bisa melampaui 100%."
        kosong="Belum ada percakapan yang ditetapkan keperluannya pada periode ini."
      />

      <TabelLabel
        judul="Bidang Layanan yang Ditanyakan" kolom="Poli / Layanan"
        baris={data.poli} basis={basis}
        catatan="Porsi dihitung terhadap seluruh percakapan pada periode ini, termasuk yang
                 tidak menyangkut bidang layanan mana pun — lamaran kerja, penawaran vendor,
                 dan spam memang tidak punya poli."
        kosong="Belum ada percakapan yang ditetapkan bidang layanannya pada periode ini."
      />

      {/* ── Jam sibuk ── */}
      <div style={kartu}>
        <div style={judulKartu}>Pesan Masuk per Jam</div>
        <div style={{ padding: 'var(--sp-4) var(--sp-5)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
            {data.jamSibuk.map((n, jam) => (
              <div key={jam} title={`${String(jam).padStart(2, '0')}:00 — ${angka(n)} pesan`}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                <div style={{
                  height: `${Math.max(2, (n / puncakJam) * 100)}%`,
                  background: n === puncakJam && n > 0 ? 'var(--c-secondary)' : '#CBD5E1',
                  borderRadius: '3px 3px 0 0',
                }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
            {data.jamSibuk.map((_, jam) => (
              <div key={jam} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--c-text-faint)' }}>
                {jam % 3 === 0 ? jam : ''}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 10, lineHeight: 1.6 }}>
            Waktu WIB. Menjawab pertanyaan penjadwalan staf yang selama ini dijawab dengan
            perkiraan — bukan berapa banyak pesan, melainkan kapan orang benar-benar menghubungi.
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Tabel silang label × kanal. Dipakai dua kali — keperluan dan poli — karena
 * bentuk keduanya identik dan menyalinnya akan melahirkan dua tabel yang
 * perlahan berbeda perilaku.
 *
 * `basis` selalu ditampilkan di judul kolom Porsi. Itu bukan hiasan: dengan
 * pelabelan ganda, jumlah persen bisa melampaui 100%, dan tanpa pembagi yang
 * dinyatakan pembaca akan menganggap angkanya salah — atau lebih buruk,
 * menganggapnya benar dengan pengertian yang keliru.
 */
function TabelLabel({ judul, kolom, baris, basis, tanpaLabel, catatan, kosong }: {
  judul: string
  kolom: string
  baris: { kode: string; nama: string; warna: string; perKanal: Record<string, number>; total: number }[]
  basis: number
  tanpaLabel?: number
  catatan: string
  kosong: string
}) {
  return (
    <div style={kartu}>
      <div style={judulKartu}>{judul}</div>
      <div style={gulir}>
        {baris.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--c-text-muted)', lineHeight: 1.7 }}>
            {kosong}
            {!!tanpaLabel && <> Ada <strong>{angka(tanpaLabel)}</strong> percakapan menunggu
            ditinjau di tab <strong>💬 Topik Percakapan</strong>.</>}
          </div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)', minWidth: 480 }}>
              <thead>
                <tr>
                  <th style={{ ...th, ...kiri }}>{kolom}</th>
                  {KANAL.map(k => <th key={k} style={th}>{NAMA_KANAL[k]}</th>)}
                  <th style={{ ...th, fontWeight: 800 }}>Total</th>
                  <th style={th}>% dari {angka(basis)} percakapan</th>
                </tr>
              </thead>
              <tbody>
                {baris.map(t => (
                  <tr key={t.kode}>
                    <td style={{ ...td, ...kiri }}>
                      <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: t.warna, marginRight: 7 }} />
                      {t.nama}
                    </td>
                    {KANAL.map(k => (
                      <td key={k} style={td}>{t.perKanal[k] ? angka(t.perKanal[k]) : '—'}</td>
                    ))}
                    <td style={{ ...td, fontWeight: 800 }}>{angka(t.total)}</td>
                    <td style={{ ...td, color: 'var(--c-text-muted)' }}>
                      {basis ? `${Math.round((t.total / basis) * 100)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 10, lineHeight: 1.6 }}>
              {catatan}
            </div>
          </>
        )}

        {/* Ditempel pada tabelnya, bukan disembunyikan di catatan kaki: tabel yang
            mencakup separuh percakapan dan dibaca seolah mencakup semuanya adalah
            cara paling mudah laporan ini menyesatkan. */}
        {!!tanpaLabel && baris.length > 0 && (
          <div style={{ marginTop: 10, background: '#FFFBEB', borderLeft: '3px solid #F59E0B', color: '#92400E', padding: '8px 12px', borderRadius: 'var(--r-sm)', fontSize: 12, lineHeight: 1.6 }}>
            <strong>{angka(tanpaLabel)} dari {angka(basis)} percakapan pada periode ini belum
            ditetapkan</strong> dan tidak ikut dihitung di tabel atas. Tinjau di tab
            💬 Topik Percakapan agar tabel ini utuh.
          </div>
        )}
      </div>
    </div>
  )
}
