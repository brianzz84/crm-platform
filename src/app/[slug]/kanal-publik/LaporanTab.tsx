'use client'

import { useCallback, useEffect, useState } from 'react'
import LaporanGoogle from './LaporanGoogle'
import LaporanPercakapan from './LaporanPercakapan'

interface Sel { jumlah: number; jangkauan: number; interaksi: number; suka: number }
interface BarisAkun {
  bulan: string; jumlahKonten: number; jangkauan: number; tayangan: number
  interaksi: number; followerBaru: number; followerAkhir: number
  unfollow: number; pertumbuhanBersih: number; tautanProfil: number
  tayanganMedia: number; penontonUnik: number
}
interface BarisPerhatian {
  bulan: string; jumlahReels: number
  medianTontonMs: number | null; medianLajuLewat: number | null
}
interface Laporan {
  periode: { mulai: string; selesai: string }
  ringkasAkun: BarisAkun[]
  perhatianReels: BarisPerhatian[]
  metrikBaruSejak: string | null
  riwayatManual: {
    periode: string; urutan: number; sumber: string
    jumlahKonten: number; jangkauan: number; interaksi: number; follower: number
    perFormat: Record<string, number>
  }[]
  bulan: string[]
  format: string[]
  jumlahPerFormat: { format: string; perBulan: Record<string, number>; total: number }[]
  sifatFormatBulan: { sifat: string; nama: string; warna: string; sel: Record<string, Sel>; total: Sel }[]
  engagementSifat: { sifat: string; nama: string; warna: string; perFormat: Record<string, Sel>; total: Sel }[]
  teratasPerFormat: {
    format: string
    konten: { id: string; teks: string; tanggal: string; permalink: string; gambar: string
              jangkauan: number; tayangan: number; interaksi: number; sifat: string | null } | null
  }[]
  belumDitandai: number
  totalKonten: number
}

const angka = (n: number) => Math.round(n).toLocaleString('id-ID')
const NAMA_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const labelBulan = (b: string) => `${NAMA_BULAN[Number(b.slice(5, 7)) - 1] ?? b} ${b.slice(2, 4)}`

const kartu: React.CSSProperties = {
  background: 'var(--c-surface)', border: '1px solid var(--c-border)',
  borderRadius: 'var(--r-lg)', overflow: 'hidden', marginBottom: 'var(--sp-5)',
}
const judulKartu: React.CSSProperties = {
  padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)',
  fontWeight: 700, fontSize: 'var(--font-size-md)', color: 'var(--c-primary)',
}
const th: React.CSSProperties = {
  padding: '7px 10px', fontSize: 11, fontWeight: 700, color: 'var(--c-text-muted)',
  textAlign: 'right', borderBottom: '1.5px solid var(--c-border)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  padding: '7px 10px', fontSize: 12, textAlign: 'right',
  borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap',
}
const kiri: React.CSSProperties = { textAlign: 'left' }

/** Tabel lebar harus bisa digeser sendiri — bukan memaksa seluruh halaman ikut melebar. */
const gulir: React.CSSProperties = { overflowX: 'auto', padding: 'var(--sp-4) var(--sp-5)' }

export default function LaporanTab(
  { slug, mulai, selesai, kanalAwal }:
  { slug: string; mulai: string; selesai: string; kanalAwal?: 'IG' | 'FB' | 'YOUTUBE' | 'GOOGLE' | 'PERCAKAPAN' },
) {
  // Dipakai saat pengguna datang dari tab Google Bisnis: ia sudah menyatakan
  // saluran mana yang dimaksud, jadi mendaratkannya di Instagram akan memaksa
  // satu klik yang tak ada gunanya. Komponen ini di-unmount tiap ganti tab,
  // sehingga nilai awal ini terbaca ulang tiap kali dibuka.
  const [kanal, setKanal] = useState<'IG' | 'FB' | 'YOUTUBE' | 'GOOGLE' | 'PERCAKAPAN'>(kanalAwal ?? 'IG')
  const [data, setData]   = useState<Laporan | null>(null)
  const [muat, setMuat]   = useState(false)
  const [galat, setGalat] = useState('')

  const ambil = useCallback(async () => {
    // Google dirender komponennya sendiri dengan bentuk data yang berbeda, jadi
    // permintaan ke endpoint medsos di sini justru akan salah sasaran.
    if (kanal === 'GOOGLE' || kanal === 'PERCAKAPAN') { setData(null); setGalat(''); return }
    setMuat(true); setGalat('')
    try {
      const q = new URLSearchParams({ kanal, mulai, selesai })
      const res  = await fetch(`/api/${slug}/kanal-publik/laporan?${q}`)
      const json = await res.json()
      if (!json.success) { setGalat(json.error || 'Gagal memuat laporan'); return }
      setData(json.data)
    } catch { setGalat('Gagal menghubungi server') }
    finally { setMuat(false) }
  }, [slug, kanal, mulai, selesai])

  useEffect(() => { ambil() }, [ambil])

  /**
   * Warna khas tiap saluran.
   *
   * Sebelumnya semua tombol aktif berwarna teal yang sama, sehingga saluran yang
   * sedang dibuka tidak terbaca tanpa mengeja tulisannya. Titik warna tetap
   * tampil walau tombolnya tidak aktif, supaya keempatnya bisa dikenali sekaligus.
   */
  const WARNA_KANAL: Record<string, string> = {
    IG:      '#C13584',
    FB:      '#1877F2',
    YOUTUBE: '#FF0000',
    GOOGLE:  '#188038',
    PERCAKAPAN: '#475569',
  }

  const KANAL: { k: typeof kanal; label: string }[] = [
    { k: 'IG',      label: 'Instagram' },
    { k: 'FB',      label: 'Facebook' },
    { k: 'YOUTUBE', label: 'YouTube' },
    { k: 'GOOGLE',  label: 'Google Bisnis' },
    // Percakapan ditaruh terakhir dan sengaja dibedakan: keempat yang lain adalah
    // SALURAN tempat konten terbit, sedangkan ini melintasi semuanya — isinya
    // orang yang menghubungi, bukan konten yang diterbitkan.
    { k: 'PERCAKAPAN', label: 'Percakapan' },
  ]

  return (
    <div>
      {/* Kontrol TERSEGMEN, bukan empat tombol terpisah: keempatnya satu pilihan,
          dan bentuk menyatu inilah idiom yang menyatakan "pilih salah satu".
          Sebelumnya mereka tampak sama persis dengan tombol aksi lain di halaman,
          sehingga tak ada yang memberi tahu bahwa ini pemilih saluran. */}
      <div style={{ ...kartu, padding: 'var(--sp-4) var(--sp-5)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--c-text-muted)' }}>
          Saluran
        </span>
        <div role="tablist" aria-label="Pilih saluran laporan" style={{
          display: 'inline-flex', padding: 3, gap: 2, borderRadius: 10,
          background: 'var(--c-bg)', border: '1px solid var(--c-border)', flexWrap: 'wrap',
        }}>
          {KANAL.map(t => {
            const aktif = kanal === t.k
            const warna = WARNA_KANAL[t.k]
            return (
              <button key={t.k} role="tab" aria-selected={aktif} onClick={() => setKanal(t.k)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12.5, fontWeight: aktif ? 800 : 600,
                  background: aktif ? 'white' : 'transparent',
                  color: aktif ? warna : 'var(--c-text-muted)',
                  boxShadow: aktif ? '0 1px 3px rgba(15,23,42,.16)' : 'none',
                }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: warna, opacity: aktif ? 1 : .45,
                }} />
                {t.label}
              </button>
            )
          })}
        </div>
        <span style={{ fontSize: 11, color: 'var(--c-text-faint)', marginLeft: 'auto' }}>
          {mulai} s/d {selesai} · dihitung dari data snapshot
        </span>
      </div>

      {galat && (
        <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #EF4444', marginBottom: 'var(--sp-4)' }}>{galat}</div>
      )}
      {muat && <div style={{ color: 'var(--c-text-muted)', fontSize: 13, marginBottom: 12 }}>Menghitung…</div>}

      {kanal === 'GOOGLE' && <LaporanGoogle slug={slug} mulai={mulai} selesai={selesai} />}
      {kanal === 'PERCAKAPAN' && <LaporanPercakapan slug={slug} mulai={mulai} selesai={selesai} />}

      {data && kanal !== 'GOOGLE' && kanal !== 'PERCAKAPAN' && (
        <>
          {data.belumDitandai > 0 && kanal !== 'YOUTUBE' && (
            <div style={{ background: '#FFFBEB', borderLeft: '3px solid #F59E0B', color: '#92400E', padding: 'var(--sp-4)', borderRadius: 'var(--r-md)', fontSize: 13, lineHeight: 1.7, marginBottom: 'var(--sp-5)' }}>
              <strong>{data.belumDitandai} dari {data.totalKonten} konten belum bertanda sifat.</strong>{' '}
              Tabel sifat di bawah belum menggambarkan keadaan sebenarnya sampai penandaan selesai —
              angkanya bukan salah, tapi belum lengkap. Baris <em>(Belum ditandai)</em> sengaja
              ditampilkan agar Grand Total tetap cocok dengan jumlah konten, alih-alih menyembunyikan
              selisih yang sulit ditelusuri belakangan.
            </div>
          )}

          {/* ── Tabel pembuka: ringkasan akun ── */}
          {data.ringkasAkun.length > 0 && (
            <div style={kartu}>
              <div style={judulKartu}>Ringkasan Akun per Bulan</div>
              <div style={gulir}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
                  <thead><tr>
                    <th style={{ ...th, ...kiri }}>Bulan</th>
                    <th style={th}>Unggahan</th>
                    <th style={th}>Jangkauan</th>
                    <th style={th}>Tayangan</th>
                    <th style={th}>Interaksi</th>
                    <th style={th}>Pengikut Baru</th>
                    <th style={th}>Berhenti</th>
                    <th style={th}>Bersih</th>
                    {kanal === 'IG' && <th style={th}>Ketuk Tautan</th>}
                    {kanal === 'FB' && <th style={th}>Tayangan Media</th>}
                    {kanal === 'FB' && <th style={th}>Penonton Unik</th>}
                    <th style={th}>Pengikut Akhir</th>
                  </tr></thead>
                  <tbody>
                    {data.ringkasAkun.map(r => {
                      const totalRow = r.bulan === 'TOTAL'
                      const gaya: React.CSSProperties = totalRow
                        ? { ...td, fontWeight: 800, background: 'var(--c-bg)' } : td
                      return (
                        <tr key={r.bulan}>
                          <td style={{ ...gaya, ...kiri }}>{totalRow ? 'TOTAL' : labelBulan(r.bulan)}</td>
                          <td style={gaya}>{r.jumlahKonten || '–'}</td>
                          <td style={gaya}>{angka(r.jangkauan)}</td>
                          <td style={gaya}>{angka(r.tayangan)}</td>
                          <td style={gaya}>{angka(r.interaksi)}</td>
                          <td style={gaya}>{angka(r.followerBaru)}</td>
                          <td style={{ ...gaya, color: r.unfollow ? '#B91C1C' : 'var(--c-text-faint)' }}>
                            {r.unfollow ? angka(r.unfollow) : '–'}
                          </td>
                          <td style={{ ...gaya, fontWeight: 800, color: r.pertumbuhanBersih < 0 ? '#B91C1C' : 'var(--c-text)' }}>
                            {angka(r.pertumbuhanBersih)}
                          </td>
                          {kanal === 'IG' && <td style={gaya}>{r.tautanProfil ? angka(r.tautanProfil) : '–'}</td>}
                          {kanal === 'FB' && <td style={gaya}>{r.tayanganMedia ? angka(r.tayanganMedia) : '–'}</td>}
                          {kanal === 'FB' && <td style={gaya}>{r.penontonUnik ? angka(r.penontonUnik) : '–'}</td>}
                          <td style={{ ...gaya, color: 'var(--c-text-muted)' }}>{angka(r.followerAkhir)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {/* Kolom baru kosong untuk periode lampau karena kolomnya memang belum
                  ada saat itu — bukan karena tidak ada kejadiannya. Perbedaan itu
                  harus dinyatakan, bukan disimpulkan sendiri oleh pembaca. */}
              {data.metrikBaruSejak && (
                <div style={{ margin: '0 var(--sp-5) var(--sp-4)', background: '#FFFBEB', borderLeft: '3px solid #F59E0B', color: '#92400E', padding: '8px 12px', borderRadius: 'var(--r-sm)', fontSize: 12, lineHeight: 1.6 }}>
                  Kolom <strong>Berhenti</strong>, <strong>Bersih</strong>
                  {kanal === 'IG' && <>, <strong>Ketuk Tautan</strong></>}
                  {kanal === 'FB' && <>, <strong>Tayangan Media</strong>, <strong>Penonton Unik</strong></>}
                  {' '}baru mulai direkam <strong>{data.metrikBaruSejak}</strong>. Bulan sebelum itu
                  tampil kosong karena datanya memang belum pernah diambil — bukan karena angkanya nol.
                </div>
              )}

              <p style={{ margin: 0, padding: '0 var(--sp-5) var(--sp-5)', fontSize: 11, color: 'var(--c-text-faint)', lineHeight: 1.6 }}>
                <strong>Pengikut Akhir tidak dijumlahkan</strong> — ia keadaan pada hari terakhir tiap
                bulan, bukan sesuatu yang bertambah tiap hari. Baris TOTAL karena itu menampilkan
                nilai bulan terakhir, bukan hasil penjumlahan kolomnya.
                {kanal === 'YOUTUBE' && ' Kolom kosong pada YouTube memang tidak disediakan API-nya di tingkat akun.'}
              </p>
            </div>
          )}

          {kanal === 'YOUTUBE' && (
            <div style={{ background: '#EFF6FF', borderLeft: '3px solid #3B82F6', color: '#1E40AF', padding: 'var(--sp-4)', borderRadius: 'var(--r-md)', fontSize: 13, lineHeight: 1.7, marginBottom: 'var(--sp-5)' }}>
              YouTube dilaporkan di <strong>tingkat akun saja</strong>. Performa tiap video sengaja
              tidak disalin ke sini karena YouTube Analytics bisa ditanya per rentang tanggal kapan pun —
              menyalinnya hanya menduplikasi tanpa menambah kemampuan. Untuk konten per video, gunakan tab YouTube.
            </div>
          )}

          {data.perhatianReels?.length > 0 && (
            <div style={kartu}>
              <div style={judulKartu}>Perhatian pada Reels</div>
              <div style={gulir}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 420 }}>
                  <thead><tr>
                    <th style={{ ...th, ...kiri }}>Bulan</th>
                    <th style={th}>Reels</th>
                    <th style={th}>Median Tonton</th>
                    <th style={th}>Median Dilewati</th>
                  </tr></thead>
                  <tbody>
                    {data.perhatianReels.map(r => (
                      <tr key={r.bulan}>
                        <td style={{ ...td, ...kiri }}>{labelBulan(r.bulan)}</td>
                        <td style={td}>{r.jumlahReels}</td>
                        <td style={td}>
                          {r.medianTontonMs != null ? `${(r.medianTontonMs / 1000).toFixed(1)} dtk` : '–'}
                        </td>
                        <td style={{ ...td, color: (r.medianLajuLewat ?? 0) > 60 ? '#B91C1C' : 'var(--c-text)' }}>
                          {r.medianLajuLewat != null ? `${r.medianLajuLewat.toFixed(1)}%` : '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ margin: 0, padding: '0 var(--sp-5) var(--sp-5)', fontSize: 11, color: 'var(--c-text-faint)', lineHeight: 1.6 }}>
                Menjawab yang tidak bisa dijawab jangkauan: <strong>apakah orang bertahan menonton</strong>.
                Reels dengan tayangan besar tetapi ditinggalkan di detik-detik awal bukan konten yang berhasil.
                Dipakai <strong>median</strong>, bukan rata-rata — satu Reels yang ditonton tuntas oleh sedikit
                orang tidak boleh menggeser gambaran seluruh bulan. Hanya Reels yang punya angka ini;
                Foto dan Carousel tidak mendukungnya.
              </p>
            </div>
          )}

          {/* ── Riwayat dari laporan manual ──
              Sengaja kartu TERPISAH dengan warna berbeda: sumbernya lain, tidak
              bisa diverifikasi ulang ke Meta, dan tidak akan pernah berubah.
              Menyatukannya dengan tabel snapshot akan menyiratkan jaminan yang
              sama padahal tidak. */}
          {data.riwayatManual.length > 0 && (
            <div style={{ ...kartu, borderColor: '#C4B5FD', background: '#FAF5FF' }}>
              <div style={{ ...judulKartu, borderColor: '#DDD6FE', color: '#6D28D9', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                📄 Triwulan Lampau — dari laporan manual
                <span style={{ fontSize: 10, fontWeight: 700, background: '#EDE9FE', color: '#6D28D9', padding: '2px 8px', borderRadius: 4 }}>
                  BUKAN DATA SNAPSHOT
                </span>
              </div>
              <div style={gulir}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}>
                  <thead><tr>
                    <th style={{ ...th, ...kiri }}>Periode</th>
                    <th style={th}>Unggahan</th>
                    <th style={th}>Jangkauan</th>
                    <th style={th}>Interaksi</th>
                    <th style={th}>Pengikut Baru</th>
                    {Object.keys(data.riwayatManual[0]?.perFormat ?? {}).map(f => (
                      <th key={f} style={th}>{f}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {data.riwayatManual.map(r => (
                      <tr key={r.periode}>
                        <td style={{ ...td, ...kiri, fontWeight: 700, color: '#6D28D9' }}>{r.periode}</td>
                        <td style={td}>{r.jumlahKonten || '–'}</td>
                        <td style={td}>{r.jangkauan ? angka(r.jangkauan) : '–'}</td>
                        <td style={td}>{r.interaksi ? angka(r.interaksi) : '–'}</td>
                        <td style={td}>{r.follower ? angka(r.follower) : '–'}</td>
                        {Object.keys(data.riwayatManual[0]?.perFormat ?? {}).map(f => (
                          <td key={f} style={td}>{r.perFormat[f] ?? '–'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ margin: 0, padding: '0 var(--sp-5) var(--sp-5)', fontSize: 11, color: '#6D28D9', lineHeight: 1.6 }}>
                Diketik ulang dari <strong>{data.riwayatManual[0]?.sumber}</strong>. Periode ini sudah
                jauh melewati jendela riwayat yang disediakan Meta, jadi angkanya <strong>tidak bisa
                diverifikasi ulang</strong> ke sumber aslinya dan <strong>tidak akan berubah</strong> —
                berbeda dari tabel putih di atas yang ditarik ulang tiap malam dan ikut berubah bila
                Meta merevisi. Tanda ✕ berarti angka itu memang tidak dicatat di laporan aslinya.
              </p>
            </div>
          )}

          {/* ── Jumlah konten per format ── */}
          {kanal !== 'YOUTUBE' && (
          <>
          <div style={kartu}>
            <div style={judulKartu}>Jumlah Konten Berdasarkan Format</div>
            <div style={gulir}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 420 }}>
                <thead><tr>
                  <th style={{ ...th, ...kiri }}>Format</th>
                  {data.bulan.map(b => <th key={b} style={th}>{labelBulan(b)}</th>)}
                  <th style={th}>Total</th>
                </tr></thead>
                <tbody>
                  {data.jumlahPerFormat.map(r => (
                    <tr key={r.format}>
                      <td style={{ ...td, ...kiri, fontWeight: 600 }}>{r.format}</td>
                      {data.bulan.map(b => <td key={b} style={td}>{r.perBulan[b] || '–'}</td>)}
                      <td style={{ ...td, fontWeight: 800, color: 'var(--c-primary)' }}>{r.total}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...td, ...kiri, fontWeight: 800 }}>Grand Total</td>
                    {data.bulan.map(b => (
                      <td key={b} style={{ ...td, fontWeight: 800 }}>
                        {data.jumlahPerFormat.reduce((s, r) => s + (r.perBulan[b] || 0), 0)}
                      </td>
                    ))}
                    <td style={{ ...td, fontWeight: 800, color: 'var(--c-primary)' }}>{data.totalKonten}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Sifat × bulan × format ── */}
          <div style={kartu}>
            <div style={judulKartu}>Jumlah Unggahan Berdasarkan Sifat dan Format</div>
            <div style={gulir}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, ...kiri }} rowSpan={2}>Sifat</th>
                    {data.bulan.map(b => (
                      <th key={b} style={{ ...th, textAlign: 'center', borderLeft: '1px solid var(--c-border)' }} colSpan={data.format.length}>
                        {labelBulan(b)}
                      </th>
                    ))}
                    <th style={th} rowSpan={2}>Total</th>
                  </tr>
                  <tr>
                    {data.bulan.flatMap(b => data.format.map((f, i) => (
                      <th key={b + f} style={{ ...th, fontWeight: 500, borderLeft: i === 0 ? '1px solid var(--c-border)' : 'none' }}>{f}</th>
                    )))}
                  </tr>
                </thead>
                <tbody>
                  {data.sifatFormatBulan.map(r => (
                    <tr key={r.sifat || 'kosong'}>
                      <td style={{ ...td, ...kiri }}>
                        <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: r.warna, marginRight: 7 }} />
                        {r.nama}
                      </td>
                      {data.bulan.flatMap(b => data.format.map((f, i) => (
                        <td key={b + f} style={{ ...td, borderLeft: i === 0 ? '1px solid var(--c-border)' : 'none' }}>
                          {r.sel[`${b}|${f}`]?.jumlah || '–'}
                        </td>
                      )))}
                      <td style={{ ...td, fontWeight: 800, color: 'var(--c-primary)' }}>{r.total.jumlah}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Engagement per sifat ── */}
          <div style={kartu}>
            <div style={judulKartu}>Interaksi Berdasarkan Sifat dan Format</div>
            <div style={gulir}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}>
                <thead><tr>
                  <th style={{ ...th, ...kiri }}>Sifat</th>
                  {data.format.map(f => <th key={f} style={th}>{f}</th>)}
                  <th style={th}>Total</th>
                  <th style={th}>Jangkauan</th>
                </tr></thead>
                <tbody>
                  {data.engagementSifat.map(r => (
                    <tr key={r.sifat || 'kosong'}>
                      <td style={{ ...td, ...kiri }}>
                        <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: r.warna, marginRight: 7 }} />
                        {r.nama}
                      </td>
                      {data.format.map(f => <td key={f} style={td}>{r.perFormat[f] ? angka(r.perFormat[f].interaksi) : '–'}</td>)}
                      <td style={{ ...td, fontWeight: 800, color: 'var(--c-primary)' }}>{angka(r.total.interaksi)}</td>
                      <td style={{ ...td, color: 'var(--c-text-muted)' }}>{angka(r.total.jangkauan)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Top content ── */}
          <div style={kartu}>
            <div style={judulKartu}>Konten Terbaik Tiap Format</div>
            <div style={{ padding: '10px var(--sp-5)', fontSize: 11, color: 'var(--c-text-muted)', borderBottom: '1px solid var(--c-border)', lineHeight: 1.6 }}>
              Dipilih berdasarkan jangkauan. Perlu diingat konten yang terbit di akhir periode punya
              waktu lebih singkat untuk mengumpulkan angka dibanding yang terbit di awal.
            </div>
            {data.teratasPerFormat.filter(t => t.konten).map(t => (
              <div key={t.format} style={{ display: 'flex', gap: 12, padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)', alignItems: 'flex-start' }}>
                {t.konten!.gambar
                  ? <img src={t.konten!.gambar} alt="" loading="lazy" referrerPolicy="no-referrer"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                      style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6, flexShrink: 0, background: 'var(--c-bg)' }} />
                  : <div style={{ width: 52, height: 52, borderRadius: 6, background: 'var(--c-bg)', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t.format}</div>
                  <div style={{ fontSize: 13, color: 'var(--c-text)', margin: '2px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {t.konten!.teks || <em style={{ color: 'var(--c-text-muted)' }}>tanpa keterangan</em>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>
                    {t.konten!.tanggal}{t.konten!.sifat ? ` · ${t.konten!.sifat}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, fontSize: 12 }}>
                  <div><strong>{angka(t.konten!.jangkauan)}</strong> jangkauan</div>
                  <div style={{ color: 'var(--c-text-muted)' }}>{angka(t.konten!.tayangan)} tayangan</div>
                  <div style={{ color: 'var(--c-text-muted)' }}>{angka(t.konten!.interaksi)} interaksi</div>
                </div>
              </div>
            ))}
          </div>
          </>
          )}
        </>
      )}
    </div>
  )
}
