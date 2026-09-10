'use client'

/**
 * Ringkasan sebutan publik — angka untuk dibaca, bukan daftar untuk dikerjakan.
 *
 * SATU ATURAN MENENTUKAN SELURUH BENTUK HALAMAN INI: angka di sini hanya berasal
 * dari label yang SUDAH DITETAPKAN MANUSIA. Karena itu cakupan tidak boleh
 * disembunyikan. Ringkasan yang menyatakan "3 keluhan publik" sementara 400
 * sebutan lain belum ditinjau bukan ringkasan yang optimis — ia salah, dan
 * pembacanya tidak punya cara mengetahuinya.
 *
 * Maka: selama cakupan di bawah 60%, angka-angkanya diredupkan dan diberi
 * peringatan di atas. Bukan disembunyikan — orang tetap perlu melihat bahwa
 * mekanismenya bekerja — tetapi juga tidak disajikan seolah kesimpulan.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  NAMA_SUMBER, WARNA_SUMBER, WARNA_SENTIMEN, WARNA_RISIKO,
  angka, tanggal, kartu,
} from './tampilan'

interface Hitungan { kode: string; jumlah: number }
interface Sorot {
  id: string; sumber: string; username: string | null
  teks: string; tautan: string | null; terbitPada: string
}
interface Data {
  dari: string; sampai: string
  total: number; belumDitinjau: number; persenDitinjau: number
  perSumber: { sumber: string; jumlah: number }[]
  topik: Hitungan[]; sentimen: Hitungan[]; unit: Hitungan[]; risiko: Hitungan[]
  akun: { username: string; jumlah: number }[]
  sorot: Sorot[]
}

interface Kategori { kode: string; nama: string; warna: string }

/** Ambang tempat angka berhenti disebut kesimpulan. 60% bukan nilai keramat —
 *  ia sekadar titik ketika mayoritas sudah diperiksa, dan bisa digeser bila
 *  ternyata terlalu longgar. */
const AMBANG_CAKUPAN = 60

const RENTANG: { label: string; hari: number | null }[] = [
  { label: '30 hari',  hari: 30 },
  { label: '90 hari',  hari: 90 },
  { label: '1 tahun',  hari: 365 },
  { label: 'Sejak awal', hari: null },
]

export default function RingkasanTab({ slug, topik, poli }: {
  slug: string; topik: Kategori[]; poli: Kategori[]
}) {
  const [hari, setHari] = useState<number | null>(90)
  const [data, setData] = useState<Data | null>(null)
  const [muat, setMuat] = useState(true)
  const [galat, setGalat] = useState('')

  const ambil = useCallback(async () => {
    setMuat(true); setGalat('')
    try {
      const q = new URLSearchParams()
      if (hari) q.set('dari', new Date(Date.now() - hari * 86_400_000).toISOString())
      // 'Sejak awal' tidak mengirim `dari` sama sekali — API akan memakai
      // bawaannya, jadi ia harus dipaksa ke tanggal yang benar-benar awal.
      else q.set('dari', '2015-01-01T00:00:00.000Z')
      const res  = await fetch(`/api/${slug}/sebutan/ringkasan?${q}`)
      const json = await res.json()
      if (!json.success) { setGalat(json.error ?? 'Gagal memuat ringkasan.'); return }
      setData(json)
    } catch { setGalat('Gagal menghubungi server.') }
    finally { setMuat(false) }
  }, [slug, hari])

  useEffect(() => { ambil() }, [ambil])

  const namaTopik = (k: string) => topik.find(t => t.kode === k)?.nama ?? k
  const warnaTopik = (k: string) => topik.find(t => t.kode === k)?.warna ?? '#94A3B8'
  const namaPoli  = (k: string) => poli.find(p => p.kode === k)?.nama ?? k
  const warnaPoli = (k: string) => poli.find(p => p.kode === k)?.warna ?? '#94A3B8'

  const cukup = (data?.persenDitinjau ?? 0) >= AMBANG_CAKUPAN
  // Diredupkan, bukan disembunyikan — lihat catatan di kepala berkas.
  const redup: React.CSSProperties = cukup ? {} : { opacity: .55 }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--sp-3)', flexWrap: 'wrap' }}>
        {RENTANG.map(r => (
          <button key={r.label} onClick={() => setHari(r.hari)} style={pil(hari === r.hari)}>
            {r.label}
          </button>
        ))}
      </div>

      {galat && (
        <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #EF4444', marginBottom: 'var(--sp-3)' }}>{galat}</div>
      )}

      {muat ? (
        <div style={{ color: 'var(--c-text-muted)', fontSize: 'var(--font-size-sm)' }}>Memuat…</div>
      ) : !data ? null : data.total === 0 ? (
        <div style={{ ...kartu, color: 'var(--c-text-muted)', fontSize: 13, lineHeight: 1.7 }}>
          Tidak ada sebutan pada rentang ini. Coba perlebar rentangnya, atau tarik
          sebutan lebih dulu dari tab <strong>Peninjauan</strong>.
        </div>
      ) : (
        <>
          <div style={kartu}>
            <div style={{ display: 'flex', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
              <Angka label="Sebutan pada rentang" nilai={angka(data.total)} warna="var(--c-primary)" />
              <Angka label="Sudah ditinjau" nilai={`${data.persenDitinjau}%`}
                warna={cukup ? 'var(--c-success)' : '#B45309'} />
              <Angka label="Belum ditinjau" nilai={angka(data.belumDitinjau)}
                warna={data.belumDitinjau ? '#B45309' : 'var(--c-success)'} />
              <Angka label="Rentang"
                nilai={`${tanggal(data.dari)} – ${tanggal(data.sampai)}`} warna="var(--c-text-muted)" kecil />
            </div>

            {!cukup && (
              <div style={{ marginTop: 'var(--sp-4)', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 'var(--r-md)', padding: '12px 14px', fontSize: 13, color: '#92400E', lineHeight: 1.65 }}>
                <strong>Angka di bawah belum bisa dijadikan kesimpulan.</strong> Baru{' '}
                {data.persenDitinjau}% sebutan pada rentang ini yang labelnya ditetapkan,
                jadi setiap hitungan di bawah adalah <em>batas bawah</em> — bukan jumlah
                sebenarnya. Selesaikan peninjauan di tab sebelah lebih dulu; angka ini akan
                menyesuaikan sendiri.
              </div>
            )}
          </div>

          {/* Yang menuntut tindakan diletakkan PALING ATAS, sebelum grafik apa pun.
              Ringkasan yang mengubur satu tuduhan malapraktik di bawah lima diagram
              sudah gagal sebagai ringkasan. */}
          {data.sorot.length > 0 && (
            <div style={{ ...kartu, borderLeft: '4px solid #DC2626' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#B91C1C', marginBottom: 4 }}>
                ⚠ Perlu ditangani ({angka(data.sorot.length)})
              </div>
              <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 'var(--sp-3)' }}>
                Sebutan yang ditetapkan berisiko <strong>TINGGI</strong>.
              </div>
              <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
                {data.sorot.map(s => (
                  <div key={s.id} style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: 'white', background: WARNA_SUMBER[s.sumber] ?? '#64748B', padding: '2px 7px', borderRadius: 4 }}>
                        {NAMA_SUMBER[s.sumber] ?? s.sumber}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>@{s.username ?? '—'}</span>
                      <span style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>{tanggal(s.terbitPada)}</span>
                      {s.tautan && (
                        <a href={s.tautan} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, color: 'var(--c-secondary)', textDecoration: 'none' }}>buka ↗</a>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--c-text)', lineHeight: 1.55, wordBreak: 'break-word' }}>{s.teks}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={redup}>
            <div style={{ display: 'grid', gap: 'var(--sp-4)', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' }}>
              <Panel judul="Sentimen">
                <Batang daftar={data.sentimen.map(d => ({
                  ...d, nama: d.kode, warna: WARNA_SENTIMEN[d.kode] ?? '#64748B',
                }))} />
              </Panel>

              <Panel judul="Risiko">
                <Batang daftar={data.risiko.map(d => ({
                  ...d, nama: d.kode, warna: WARNA_RISIKO[d.kode] ?? '#64748B',
                }))} />
              </Panel>

              <Panel judul="Kategori">
                <Batang daftar={data.topik.map(d => ({
                  ...d, nama: namaTopik(d.kode), warna: warnaTopik(d.kode),
                }))} />
              </Panel>

              <Panel judul="Poli / layanan yang disinggung"
                catatan="Sebagian besar sebutan tidak menyangkut bidang layanan mana pun — mitra, liputan, dan spam biasanya kosong.">
                <Batang daftar={data.unit.map(d => ({
                  ...d, nama: namaPoli(d.kode), warna: warnaPoli(d.kode),
                }))} />
              </Panel>

              {/* Tidak diredupkan bersama yang lain: jumlah per sumber dan akun
                  penyebut dihitung dari sebutannya sendiri, bukan dari label —
                  jadi angkanya sudah utuh berapa pun cakupan peninjauannya. */}
              <div style={{ opacity: 1 }}>
                <Panel judul="Sumber" catatan="Dihitung dari sebutannya sendiri — tidak tergantung peninjauan.">
                  <Batang daftar={data.perSumber.map(d => ({
                    kode: d.sumber, jumlah: d.jumlah,
                    nama: NAMA_SUMBER[d.sumber] ?? d.sumber,
                    warna: WARNA_SUMBER[d.sumber] ?? '#64748B',
                  }))} />
                </Panel>
              </div>

              <div style={{ opacity: 1 }}>
                <Panel judul="Akun yang paling sering menyebut"
                  catatan="Termasuk akun yang menandai demi jangkauan semata — periksa kategorinya sebelum menyimpulkan ini mitra.">
                  <Batang daftar={data.akun.map(a => ({
                    kode: a.username, jumlah: a.jumlah,
                    nama: `@${a.username}`, warna: '#0089A8',
                  }))} />
                </Panel>
              </div>
            </div>
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

function Angka({ label, nilai, warna, kecil }: {
  label: string; nilai: string; warna: string; kecil?: boolean
}) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
      <div style={{ fontSize: kecil ? 13 : 20, fontWeight: 800, color: warna, marginTop: kecil ? 4 : 0 }}>{nilai}</div>
    </div>
  )
}

function Panel({ judul, catatan, children }: {
  judul: string; catatan?: string; children: React.ReactNode
}) {
  return (
    <div style={{ ...kartu, marginBottom: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--c-text)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{judul}</div>
      {catatan && (
        <div style={{ fontSize: 11, color: 'var(--c-text-faint)', lineHeight: 1.55, margin: '4px 0 0' }}>{catatan}</div>
      )}
      <div style={{ marginTop: 'var(--sp-3)' }}>{children}</div>
    </div>
  )
}

/**
 * Batang horizontal, bukan diagram lingkaran.
 *
 * Panjang batang dibandingkan terhadap NILAI TERBESAR, bukan terhadap total.
 * Disandingkan dengan total, kategori yang jarang akan menjadi garis setipis
 * rambut dan namanya tak terbaca — padahal justru kategori jarang (keluhan,
 * risiko tinggi) yang paling perlu terlihat. Angka aslinya tetap tertulis di
 * kanan, jadi tidak ada yang tersesat oleh panjangnya.
 */
function Batang({ daftar }: {
  daftar: { kode: string; nama: string; jumlah: number; warna: string }[]
}) {
  if (!daftar.length) {
    return <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>Belum ada yang ditetapkan.</div>
  }
  const puncak = Math.max(...daftar.map(d => d.jumlah), 1)
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {daftar.map(d => (
        <div key={d.kode} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: '0 0 40%', fontSize: 12, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.nama}>
            {d.nama}
          </div>
          <div style={{ flex: 1, background: 'var(--c-bg-subtle,#F1F5F9)', borderRadius: 999, height: 14, overflow: 'hidden' }}>
            <div style={{ width: `${(d.jumlah / puncak) * 100}%`, background: d.warna, height: '100%', borderRadius: 999 }} />
          </div>
          <div style={{ flex: '0 0 46px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--c-text)' }}>
            {angka(d.jumlah)}
          </div>
        </div>
      ))}
    </div>
  )
}
