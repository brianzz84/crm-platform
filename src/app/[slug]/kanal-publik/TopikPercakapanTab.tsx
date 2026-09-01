'use client'

/**
 * Peninjauan label percakapan — keperluan (topik) dan bidang layanan (poli).
 *
 * Sepadan dengan KontenTab untuk sifat konten: AI mengusulkan, manusia
 * menetapkan. Laporan hanya menghitung yang sudah ditetapkan — jadi selama tidak
 * ada yang ditinjau di sini, tabel di Laporan memang kosong, dan itu jujur.
 *
 * SELURUH percakapan ditampilkan, bukan satu baris pembuka. Pesan pembuka
 * rata-rata cuma "halo"; menilai keperluan dari situ bukan meninjau, melainkan
 * menstempel. Percakapan panjang digulung agar daftarnya tetap terbaca.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

interface Kategori { kode: string; nama: string; warna: string; kelompok?: string | null; deskripsi?: string | null }

interface Pesan { masuk: boolean; teks: string; pada: string }

interface Baris {
  id: string
  kanal: string
  nama: string | null
  terakhirPada: string
  alasan: string | null
  topik: string[]
  poli: string[]
  topikUsulan: string[]
  poliUsulan: string[]
  pesan: Pesan[]
}

const WARNA_KANAL: Record<string, string> = { WA: '#25D366', IG: '#E1306C', FB: '#1877F2' }

/** Di atas ini percakapan digulung — daftar 60 baris jadi tak terbaca kalau semua terbuka. */
const AMBANG_GULUNG = 6

const kartu: React.CSSProperties = {
  background: 'white', border: '1px solid var(--c-border)',
  borderRadius: 'var(--r-lg)', padding: 'var(--sp-5)', marginBottom: 'var(--sp-4)',
}

const tombol = (utama: boolean, sibuk: boolean): React.CSSProperties => ({
  padding: '8px 16px', borderRadius: 'var(--r-md)', fontFamily: 'inherit',
  fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: sibuk ? 'wait' : 'pointer',
  border: utama ? 'none' : '1.5px solid var(--c-border)',
  background: utama ? (sibuk ? '#94A3B8' : 'var(--c-secondary)') : 'white',
  color: utama ? 'white' : 'var(--c-text-muted)',
})

const tanggal = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
const jam = (iso: string) =>
  new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

/** Lencana kategori. `usulan` membedakan tebakan mesin dari keputusan manusia. */
function Lencana({ nama, warna, usulan }: { nama: string; warna: string; usulan?: boolean }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
      color: usulan ? warna : 'white',
      background: usulan ? 'transparent' : warna,
      border: usulan ? `1.5px dashed ${warna}` : `1.5px solid ${warna}`,
    }}>{nama}</span>
  )
}

export default function TopikPercakapanTab({ slug }: { slug: string }) {
  const [topik, setTopik] = useState<Kategori[]>([])
  const [poli, setPoli]   = useState<Kategori[]>([])
  const [rows, setRows]   = useState<Baris[]>([])
  const [perlu, setPerlu] = useState(0)
  const [saring, setSaring] = useState<'perlu' | 'selesai' | 'semua'>('perlu')
  const [muat, setMuat]   = useState(true)
  const [sibuk, setSibuk] = useState('')
  const [galat, setGalat] = useState('')
  const [kabar, setKabar] = useState('')
  const [buka, setBuka]   = useState<Record<string, boolean>>({})
  const [modal, setModal] = useState<Baris | null>(null)

  const ambil = useCallback(async () => {
    setMuat(true); setGalat('')
    try {
      const res  = await fetch(`/api/${slug}/kanal-publik/percakapan?saring=${saring}`)
      const json = await res.json()
      if (!json.success) { setGalat(json.error ?? 'Gagal memuat.'); return }
      setTopik(json.topik ?? []); setPoli(json.poli ?? [])
      setRows(json.data ?? []); setPerlu(json.jumlahPerlu ?? 0)
    } catch { setGalat('Gagal menghubungi server.') }
    finally { setMuat(false) }
  }, [slug, saring])

  useEffect(() => { ambil() }, [ambil])

  const petaTopik = useMemo(() => new Map(topik.map(t => [t.kode, t])), [topik])
  const petaPoli  = useMemo(() => new Map(poli.map(p => [p.kode, p])), [poli])

  async function usulkan() {
    setSibuk('ai'); setGalat(''); setKabar('')
    try {
      const res  = await fetch(`/api/${slug}/kanal-publik/percakapan/usulan`, { method: 'POST' })
      const json = await res.json()
      if (!json.success) { setGalat(json.error ?? 'Gagal meminta usulan.'); return }
      setKabar(json.pesan ?? [
        `${json.diperiksa} percakapan dibaca`,
        `${json.berlabel} diusulkan (${json.labelTopik} keperluan, ${json.labelPoli} poli)`,
        // Dilaporkan apa adanya: kalau AI sering ragu, itu pertanda uraian
        // kategori di Library perlu dipertajam.
        json.ragu ? `${json.ragu} dibiarkan kosong karena AI ragu` : '',
      ].filter(Boolean).join(', ') + '.')
      ambil()
    } catch { setGalat('Gagal menghubungi server.') }
    finally { setSibuk('') }
  }

  /** Mengganti seluruh isi dimensi yang dikirim — bukan menambahi. */
  async function simpan(id: string, isi: { topik?: string[]; poli?: string[] }) {
    setSibuk(id); setGalat('')
    try {
      const res  = await fetch(`/api/${slug}/kanal-publik/percakapan`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...isi }),
      })
      const json = await res.json()
      if (!json.success) { setGalat(json.error ?? 'Gagal menyimpan.'); return }
      setModal(null); ambil()
    } catch { setGalat('Gagal menghubungi server.') }
    finally { setSibuk('') }
  }

  async function setujuiSemua() {
    if (!window.confirm(
      'Setujui semua usulan AI yang belum ditinjau?\n\n' +
      'Setelah ini angkanya masuk ke laporan triwulan. Lakukan hanya bila daftar ' +
      'di bawah sudah Anda baca.'
    )) return
    setSibuk('semua'); setGalat(''); setKabar('')
    try {
      const res  = await fetch(`/api/${slug}/kanal-publik/percakapan`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setujuiSemua: true }),
      })
      const json = await res.json()
      if (!json.success) { setGalat(json.error ?? 'Gagal menyetujui.'); return }
      setKabar(`${json.disetujui} percakapan ditetapkan (${json.label} label).`)
      ambil()
    } catch { setGalat('Gagal menghubungi server.') }
    finally { setSibuk('') }
  }

  const adaUsulan = rows.some(r => !r.topik.length && (r.topikUsulan.length || r.poliUsulan.length))

  return (
    <div>
      <div style={kartu}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-primary)' }}>💬 Topik Percakapan</div>
            <p style={{ fontSize: 13, color: 'var(--c-text-muted)', margin: '4px 0 0', maxWidth: 700, lineHeight: 1.6 }}>
              Menjawab pertanyaan yang tidak bisa dijawab laporan mana pun: <strong>orang
              menghubungi RKZ untuk apa</strong>, dan <strong>soal bidang layanan apa</strong>. AI
              membaca satu percakapan utuh lalu mengusulkan keduanya — <strong>usulan itu tidak
              masuk laporan sampai Anda tetapkan di sini</strong>. Satu percakapan boleh punya
              lebih dari satu keperluan maupun poli. Daftar kategorinya disunting di Library.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
            <button onClick={usulkan} disabled={!!sibuk} style={tombol(true, sibuk === 'ai')}>
              {sibuk === 'ai' ? '⏳ Membaca…' : '✨ Minta usulan AI'}
            </button>
            {adaUsulan && (
              <button onClick={setujuiSemua} disabled={!!sibuk} style={tombol(false, sibuk === 'semua')}>
                {sibuk === 'semua' ? '⏳…' : '✓ Setujui semua usulan'}
              </button>
            )}
          </div>
        </div>

        {perlu > 0 && (
          <div style={{ marginTop: 'var(--sp-4)', background: '#FFFBEB', borderLeft: '3px solid #F59E0B', color: '#92400E', padding: 'var(--sp-3) var(--sp-4)', borderRadius: 'var(--r-md)', fontSize: 13, lineHeight: 1.6 }}>
            <strong>{perlu} percakapan belum ditetapkan.</strong> Selama belum, percakapan itu
            muncul sebagai “belum ditetapkan” di Laporan → Percakapan dan tidak masuk tabel mana pun.
          </div>
        )}

        {galat && <div style={{ marginTop: 'var(--sp-3)', background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #EF4444' }}>{galat}</div>}
        {kabar && <div style={{ marginTop: 'var(--sp-3)', background: '#F0FDF4', color: '#15803D', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #22C55E' }}>{kabar}</div>}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--sp-3)', flexWrap: 'wrap' }}>
        {([['perlu', 'Perlu ditinjau'], ['selesai', 'Sudah ditetapkan'], ['semua', 'Semua']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setSaring(k)} style={{
            padding: '6px 14px', borderRadius: 999, fontFamily: 'inherit', fontSize: 12,
            fontWeight: saring === k ? 700 : 500, cursor: 'pointer',
            border: `1.5px solid ${saring === k ? 'var(--c-secondary)' : 'var(--c-border)'}`,
            background: saring === k ? 'var(--c-secondary)' : 'white',
            color: saring === k ? 'white' : 'var(--c-text-muted)',
          }}>{label}</button>
        ))}
      </div>

      {muat ? (
        <div style={{ color: 'var(--c-text-muted)', fontSize: 'var(--font-size-sm)' }}>Memuat…</div>
      ) : !rows.length ? (
        <div style={{ ...kartu, color: 'var(--c-text-muted)', fontSize: 'var(--font-size-sm)' }}>
          {saring === 'perlu' ? 'Tidak ada yang perlu ditinjau.' : 'Belum ada percakapan pada saringan ini.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          {rows.map(r => {
            const panjang  = r.pesan.length > AMBANG_GULUNG
            const terbuka  = buka[r.id] || !panjang
            const tampil   = terbuka ? r.pesan : r.pesan.slice(0, AMBANG_GULUNG)
            const adaUsul  = !r.topik.length && (r.topikUsulan.length > 0 || r.poliUsulan.length > 0)

            return (
              <div key={r.id} style={{ ...kartu, marginBottom: 0, padding: 'var(--sp-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 'var(--sp-3)' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'white', background: WARNA_KANAL[r.kanal] ?? '#64748B', padding: '2px 7px', borderRadius: 4 }}>{r.kanal}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>{r.nama || 'Tanpa nama'}</span>
                  <span style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>{tanggal(r.terakhirPada)} · {r.pesan.length} pesan</span>
                </div>

                {/* Percakapan utuh, bergaya gelembung supaya arah pesan terbaca sekilas. */}
                <div style={{ display: 'grid', gap: 5, marginBottom: 'var(--sp-3)' }}>
                  {tampil.map((m, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: m.masuk ? 'flex-start' : 'flex-end' }}>
                      <div style={{
                        maxWidth: '78%', padding: '6px 11px', borderRadius: 10,
                        background: m.masuk ? 'var(--c-bg)' : '#E0F2FE',
                        border: '1px solid var(--c-border)',
                        fontSize: 13, lineHeight: 1.55, color: 'var(--c-text)',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      }}>
                        {m.teks || <em style={{ color: 'var(--c-text-faint)' }}>(tanpa teks)</em>}
                        <span style={{ fontSize: 10, color: 'var(--c-text-faint)', marginLeft: 8 }}>{jam(m.pada)}</span>
                      </div>
                    </div>
                  ))}
                  {panjang && (
                    <button onClick={() => setBuka(b => ({ ...b, [r.id]: !terbuka }))}
                      style={{ justifySelf: 'center', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: 'var(--c-secondary)', padding: '4px 8px' }}>
                      {terbuka ? '▲ Ringkas' : `▼ Tampilkan ${r.pesan.length - AMBANG_GULUNG} pesan lagi`}
                    </button>
                  )}
                </div>

                {adaUsul && (
                  <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 'var(--sp-2)', lineHeight: 1.8 }}>
                    Usulan AI:{' '}
                    {r.topikUsulan.map(k => {
                      const t = petaTopik.get(k)
                      return <span key={k} style={{ marginRight: 5 }}><Lencana nama={t?.nama ?? k} warna={t?.warna ?? '#94A3B8'} usulan /></span>
                    })}
                    {r.poliUsulan.map(k => {
                      const p = petaPoli.get(k)
                      return <span key={k} style={{ marginRight: 5 }}><Lencana nama={p?.nama ?? k} warna={p?.warna ?? '#94A3B8'} usulan /></span>
                    })}
                    {r.alasan && <div style={{ marginTop: 2 }}>{r.alasan}</div>}
                  </div>
                )}

                {(r.topik.length > 0 || r.poli.length > 0) && (
                  <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 'var(--sp-2)', lineHeight: 1.8 }}>
                    Ditetapkan:{' '}
                    {r.topik.map(k => {
                      const t = petaTopik.get(k)
                      return <span key={k} style={{ marginRight: 5 }}><Lencana nama={t?.nama ?? k} warna={t?.warna ?? '#94A3B8'} /></span>
                    })}
                    {r.poli.map(k => {
                      const p = petaPoli.get(k)
                      return <span key={k} style={{ marginRight: 5 }}><Lencana nama={p?.nama ?? k} warna={p?.warna ?? '#94A3B8'} /></span>
                    })}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {adaUsul && (
                    <button onClick={() => simpan(r.id, { topik: r.topikUsulan, poli: r.poliUsulan })}
                      disabled={!!sibuk}
                      style={{ padding: '5px 12px', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--c-primary)', color: 'white', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      ✓ Setuju
                    </button>
                  )}
                  <button onClick={() => setModal(r)} disabled={!!sibuk}
                    style={{ padding: '5px 12px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--c-border)', background: 'white', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: 'var(--c-text-muted)' }}>
                    ✎ Pilih label…
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <ModalLabel
          baris={modal} topik={topik} poli={poli} sibuk={!!sibuk}
          onBatal={() => setModal(null)}
          onSimpan={(t, p) => simpan(modal.id, { topik: t, poli: p })}
        />
      )}
    </div>
  )
}

/**
 * Pemilih label. Dua dimensi dalam satu modal karena keduanya dinilai dari
 * percakapan yang sama — memisahkannya jadi dua dialog memaksa peninjau membaca
 * percakapan itu dua kali.
 */
function ModalLabel({ baris, topik, poli, sibuk, onBatal, onSimpan }: {
  baris: Baris
  topik: Kategori[]
  poli: Kategori[]
  sibuk: boolean
  onBatal: () => void
  onSimpan: (topik: string[], poli: string[]) => void
}) {
  // Nilai awal: yang sudah ditetapkan; kalau belum ada, usulan AI dipakai sebagai
  // titik mula supaya peninjau menyunting alih-alih mengetik ulang dari nol.
  const [pilihT, setPilihT] = useState<string[]>(baris.topik.length ? baris.topik : baris.topikUsulan)
  const [pilihP, setPilihP] = useState<string[]>(baris.poli.length ? baris.poli : baris.poliUsulan)

  const alih = (arr: string[], set: (v: string[]) => void, kode: string) =>
    set(arr.includes(kode) ? arr.filter(k => k !== kode) : [...arr, kode])

  const Kotak = ({ daftar, dipilih, set, kosong }: {
    daftar: Kategori[]; dipilih: string[]; set: (v: string[]) => void; kosong: string
  }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {daftar.length === 0 && <span style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>{kosong}</span>}
      {daftar.map(k => {
        const aktif = dipilih.includes(k.kode)
        return (
          <button key={k.kode} onClick={() => alih(dipilih, set, k.kode)}
            title={k.deskripsi ?? undefined}
            style={{
              padding: '6px 12px', borderRadius: 999, fontFamily: 'inherit', fontSize: 12,
              fontWeight: aktif ? 700 : 500, cursor: 'pointer', textAlign: 'left',
              border: `1.5px solid ${aktif ? k.warna : 'var(--c-border)'}`,
              background: aktif ? k.warna : 'white',
              color: aktif ? 'white' : 'var(--c-text-muted)',
            }}>
            {aktif ? '✓ ' : ''}{k.nama}
          </button>
        )
      })}
    </div>
  )

  // Poli dikelompokkan seperti asalnya di pustaka: 27 tombol tanpa pengelompokan
  // membuat mata harus menyisir seluruhnya untuk menemukan satu poli.
  const poliPerKelompok = poli.reduce<Record<string, Kategori[]>>((acc, p) => {
    const g = p.kelompok || 'Lainnya'
    ;(acc[g] ??= []).push(p)
    return acc
  }, {})

  return (
    <div onClick={onBatal} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--sp-4)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'white', borderRadius: 'var(--r-lg)', width: 'min(720px, 100%)',
        maxHeight: '88vh', overflowY: 'auto', padding: 'var(--sp-5)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
          Pilih label percakapan
        </div>
        <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 'var(--sp-4)', lineHeight: 1.6 }}>
          {baris.kanal} · {baris.nama || 'Tanpa nama'} · {baris.pesan.length} pesan.
          Boleh memilih lebih dari satu. Klik lagi untuk membatalkan pilihan.
        </div>

        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--c-text)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
          Keperluan
        </div>
        <Kotak daftar={topik} dipilih={pilihT} set={setPilihT} kosong="Belum ada kategori di Library." />

        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--c-text)', textTransform: 'uppercase', letterSpacing: '.5px', margin: 'var(--sp-4) 0 4px' }}>
          Poli / Layanan
        </div>
        <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginBottom: 8, lineHeight: 1.6 }}>
          Boleh dikosongkan — lamaran kerja, penawaran vendor, dan spam memang tidak
          menyangkut bidang layanan mana pun.
        </div>
        {Object.entries(poliPerKelompok).map(([grup, daftar]) => (
          <div key={grup} style={{ marginBottom: 'var(--sp-3)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-faint)', marginBottom: 5 }}>{grup}</div>
            <Kotak daftar={daftar} dipilih={pilihP} set={setPilihP} kosong="" />
          </div>
        ))}
        {!poli.length && (
          <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>
            Belum ada poli di Library. Daftar ini disemai dari Unit/Poli SIMRS saat pertama dibuka.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 'var(--sp-5)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={onBatal} style={tombol(false, false)}>Batal</button>
          <button onClick={() => onSimpan(pilihT, pilihP)} disabled={sibuk} style={tombol(true, sibuk)}>
            {sibuk ? '⏳ Menyimpan…' : 'Simpan penetapan'}
          </button>
        </div>
      </div>
    </div>
  )
}
