'use client'

/**
 * Peninjauan sebutan publik — apa yang orang LAIN katakan tentang RKZ.
 *
 * Bentuknya meniru TopikPercakapanTab yang sudah terbukti: AI mengusulkan,
 * manusia menetapkan, laporan hanya menghitung yang sudah ditetapkan.
 *
 * DAFTAR YANG JADI HALAMAN PEMBUKA, BUKAN GRAF. Pertanyaan orang pemasaran pada
 * Senin pagi adalah "apa yang perlu saya tangani", bukan "siapa terhubung dengan
 * siapa". Graf menjawab pertanyaan strategis triwulanan dan akan menempati tabnya
 * sendiri setelah label terkumpul — sebelum itu, akun promosi yang menandai lima
 * usaha sekaligus akan tampak sebagai simpul paling sentral.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import RingkasanTab from './RingkasanTab'
import {
  NAMA_SUMBER, WARNA_SUMBER, WARNA_SENTIMEN, WARNA_RISIKO,
  angka, tanggal, kartu,
} from './tampilan'

interface Kategori { kode: string; nama: string; warna: string; kelompok?: string | null; deskripsi?: string | null }

interface Baris {
  id: string
  sumber: string
  penulis: string | null
  username: string | null
  teks: string | null
  tautan: string | null
  terbitPada: string
  hilangPada: string | null
  alasan: string | null
  topik: string[];    topikUsulan: string[]
  sentimen: string[]; sentimenUsulan: string[]
  unit: string[];     unitUsulan: string[]
  risiko: string[];   risikoUsulan: string[]
}

/** Batas keras putaran usulan AI. 40 x 30 = 1.200 sebutan — jauh di atas
 *  tunggakan 608 yang terukur, tetapi tetap berhingga. */
const MAKS_PUTARAN = 40

const tombol = (utama: boolean, sibuk: boolean): React.CSSProperties => ({
  padding: '8px 16px', borderRadius: 'var(--r-md)', fontFamily: 'inherit',
  fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: sibuk ? 'wait' : 'pointer',
  border: utama ? 'none' : '1.5px solid var(--c-border)',
  background: utama ? (sibuk ? '#94A3B8' : 'var(--c-secondary)') : 'white',
  color: utama ? 'white' : 'var(--c-text-muted)',
})

function Lencana({ nama, warna, usulan }: { nama: string; warna: string; usulan?: boolean }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, marginRight: 5,
      color: usulan ? warna : 'white',
      background: usulan ? 'transparent' : warna,
      border: `1.5px ${usulan ? 'dashed' : 'solid'} ${warna}`,
    }}>{nama}</span>
  )
}

export default function SebutanClient({ slug }: { slug: string }) {
  const [topik, setTopik]     = useState<Kategori[]>([])
  const [poli, setPoli]       = useState<Kategori[]>([])
  const [sentimen, setSentimen] = useState<string[]>([])
  const [risiko, setRisiko]   = useState<string[]>([])
  const [rows, setRows]       = useState<Baris[]>([])
  const [perlu, setPerlu]     = useState(0)
  const [perSumber, setPerSumber] = useState<{ sumber: string; jumlah: number }[]>([])
  const [saring, setSaring]   = useState<'perlu' | 'selesai' | 'semua' | 'tanpateks'>('perlu')
  const [sumber, setSumber]   = useState('')
  const [hal, setHal]         = useState(1)
  const [totalHalaman, setTotalHalaman] = useState(1)
  const [totalSaring, setTotalSaring]   = useState(0)
  const [perHalaman, setPerHalaman]     = useState(30)
  const [muat, setMuat]       = useState(true)
  const [sibuk, setSibuk]     = useState('')
  const [galat, setGalat]     = useState('')
  const [kabar, setKabar]     = useState('')
  const [modal, setModal]     = useState<Baris | null>(null)
  const [tab, setTab]         = useState<'tinjau' | 'ringkas'>('tinjau')
  /** Ditandai lewat ref, bukan state: putaran yang sedang berjalan membaca
   *  nilainya langsung, sementara state baru terlihat pada render berikutnya. */
  const hentikan = useRef(false)

  const ambil = useCallback(async () => {
    setMuat(true); setGalat('')
    try {
      const q = new URLSearchParams({ saring, hal: String(hal) })
      if (sumber) q.set('sumber', sumber)
      const res  = await fetch(`/api/${slug}/sebutan?${q}`)
      const json = await res.json()
      if (!json.success) { setGalat(json.error ?? 'Gagal memuat.'); return }
      setTopik(json.topik ?? []); setPoli(json.poli ?? [])
      setSentimen(json.sentimen ?? []); setRisiko(json.risiko ?? [])
      setRows(json.data ?? []); setPerlu(json.jumlahPerlu ?? 0)
      setPerSumber(json.perSumber ?? [])
      setTotalHalaman(json.totalHalaman ?? 1)
      setTotalSaring(json.total ?? 0)
      setPerHalaman(json.perHalaman ?? 30)
      // Menyetujui sebutan MENGECILKAN saringan 'perlu'. Meninjau halaman 12 lalu
      // menemukan hanya tersisa 9 halaman akan menampilkan layar kosong yang
      // tampak seperti kerusakan — jadi mundur ke halaman terakhir yang ada.
      if ((json.data?.length ?? 0) === 0 && hal > 1) setHal(json.totalHalaman ?? 1)
    } catch { setGalat('Gagal menghubungi server.') }
    finally { setMuat(false) }
  }, [slug, saring, sumber, hal])

  useEffect(() => { ambil() }, [ambil])

  const petaTopik = useMemo(() => new Map(topik.map(t => [t.kode, t])), [topik])
  const petaPoli  = useMemo(() => new Map(poli.map(p => [p.kode, p])), [poli])
  const totalSebutan = perSumber.reduce((n, s) => n + s.jumlah, 0)

  async function tarik() {
    setSibuk('tarik'); setGalat(''); setKabar('')
    try {
      const res  = await fetch(`/api/${slug}/sebutan/tarik`, { method: 'POST' })
      const json = await res.json()
      if (!json.success) { setGalat(json.pesan ?? json.error ?? 'Penarikan gagal.'); return }
      setKabar(json.pesan)
      // Kegagalan SEBAGIAN tidak boleh tenggelam di kotak hijau. Instagram dan
      // YouTube memakai kredensial terpisah, jadi satu bisa kedaluwarsa
      // sementara yang lain sehat — dan itu justru keadaan yang paling mudah
      // tidak disadari berbulan-bulan.
      const gagal = [
        json.instagram?.galat ? `Instagram: ${json.instagram.galat}` : '',
        json.youtube?.galat   ? `YouTube: ${json.youtube.galat}` : '',
      ].filter(Boolean)
      if (gagal.length) setGalat(gagal.join(' · '))
      ambil()
    } catch { setGalat('Gagal menghubungi server.') }
    finally { setSibuk('') }
  }

  async function simpan(id: string, isi: Record<string, string[]>) {
    setSibuk(id); setGalat('')
    try {
      const res  = await fetch(`/api/${slug}/sebutan`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...isi }),
      })
      const json = await res.json()
      if (!json.success) { setGalat(json.error ?? 'Gagal menyimpan.'); return }
      setModal(null); ambil()
    } catch { setGalat('Gagal menghubungi server.') }
    finally { setSibuk('') }
  }

  /** `ulangi` membuang usulan yang belum ditinjau lalu meminta ulang — dipakai
   *  setelah uraian kategori diperbaiki. Label yang sudah ditetapkan manusia
   *  tidak pernah tersentuh. */
  /**
   * Meminta usulan AI sampai tunggakan habis.
   *
   * Satu panggilan hanya memproses 30 sebutan — batas itu ada supaya jawaban AI
   * tidak terpotong di tengah, bukan karena terikat halaman. Tetapi 608 dibagi 30
   * berarti dua puluh kali tekan, jadi pengulangannya dikerjakan di sini.
   *
   * TIGA PENGAMAN, karena putaran yang salah membakar token tanpa batas:
   *
   * 1. `ulangi` HANYA pada panggilan pertama. Kalau ikut terkirim di panggilan
   *    berikutnya, ia akan menghapus usulan yang baru saja dibuat panggilan
   *    sebelumnya — dan putarannya tidak akan pernah selesai.
   * 2. `lewati` naik sebanyak yang TIDAK terlabeli pada putaran sebelumnya.
   *    Tanpa ini, sebutan yang tak terbaca AI tetap tak berlabel, duduk di
   *    posisi teratas yang sama, dan ditanyakan ulang di setiap putaran —
   *    sehingga putarannya tidak pernah menyentuh yang di bawahnya.
   * 3. Berhenti setelah TIGA putaran berturut-turut tanpa satu pun usulan.
   *    Dengan `lewati` yang melangkah, ini bukan lagi soal putaran abadi
   *    melainkan soal biaya: 90 sebutan tanpa hasil berarti ada yang rusak.
   * 4. Batas keras 40 putaran, kalau-kalau ada keadaan yang belum terpikirkan.
   */
  async function usulkan(ulangi = false) {
    if (ulangi && !window.confirm(
      'Buang semua usulan AI yang belum ditinjau, lalu minta ulang?\n\n' +
      'Label yang sudah Anda tetapkan tidak akan tersentuh.'
    )) return

    hentikan.current = false
    setSibuk(ulangi ? 'ulangi' : 'usul'); setGalat(''); setKabar('')

    let diperiksa = 0, berlabel = 0, ragu = 0, ditolak = 0, putaran = 0
    let lewati = 0, nolBerturut = 0, tanpaTeks = 0
    let alasanBerhenti = ''

    try {
      while (putaran < MAKS_PUTARAN) {
        if (hentikan.current) { alasanBerhenti = 'dihentikan'; break }

        const res  = await fetch(`/api/${slug}/sebutan/usulan`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          // Pengaman 1 dan 2 — lihat catatan di atas.
          body: JSON.stringify({ ulangi: ulangi && putaran === 0, lewati }),
        })
        const json = await res.json()
        if (!json.success) {
          // Kegagalan di tengah TIDAK membatalkan yang sudah tersimpan — tiap
          // batch berdiri sendiri. Jadi angkanya tetap dilaporkan di bawah.
          setGalat(json.error ?? 'Usulan gagal.')
          alasanBerhenti = 'galat'
          break
        }
        putaran++

        tanpaTeks = json.tanpaTeks ?? 0
        if (json.diperiksa === 0) { alasanBerhenti = 'selesai'; break }

        diperiksa += json.diperiksa
        berlabel  += json.berlabel
        ragu      += json.ragu ?? 0
        ditolak   += json.ditolak ?? 0

        // Pengaman 2: langkahi yang tidak terlabeli pada putaran ini.
        lewati += json.diperiksa - json.berlabel

        // Pengaman 3.
        nolBerturut = json.berlabel === 0 ? nolBerturut + 1 : 0
        if (nolBerturut >= 3) { alasanBerhenti = 'mandek'; break }

        setKabar(`⏳ ${angka(diperiksa)} sebutan diperiksa, ${angka(berlabel)} mendapat usulan… (putaran ${putaran})`)
      }
      if (!alasanBerhenti) alasanBerhenti = 'batas'

      if (diperiksa === 0) {
        setKabar('Tidak ada sebutan bertakarir yang perlu diusulkan.'
          + (tanpaTeks ? ` Tersisa ${angka(tanpaTeks)} sebutan tanpa takarir — `
            + `AI tidak pernah diberi apa pun untuk dibaca di sini, jadi saring `
            + `“Tanpa teks” dan labeli sendiri.` : ''))
      } else {
        // `ragu` dan `ditolak` ditampilkan, bukan disembunyikan: keduanya
        // menunjukkan di mana uraian kategori masih perlu dipertajam.
        const ekor: Record<string, string> = {
          selesai: 'Seluruh tunggakan selesai.',
          dihentikan: 'Dihentikan — tekan lagi untuk melanjutkan sisanya.',
          mandek: 'Berhenti: tiga putaran berturut-turut tanpa satu pun usulan. '
                + 'Sisanya kemungkinan besar terlalu kabur untuk dinilai dari teksnya.',
          batas: `Berhenti di batas ${MAKS_PUTARAN} putaran — tekan lagi untuk melanjutkan.`,
          galat: 'Berhenti karena galat di atas; yang sudah tersimpan tetap aman.',
        }
        setKabar([
          `${angka(diperiksa)} sebutan diperiksa`,
          `${angka(berlabel)} mendapat usulan`,
          ragu    ? `${angka(ragu)} dibiarkan kosong (terlalu kabur)` : '',
          ditolak ? `${angka(ditolak)} kode ditolak` : '',
        ].filter(Boolean).join(', ') + '. ' + (ekor[alasanBerhenti] ?? '')
          + (tanpaTeks ? ` ${angka(tanpaTeks)} sebutan tanpa takarir tidak bisa dinilai AI `
            + `— saring “Tanpa teks” untuk melabelinya sendiri.` : ''))
      }
      // Sekali di akhir, bukan tiap putaran: dua puluh kali muat ulang daftar
      // membuat layar berkedip tanpa menambah keterangan apa pun.
      ambil()
    } catch { setGalat('Gagal menghubungi server.') }
    finally { setSibuk(''); hentikan.current = false }
  }

  async function setujuiSemua() {
    if (!window.confirm(
      'Setujui semua usulan AI yang belum ditinjau?\n\n' +
      'Setelah ini angkanya masuk laporan. Lakukan hanya bila daftar di bawah sudah Anda baca.'
    )) return
    setSibuk('semua'); setGalat(''); setKabar('')
    try {
      const res  = await fetch(`/api/${slug}/sebutan`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setujuiSemua: true }),
      })
      const json = await res.json()
      if (!json.success) { setGalat(json.error ?? 'Gagal menyetujui.'); return }
      setKabar(`${json.disetujui} sebutan ditetapkan (${json.label} label).`)
      ambil()
    } catch { setGalat('Gagal menghubungi server.') }
    finally { setSibuk('') }
  }

  const adaUsulan = rows.some(r => !r.topik.length &&
    (r.topikUsulan.length || r.sentimenUsulan.length || r.unitUsulan.length))

  return (
    <div style={{ padding: 'var(--sp-5)', maxWidth: 1100, margin: '0 auto' }}>
      <div style={kartu}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--c-primary)' }}>🔎 Sebutan Publik</div>
            <p style={{ fontSize: 13, color: 'var(--c-text-muted)', margin: '4px 0 0', maxWidth: 720, lineHeight: 1.6 }}>
              Apa yang orang <strong>lain</strong> katakan tentang RKZ — berbeda dari Kanal Publik yang
              mengukur kanal milik RKZ sendiri. AI mengusulkan kategorinya, dan{' '}
              <strong>usulan itu tidak masuk laporan sampai Anda tetapkan di sini</strong>.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0, visibility: tab === 'tinjau' ? 'visible' : 'hidden' }}>
            <button onClick={tarik} disabled={!!sibuk} style={tombol(true, sibuk === 'tarik')}>
              {sibuk === 'tarik' ? '⏳ Menarik…' : '⤓ Tarik sekarang'}
            </button>
            {sibuk === 'usul' || sibuk === 'ulangi' ? (
              <button onClick={() => { hentikan.current = true }}
                style={{ ...tombol(false, false), borderColor: '#DC2626', color: '#B91C1C' }}
                title="Berhenti setelah putaran yang sedang berjalan selesai">
                ⏹ Hentikan
              </button>
            ) : (
              <button onClick={() => usulkan(false)} disabled={!!sibuk} style={tombol(false, false)}>
                🤖 Usulkan label AI
              </button>
            )}
            {adaUsulan && (
              <button onClick={() => usulkan(true)} disabled={!!sibuk} style={tombol(false, sibuk === 'ulangi')}
                title="Buang usulan yang belum ditinjau, lalu minta ulang">
                {sibuk === 'ulangi' ? '⏳…' : '↻ Usulkan ulang'}
              </button>
            )}
            {adaUsulan && (
              <button onClick={setujuiSemua} disabled={!!sibuk} style={tombol(false, sibuk === 'semua')}>
                {sibuk === 'semua' ? '⏳…' : '✓ Setujui semua usulan'}
              </button>
            )}
          </div>
        </div>

        {/* Jalur statistik. Angka per sumber ikut ditampilkan karena ia sekaligus
            menunjukkan penarik mana yang benar-benar menghasilkan — bukan sekadar
            terpasang lalu diam. */}
        <div style={{ display: tab === 'tinjau' ? 'flex' : 'none', gap: 'var(--sp-5)', flexWrap: 'wrap', marginTop: 'var(--sp-4)', paddingTop: 'var(--sp-4)', borderTop: '1px solid var(--c-border)' }}>
          <Angka label="Belum ditinjau" nilai={angka(perlu)} warna={perlu ? '#B45309' : 'var(--c-success)'} />
          <Angka label="Total sebutan"  nilai={angka(totalSebutan)} warna="var(--c-primary)" />
          {perSumber.map(s => (
            <Angka key={s.sumber} label={NAMA_SUMBER[s.sumber] ?? s.sumber}
              nilai={angka(s.jumlah)} warna={WARNA_SUMBER[s.sumber] ?? '#64748B'} />
          ))}
        </div>

        {galat && <div style={{ marginTop: 'var(--sp-3)', background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #EF4444' }}>{galat}</div>}
        {kabar && <div style={{ marginTop: 'var(--sp-3)', background: '#F0FDF4', color: '#15803D', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #22C55E' }}>{kabar}</div>}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--sp-4)', borderBottom: '2px solid var(--c-border)' }}>
        {([['tinjau', '📋 Peninjauan'], ['ringkas', '📊 Ringkasan']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '9px 18px', border: 'none', background: 'transparent', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 13, fontWeight: tab === k ? 800 : 500,
            color: tab === k ? 'var(--c-secondary)' : 'var(--c-text-muted)',
            borderBottom: `2px solid ${tab === k ? 'var(--c-secondary)' : 'transparent'}`,
            marginBottom: -2,
          }}>{label}</button>
        ))}
      </div>

      {tab === 'ringkas' ? <RingkasanTab slug={slug} topik={topik} poli={poli} /> : <>

      <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--sp-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        {([['perlu', 'Perlu ditinjau'], ['tanpateks', 'Tanpa teks'],
           ['selesai', 'Sudah ditetapkan'], ['semua', 'Semua']] as const).map(([k, label]) => (
          <button key={k} onClick={() => { setSaring(k); setHal(1) }} style={pil(saring === k)}>{label}</button>
        ))}
        <span style={{ width: 12 }} />
        <button onClick={() => { setSumber(''); setHal(1) }} style={pil(sumber === '')}>Semua sumber</button>
        {perSumber.map(s => (
          <button key={s.sumber} onClick={() => { setSumber(s.sumber); setHal(1) }} style={pil(sumber === s.sumber)}>
            {NAMA_SUMBER[s.sumber] ?? s.sumber}
          </button>
        ))}
        {totalSaring > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--c-text-muted)' }}>
            {angka((hal - 1) * perHalaman + 1)}–{angka(Math.min(hal * perHalaman, totalSaring))} dari{' '}
            <strong>{angka(totalSaring)}</strong>
          </span>
        )}
      </div>

      {muat ? (
        <div style={{ color: 'var(--c-text-muted)', fontSize: 'var(--font-size-sm)' }}>Memuat…</div>
      ) : !rows.length ? (
        <div style={{ ...kartu, color: 'var(--c-text-muted)', fontSize: 'var(--font-size-sm)', lineHeight: 1.7 }}>
          {totalSebutan === 0
            ? <>Belum ada sebutan tersimpan. Tekan <strong>⤓ Tarik sekarang</strong> untuk
               mengambil sebutan Instagram dan YouTube — penarikan pertama membawa ratusan
               konten lama sekaligus.</>
            : saring === 'perlu' ? 'Tidak ada yang perlu ditinjau.'
            : saring === 'tanpateks' ? 'Tidak ada sebutan tanpa takarir yang tersisa.'
            : 'Tidak ada pada saringan ini.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          {/* Muncul hanya ketika ada tunggakan tetapi belum satu pun usulan AI —
              menunggu orang menemukan sendiri tombolnya, pada 608 baris, berarti
              menunggu mereka menyerah lebih dulu. */}
          {saring === 'tanpateks' && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 'var(--r-md)', padding: '10px 14px', fontSize: 13, color: '#92400E', lineHeight: 1.6 }}>
              Unggahan ini <strong>tidak punya takarir</strong>, jadi tidak pernah masuk
              antrean AI — menebak dari nama akun saja hanya melahirkan label yang salah
              tapi terdengar yakin. Buka tautannya, lihat gambarnya, lalu tetapkan sendiri.
            </div>
          )}
          {saring === 'perlu' && !adaUsulan && (
            <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 'var(--r-md)', padding: '10px 14px', fontSize: 13, color: '#075985', lineHeight: 1.6 }}>
              Ada <strong>{angka(totalSaring)}</strong> sebutan menunggu ditinjau dan belum
              ada usulan AI. Tekan <strong>🤖 Usulkan label AI</strong> — Anda tinggal
              memeriksa, bukan mengarang dari nol.
            </div>
          )}
          {rows.map(r => {
            const adaUsul = !r.topik.length && (r.topikUsulan.length > 0 || r.sentimenUsulan.length > 0)
            return (
              <div key={r.id} style={{ ...kartu, marginBottom: 0, padding: 'var(--sp-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 'var(--sp-2)' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'white', background: WARNA_SUMBER[r.sumber] ?? '#64748B', padding: '2px 7px', borderRadius: 4 }}>
                    {NAMA_SUMBER[r.sumber] ?? r.sumber}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>@{r.username ?? r.penulis ?? 'tanpa nama'}</span>
                  <span style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>{tanggal(r.terbitPada)}</span>
                  {r.tautan && (
                    <a href={r.tautan} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: 'var(--c-secondary)', textDecoration: 'none' }}>buka ↗</a>
                  )}
                  {/* Sebutan yang sudah hilang di sumbernya TIDAK dihapus — laporan
                      lampau harus tetap bisa dipertanggungjawabkan. Tapi harus
                      terlihat, supaya tidak ada yang mengeklik tautan mati lalu
                      menyangka sistemnya rusak. */}
                  {r.hilangPada && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#92400E', background: '#FFFBEB', padding: '2px 7px', borderRadius: 4 }}>
                      sudah hilang di sumber
                    </span>
                  )}
                </div>

                <div style={{ fontSize: 13, color: 'var(--c-text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 'var(--sp-2)' }}>
                  {r.teks || <em style={{ color: 'var(--c-text-faint)' }}>(tanpa teks)</em>}
                </div>

                {(adaUsul || r.topik.length > 0 || r.sentimen.length > 0) && (
                  <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 'var(--sp-2)', lineHeight: 1.9 }}>
                    {adaUsul ? 'Usulan AI: ' : 'Ditetapkan: '}
                    {(adaUsul ? r.topikUsulan : r.topik).map(k => {
                      const t = petaTopik.get(k)
                      return <Lencana key={k} nama={t?.nama ?? k} warna={t?.warna ?? '#94A3B8'} usulan={adaUsul} />
                    })}
                    {(adaUsul ? r.sentimenUsulan : r.sentimen).map(k =>
                      <Lencana key={k} nama={k} warna={WARNA_SENTIMEN[k] ?? '#64748B'} usulan={adaUsul} />)}
                    {(adaUsul ? r.unitUsulan : r.unit).map(k => {
                      const p = petaPoli.get(k)
                      return <Lencana key={k} nama={p?.nama ?? k} warna={p?.warna ?? '#94A3B8'} usulan={adaUsul} />
                    })}
                    {(adaUsul ? r.risikoUsulan : r.risiko).map(k =>
                      <Lencana key={k} nama={`Risiko ${k}`} warna={WARNA_RISIKO[k] ?? '#64748B'} usulan={adaUsul} />)}
                    {r.alasan && adaUsul && <div style={{ marginTop: 2 }}>{r.alasan}</div>}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {adaUsul && (
                    <button disabled={!!sibuk}
                      onClick={() => simpan(r.id, {
                        topik: r.topikUsulan, sentimen: r.sentimenUsulan,
                        unit: r.unitUsulan, risiko: r.risikoUsulan,
                      })}
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

      <Paginasi hal={hal} totalHalaman={totalHalaman} pindah={n => {
        setHal(n)
        // Tanpa ini pembaca mendarat di tengah halaman baru dan menyangka
        // daftarnya tidak berganti.
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }} />

      </>}

      {modal && (
        <ModalLabel
          baris={modal} topik={topik} poli={poli} sentimen={sentimen} risiko={risiko}
          sibuk={!!sibuk} onBatal={() => setModal(null)}
          onSimpan={isi => simpan(modal.id, isi)}
        />
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

/** Paginasi. Mengikuti bentuk yang sudah dipakai BroadcastList supaya kendali
 *  yang sama tidak tampak berbeda di dua halaman. Tambahannya hanya lompatan ke
 *  halaman awal/akhir: pada 21 halaman, mencapai yang terakhir dengan '›' saja
 *  berarti dua puluh klik. */
function Paginasi({ hal, totalHalaman, pindah }: {
  hal: number; totalHalaman: number; pindah: (n: number) => void
}) {
  if (totalHalaman <= 1) return null

  const gaya = (mati: boolean): React.CSSProperties => ({
    padding: '7px 14px', borderRadius: 'var(--r-sm)', fontFamily: 'inherit', fontSize: 13,
    border: '1px solid var(--c-border)', background: 'white',
    cursor: mati ? 'not-allowed' : 'pointer',
    color: mati ? 'var(--c-text-faint)' : 'var(--c-text)',
  })
  const awal  = hal <= 1
  const akhir = hal >= totalHalaman

  return (
    <div style={{
      marginTop: 'var(--sp-4)', display: 'flex', justifyContent: 'center',
      alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap',
    }}>
      <button onClick={() => pindah(1)} disabled={awal} style={gaya(awal)}>« Awal</button>
      <button onClick={() => pindah(Math.max(1, hal - 1))} disabled={awal} style={gaya(awal)}>‹ Sebelumnya</button>
      <span style={{ padding: '7px 12px', fontSize: 13, color: 'var(--c-text-muted)' }}>
        {angka(hal)} / {angka(totalHalaman)}
      </span>
      <button onClick={() => pindah(Math.min(totalHalaman, hal + 1))} disabled={akhir} style={gaya(akhir)}>Berikutnya ›</button>
      <button onClick={() => pindah(totalHalaman)} disabled={akhir} style={gaya(akhir)}>Akhir »</button>
    </div>
  )
}

function Angka({ label, nilai, warna }: { label: string; nilai: string; warna: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: warna }}>{nilai}</div>
    </div>
  )
}

/** Pemilih label empat dimensi dalam satu modal — sebutan yang sama dinilai
 *  sekali, bukan dibaca ulang empat kali. */
function ModalLabel({ baris, topik, poli, sentimen, risiko, sibuk, onBatal, onSimpan }: {
  baris: Baris; topik: Kategori[]; poli: Kategori[]
  sentimen: string[]; risiko: string[]; sibuk: boolean
  onBatal: () => void; onSimpan: (isi: Record<string, string[]>) => void
}) {
  const awal = (tetap: string[], usul: string[]) => tetap.length ? tetap : usul
  const [pT, setPT] = useState<string[]>(awal(baris.topik, baris.topikUsulan))
  const [pS, setPS] = useState<string[]>(awal(baris.sentimen, baris.sentimenUsulan))
  const [pU, setPU] = useState<string[]>(awal(baris.unit, baris.unitUsulan))
  const [pR, setPR] = useState<string[]>(awal(baris.risiko, baris.risikoUsulan))

  /** `tunggal` untuk SENTIMEN dan RISIKO: satu sebutan tidak bisa sekaligus
   *  positif dan negatif, dan membiarkannya ganda membuat jumlah laporan
   *  melebihi jumlah sebutan. */
  const alih = (arr: string[], set: (v: string[]) => void, kode: string, tunggal = false) => {
    if (arr.includes(kode)) return set(arr.filter(k => k !== kode))
    set(tunggal ? [kode] : [...arr, kode])
  }

  const Kotak = ({ daftar, dipilih, set, tunggal }: {
    daftar: { kode: string; nama: string; warna: string; deskripsi?: string | null }[]
    dipilih: string[]; set: (v: string[]) => void; tunggal?: boolean
  }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {daftar.map(k => {
        const aktif = dipilih.includes(k.kode)
        return (
          <button key={k.kode} onClick={() => alih(dipilih, set, k.kode, tunggal)}
            title={k.deskripsi ?? undefined}
            style={{
              padding: '6px 12px', borderRadius: 999, fontFamily: 'inherit', fontSize: 12,
              fontWeight: aktif ? 700 : 500, cursor: 'pointer', textAlign: 'left',
              border: `1.5px solid ${aktif ? k.warna : 'var(--c-border)'}`,
              background: aktif ? k.warna : 'white',
              color: aktif ? 'white' : 'var(--c-text-muted)',
            }}>{aktif ? '✓ ' : ''}{k.nama}</button>
        )
      })}
    </div>
  )

  const poliPerKelompok = poli.reduce<Record<string, Kategori[]>>((acc, p) => {
    const g = p.kelompok || 'Lainnya'
    ;(acc[g] ??= []).push(p)
    return acc
  }, {})

  return (
    <div onClick={onBatal} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--sp-4)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'white', borderRadius: 'var(--r-lg)', width: 'min(720px,100%)',
        maxHeight: '88vh', overflowY: 'auto', padding: 'var(--sp-5)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>Pilih label sebutan</div>
        <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 'var(--sp-4)', lineHeight: 1.6 }}>
          {NAMA_SUMBER[baris.sumber] ?? baris.sumber} · @{baris.username ?? '—'}. Sentimen dan risiko
          hanya boleh satu; kategori dan poli boleh lebih dari satu.
        </div>

        <Judul>Kategori</Judul>
        <Kotak daftar={topik} dipilih={pT} set={setPT} />

        <Judul>Sentimen</Judul>
        <Kotak tunggal daftar={sentimen.map(s => ({ kode: s, nama: s, warna: WARNA_SENTIMEN[s] ?? '#64748B' }))}
          dipilih={pS} set={setPS} />

        <Judul>Risiko</Judul>
        <Kotak tunggal daftar={risiko.map(s => ({ kode: s, nama: s, warna: WARNA_RISIKO[s] ?? '#64748B' }))}
          dipilih={pR} set={setPR} />

        <Judul>Poli / Layanan</Judul>
        <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginBottom: 8, lineHeight: 1.6 }}>
          Boleh dikosongkan — sebutan dari mitra, liputan, dan spam biasanya tidak
          menyangkut bidang layanan mana pun.
        </div>
        {Object.entries(poliPerKelompok).map(([grup, daftar]) => (
          <div key={grup} style={{ marginBottom: 'var(--sp-3)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-faint)', marginBottom: 5 }}>{grup}</div>
            <Kotak daftar={daftar} dipilih={pU} set={setPU} />
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, marginTop: 'var(--sp-5)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={onBatal} style={tombol(false, false)}>Batal</button>
          <button disabled={sibuk} style={tombol(true, sibuk)}
            onClick={() => onSimpan({ topik: pT, sentimen: pS, unit: pU, risiko: pR })}>
            {sibuk ? '⏳ Menyimpan…' : 'Simpan penetapan'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Judul({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--c-text)', textTransform: 'uppercase', letterSpacing: '.5px', margin: 'var(--sp-4) 0 8px' }}>
      {children}
    </div>
  )
}
