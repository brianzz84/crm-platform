'use client'

/**
 * Bagian Google Bisnis pada tab Laporan.
 *
 * Berdiri sebagai komponen sendiri, bukan cabang di dalam LaporanTab: bentuk
 * datanya berbeda sama sekali dari laporan medsos — lokasi dan ulasan, bukan
 * konten dan format — dan memaksakannya ke satu struktur akan membuat keduanya
 * sama-sama sulit dibaca.
 */

import { Fragment, useCallback, useEffect, useState } from 'react'

interface BarisBulanLokasi {
  lokasi: string; judul: string; tayanganSearch: number; tayanganMaps: number
  permintaanRute: number; klikTelepon: number; klikWebsite: number
}
interface BarisBulan {
  bulan: string; tayanganSearch: number; tayanganMaps: number
  permintaanRute: number; klikTelepon: number; klikWebsite: number
  perLokasi: BarisBulanLokasi[]
}
interface BarisLokasi {
  lokasi: string; judul: string; tayangan: number; permintaanRute: number
  klikTelepon: number; klikWebsite: number; jumlahUlasan: number; rataRata: number | null
}
interface BarisUlasanBulan {
  bulan: string; jumlah: number; rataRata: number; dibalas: number
  bintang: { b1: number; b2: number; b3: number; b4: number; b5: number }
}
interface JedaBalasan {
  kurangSehari: number; satuTiga: number; empatTujuh: number; lebihTujuh: number; belum: number
}
interface Laporan {
  metrikSejak: string | null
  ulasanSejak: string | null
  bulanan: BarisBulan[]
  perLokasi: BarisLokasi[]
  ulasanBulan: BarisUlasanBulan[]
  jeda: JedaBalasan
  ringkas: {
    tayangan: number; permintaanRute: number; klikTelepon: number; klikWebsite: number
    ulasanBaru: number; rataRata: number | null; rendah: number; dibalas: number
    balasanDikirim: number; balasanUlasanLama: number
    totalUlasan: number; totalDibalas: number
  }
}

const angka = (n: number) => Math.round(n).toLocaleString('id-ID')
const NAMA_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const labelBulan = (b: string) => `${NAMA_BULAN[Number(b.slice(5, 7)) - 1] ?? b} ${b.slice(2, 4)}`

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
  padding: '8px 10px', fontSize: 13, textAlign: 'right',
  borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap',
}
const kiri: React.CSSProperties = { textAlign: 'left' }
const gulir: React.CSSProperties = { overflowX: 'auto', padding: 'var(--sp-4) var(--sp-5)' }

export default function LaporanGoogle({ slug, mulai, selesai }: { slug: string; mulai: string; selesai: string }) {
  const [data, setData]   = useState<Laporan | null>(null)
  const [buka, setBuka]   = useState<Set<string>>(new Set())
  const [muat, setMuat]   = useState(false)
  const [galat, setGalat] = useState('')

  const ambil = useCallback(async () => {
    setMuat(true); setGalat('')
    try {
      const q = new URLSearchParams({ kanal: 'GOOGLE', mulai, selesai })
      const res  = await fetch(`/api/${slug}/kanal-publik/laporan?${q}`)
      const json = await res.json()
      if (!json.success) { setGalat(json.error || 'Gagal memuat laporan'); return }
      setData(json.data)
    } catch { setGalat('Gagal menghubungi server') }
    finally { setMuat(false) }
  }, [slug, mulai, selesai])

  useEffect(() => { ambil() }, [ambil])

  // Baris yang terbuka dilupakan saat periode berganti — bulan yang sama belum
  // tentu ada pada periode berikutnya, dan menyisakannya membuat tabel terbuka
  // di tempat yang tidak diminta siapa pun.
  useEffect(() => { setBuka(new Set()) }, [mulai, selesai])

  const alih = (bulan: string) => setBuka(s => {
    const baru = new Set(s)
    if (baru.has(bulan)) baru.delete(bulan); else baru.add(bulan)
    return baru
  })

  if (galat) {
    return <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #EF4444' }}>{galat}</div>
  }
  if (muat && !data) return <div style={{ color: 'var(--c-text-muted)', fontSize: 13 }}>Menghitung…</div>
  if (!data) return null

  const r = data.ringkas
  // Responsivitas periode ini — dasar warna pita dan angka utama.
  const persenBalas = r.ulasanBaru > 0 ? (r.dibalas / r.ulasanBaru) * 100 : 0
  const semuaTerbuka = data.bulanan.length > 0 && data.bulanan.every(b => buka.has(b.bulan))

  // Metrik hanya sedalam kapan perekaman dimulai — berbeda dari ulasan yang
  // lengkap sejak listing dibuat. Dinyatakan, bukan digambar sebagai nol.
  const metrikKurang = !!data.metrikSejak && data.metrikSejak > mulai

  return (
    <div>
      {metrikKurang && (
        <div style={{ background: '#FFFBEB', borderLeft: '3px solid #F59E0B', color: '#92400E', padding: 'var(--sp-4)', borderRadius: 'var(--r-md)', fontSize: 13, lineHeight: 1.7, marginBottom: 'var(--sp-5)' }}>
          <strong>Metrik performa baru terekam sejak {data.metrikSejak}.</strong>{' '}
          Periode sebelum tanggal itu tidak ditampilkan sebagai nol, melainkan tidak ditampilkan
          sama sekali — Google hanya melayani sekitar 18 bulan ke belakang, dan yang lebih lama
          sudah hilang sebelum sempat direkam. Angka <strong>ulasan</strong> tidak terpengaruh:
          seluruh riwayatnya tersimpan sejak {data.ulasanSejak}.
        </div>
      )}

      {/* ── Ringkasan periode ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: 1, background: 'var(--c-border)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', marginBottom: 'var(--sp-5)' }}>
        {[
          { l: 'Total tayangan',   v: angka(r.tayangan) },
          { l: 'Permintaan rute',  v: angka(r.permintaanRute) },
          { l: 'Klik telepon',     v: angka(r.klikTelepon) },
          { l: 'Klik website',     v: angka(r.klikWebsite) },
          { l: 'Ulasan baru',      v: angka(r.ulasanBaru) },
          { l: 'Rata-rata bintang', v: r.rataRata != null ? r.rataRata.toFixed(2) : '—' },
        ].map(s => (
          <div key={s.l} style={{ background: 'white', padding: '10px 14px' }}>
            <div style={{ fontSize: 10, color: 'var(--c-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.l}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--c-primary)' }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* ── Responsivitas petugas ──
          Mengikuti PERIODE, bukan seluruh riwayat. Ini ukuran kinerja: tumpukan
          ulasan bertahun sebelum periode ini bukan pekerjaan petugas sekarang,
          dan memasukkannya membuat angkanya menghukum orang yang salah.
          Riwayat penuh tetap ditampilkan, tapi sebagai konteks — bukan judul. */}
      <div style={{
        ...kartu, padding: 'var(--sp-4) var(--sp-5)',
        borderLeft: `4px solid ${persenBalas < 25 ? '#DC2626' : persenBalas < 60 ? '#F59E0B' : '#16A34A'}`,
      }}>
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          <strong style={{ fontSize: 15 }}>
            {r.ulasanBaru > 0 ? `${persenBalas.toFixed(1)}% ulasan periode ini dibalas` : 'Tidak ada ulasan baru pada periode ini'}
          </strong>
          {r.ulasanBaru > 0 && <> — {angka(r.dibalas)} dari {angka(r.ulasanBaru)} ulasan yang masuk.</>}

          {/* Balasan ke ulasan lama tidak masuk hitungan di atas, padahal itu
              pekerjaan nyata. Ditampilkan terpisah supaya tidak hilang. */}
          <div style={{ marginTop: 6 }}>
            <strong>{angka(r.balasanDikirim)} balasan dikirim</strong> pada periode ini
            {r.balasanUlasanLama > 0 && (
              <>, <strong>{angka(r.balasanUlasanLama)}</strong> di antaranya untuk ulasan lama —
              pekerjaan membereskan tumpukan, yang tidak terhitung pada persentase di atas</>
            )}.
          </div>

          <div style={{ color: 'var(--c-text-muted)', fontSize: 12, marginTop: 6 }}>
            Persentase di atas mengukur respons terhadap ulasan yang <em>masuk pada periode ini</em>,
            sehingga menilai kinerja petugas sekarang — bukan warisan tahun-tahun sebelumnya.
            Sebagai konteks, sepanjang riwayat {angka(r.totalDibalas)} dari {angka(r.totalUlasan)} ulasan
            ({((r.totalDibalas / Math.max(r.totalUlasan, 1)) * 100).toFixed(1)}%) pernah dibalas.
          </div>
        </div>

        {/* Kecepatan membalas — diletakkan menempel pada angka responsivitas,
            karena "berapa banyak dibalas" dan "berapa cepat" adalah satu
            pertanyaan yang sama bagi orang yang menilai layanan. */}
        {r.ulasanBaru > 0 && (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--c-border)', paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
              Kecepatan membalas ulasan periode ini
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))', gap: 8 }}>
              {[
                { l: '< 1 hari',  v: data.jeda.kurangSehari, c: '#16A34A' },
                { l: '1–3 hari',  v: data.jeda.satuTiga,     c: '#65A30D' },
                { l: '4–7 hari',  v: data.jeda.empatTujuh,   c: '#B45309' },
                { l: '> 7 hari',  v: data.jeda.lebihTujuh,   c: '#DC2626' },
                { l: 'Belum dibalas', v: data.jeda.belum,    c: 'var(--c-text-muted)' },
              ].map(x => (
                <div key={x.l} style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: '8px 11px' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--c-text-muted)', fontWeight: 700 }}>{x.l}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: x.c }}>{angka(x.v)}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 8, lineHeight: 1.6 }}>
              Dihitung dari selisih waktu ulasan masuk dan balasan dikirim, hanya untuk ulasan yang
              masuk pada periode ini. Balasan ke ulasan lama tidak ikut di sini — jedanya bertahun
              dan akan menenggelamkan seluruh ember; pekerjaan itu terhitung pada baris di atas.
            </div>
          </div>
        )}
      </div>

      {/* ── Performa per bulan, bisa dibuka per profil ──
          Rincian dibuat sebagai baris yang membentang, BUKAN tooltip: laporan ini
          dicetak dan ditempel ke paparan, dan isi di balik hover tidak ikut
          terbawa — hilang justru saat laporannya dipakai. Selain itu hover tidak
          ada di layar sentuh, dan isi yang tersembunyi tidak bisa dibandingkan
          berdampingan, padahal justru itu gunanya angka per profil. */}
      {data.bulanan.length > 0 && (
        <div style={kartu}>
          <div style={{ ...judulKartu, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>Performa Google per Bulan</span>
            <button
              onClick={() => setBuka(semuaTerbuka ? new Set() : new Set(data.bulanan.map(b => b.bulan)))}
              style={{
                padding: '5px 12px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 11.5, fontWeight: 700, border: '1.5px solid var(--c-border)',
                background: 'white', color: 'var(--c-text-muted)',
              }}>
              {semuaTerbuka ? 'Tutup semua' : 'Buka semua profil'}
            </button>
          </div>
          <div style={gulir}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 660 }}>
              <thead>
                <tr>
                  <th style={{ ...th, ...kiri }}>Bulan</th>
                  <th style={th}>Tayangan Search</th>
                  <th style={th}>Tayangan Maps</th>
                  <th style={th}>Permintaan Rute</th>
                  <th style={th}>Klik Telepon</th>
                  <th style={th}>Klik Website</th>
                </tr>
              </thead>
              <tbody>
                {data.bulanan.map(b => {
                  const terbuka = buka.has(b.bulan)
                  return (
                    <Fragment key={b.bulan}>
                      <tr onClick={() => alih(b.bulan)}
                        style={{ cursor: 'pointer', background: terbuka ? '#F8FAFC' : undefined }}>
                        <td style={{ ...td, ...kiri, fontWeight: 700 }}>
                          <span style={{
                            display: 'inline-block', width: 13, color: 'var(--c-text-muted)',
                            transform: terbuka ? 'rotate(90deg)' : 'none', transition: 'transform .12s',
                          }}>›</span>
                          {labelBulan(b.bulan)}
                        </td>
                        <td style={td}>{angka(b.tayanganSearch)}</td>
                        <td style={td}>{angka(b.tayanganMaps)}</td>
                        <td style={td}>{angka(b.permintaanRute)}</td>
                        <td style={td}>{angka(b.klikTelepon)}</td>
                        <td style={td}>{angka(b.klikWebsite)}</td>
                      </tr>

                      {terbuka && b.perLokasi.map(l => (
                        <tr key={`${b.bulan}-${l.lokasi}`} style={{ background: '#F8FAFC' }}>
                          <td style={{ ...td, ...kiri, paddingLeft: 30, fontSize: 12, color: 'var(--c-text-muted)' }}>
                            {l.judul}
                          </td>
                          <td style={{ ...td, fontSize: 12 }}>{angka(l.tayanganSearch)}</td>
                          <td style={{ ...td, fontSize: 12 }}>{angka(l.tayanganMaps)}</td>
                          <td style={{ ...td, fontSize: 12 }}>{angka(l.permintaanRute)}</td>
                          <td style={{ ...td, fontSize: 12 }}>{angka(l.klikTelepon)}</td>
                          <td style={{ ...td, fontSize: 12 }}>{angka(l.klikWebsite)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '0 var(--sp-5) var(--sp-4)', fontSize: 11, color: 'var(--c-text-faint)', lineHeight: 1.6 }}>
            Angka pada baris bulan adalah jumlah ketujuh profil. Klik baris mana pun untuk
            membentangkan rinciannya per profil; urutan profil sama tiap bulan, jadi dua bulan yang
            dibuka bersamaan bisa dibandingkan langsung.
          </div>
        </div>
      )}

      {/* ── Per lokasi ── */}
      {data.perLokasi.length > 0 && (
        <div style={kartu}>
          <div style={judulKartu}>Performa per Profil Bisnis</div>
          <div style={gulir}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr>
                  <th style={{ ...th, ...kiri }}>Profil</th>
                  <th style={th}>Tayangan</th>
                  <th style={th}>Permintaan Rute</th>
                  <th style={th}>Klik Telepon</th>
                  <th style={th}>Klik Website</th>
                  <th style={th}>Ulasan</th>
                  <th style={th}>Rating</th>
                </tr>
              </thead>
              <tbody>
                {data.perLokasi.map(l => (
                  <tr key={l.lokasi}>
                    <td style={{ ...td, ...kiri, fontWeight: 700 }}>{l.judul}</td>
                    <td style={td}>{angka(l.tayangan)}</td>
                    <td style={td}>{angka(l.permintaanRute)}</td>
                    <td style={td}>{angka(l.klikTelepon)}</td>
                    <td style={td}>{angka(l.klikWebsite)}</td>
                    <td style={td}>{angka(l.jumlahUlasan)}</td>
                    <td style={{
                      ...td, fontWeight: 800,
                      color: l.rataRata == null ? 'var(--c-text-muted)'
                        : l.rataRata < 3.5 ? '#B91C1C' : l.rataRata < 4 ? '#B45309' : '#16A34A',
                    }}>
                      {l.rataRata != null ? l.rataRata.toFixed(2) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '0 var(--sp-5) var(--sp-4)', fontSize: 11, color: 'var(--c-text-faint)', lineHeight: 1.6 }}>
            Jumlah ulasan dan rating adalah keadaan terakhir, bukan penjumlahan harian — keduanya
            nilai berjalan, bukan kejadian per hari. Perbandingan tujuh profil berdampingan seperti
            ini tidak tersedia di Google Business Profile Manager, yang hanya menampilkan satu
            lokasi per layar.
          </div>
        </div>
      )}

      {/* ── Ulasan per bulan ── */}
      {data.ulasanBulan.length > 0 && (
        <div style={kartu}>
          <div style={judulKartu}>Ulasan per Bulan</div>
          <div style={gulir}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 660 }}>
              <thead>
                <tr>
                  <th style={{ ...th, ...kiri }}>Bulan</th>
                  <th style={th}>Ulasan Baru</th>
                  <th style={th}>Rata-rata</th>
                  <th style={{ ...th, color: '#16A34A' }}>5★</th>
                  <th style={th}>4★</th>
                  <th style={th}>3★</th>
                  <th style={th}>2★</th>
                  <th style={{ ...th, color: '#B91C1C' }}>1★</th>
                  <th style={th}>Dibalas</th>
                </tr>
              </thead>
              <tbody>
                {data.ulasanBulan.map(u => (
                  <tr key={u.bulan}>
                    <td style={{ ...td, ...kiri, fontWeight: 700 }}>{labelBulan(u.bulan)}</td>
                    <td style={td}>{angka(u.jumlah)}</td>
                    <td style={{
                      ...td, fontWeight: 700,
                      color: u.rataRata < 3.5 ? '#B91C1C' : u.rataRata < 4 ? '#B45309' : '#16A34A',
                    }}>{u.rataRata.toFixed(2)}</td>
                    {/* Nol ditampilkan pudar supaya angka yang ADA menonjol —
                        sebaran RKZ dua kutub, jadi kolom tengah kerap kosong. */}
                    <td style={{ ...td, color: u.bintang.b5 ? '#16A34A' : 'var(--c-border)', fontWeight: u.bintang.b5 ? 700 : 400 }}>{u.bintang.b5}</td>
                    <td style={{ ...td, color: u.bintang.b4 ? undefined : 'var(--c-border)' }}>{u.bintang.b4}</td>
                    <td style={{ ...td, color: u.bintang.b3 ? undefined : 'var(--c-border)' }}>{u.bintang.b3}</td>
                    <td style={{ ...td, color: u.bintang.b2 ? undefined : 'var(--c-border)' }}>{u.bintang.b2}</td>
                    <td style={{ ...td, color: u.bintang.b1 ? '#B91C1C' : 'var(--c-border)', fontWeight: u.bintang.b1 ? 800 : 400 }}>{u.bintang.b1}</td>
                    <td style={td}>{angka(u.dibalas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '0 var(--sp-5) var(--sp-4)', fontSize: 11, color: 'var(--c-text-faint)', lineHeight: 1.6 }}>
            <strong>Rata-rata</strong> adalah rata-rata bintang ulasan yang <em>masuk pada bulan itu</em> —
            bukan rating listing Anda. Rating yang tampil di Google adalah akumulasi sejak listing
            dibuat, jadi keduanya hampir selalu berbeda. <strong>Dibalas</strong> menghitung ulasan
            bulan itu yang sudah punya balasan, kapan pun balasannya dikirim.
          </div>
        </div>
      )}

      {data.bulanan.length === 0 && data.ulasanBulan.length === 0 && (
        <div style={{ ...kartu, padding: 'var(--sp-5)', color: 'var(--c-text-muted)', fontSize: 13 }}>
          Tidak ada data Google pada periode ini.
          {data.metrikSejak && <> Metrik baru terekam sejak {data.metrikSejak}.</>}
        </div>
      )}
    </div>
  )
}
