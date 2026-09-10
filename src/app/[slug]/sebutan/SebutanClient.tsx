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

import { useCallback, useEffect, useMemo, useState } from 'react'

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

const NAMA_SUMBER: Record<string, string> = {
  IG_TAG: 'Instagram', FB_TAG: 'Facebook', FB_RATING: 'Rekomendasi FB',
  YOUTUBE: 'YouTube', GOOGLE_ULASAN: 'Ulasan Google',
  KOMENTAR_IG: 'Komentar IG', KOMENTAR_FB: 'Komentar FB',
}
const WARNA_SUMBER: Record<string, string> = {
  IG_TAG: '#E1306C', FB_TAG: '#1877F2', FB_RATING: '#1877F2',
  YOUTUBE: '#FF0000', GOOGLE_ULASAN: '#0F9D58',
  KOMENTAR_IG: '#E1306C', KOMENTAR_FB: '#1877F2',
}
const WARNA_SENTIMEN: Record<string, string> = {
  POSITIF: '#16A34A', NETRAL: '#64748B', NEGATIF: '#DC2626',
}
const WARNA_RISIKO: Record<string, string> = {
  RENDAH: '#16A34A', SEDANG: '#D97706', TINGGI: '#DC2626',
}

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
const angka = (n: number) => Math.round(n).toLocaleString('id-ID')
const tanggal = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

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
  const [saring, setSaring]   = useState<'perlu' | 'selesai' | 'semua'>('perlu')
  const [sumber, setSumber]   = useState('')
  const [muat, setMuat]       = useState(true)
  const [sibuk, setSibuk]     = useState('')
  const [galat, setGalat]     = useState('')
  const [kabar, setKabar]     = useState('')
  const [modal, setModal]     = useState<Baris | null>(null)

  const ambil = useCallback(async () => {
    setMuat(true); setGalat('')
    try {
      const q = new URLSearchParams({ saring })
      if (sumber) q.set('sumber', sumber)
      const res  = await fetch(`/api/${slug}/sebutan?${q}`)
      const json = await res.json()
      if (!json.success) { setGalat(json.error ?? 'Gagal memuat.'); return }
      setTopik(json.topik ?? []); setPoli(json.poli ?? [])
      setSentimen(json.sentimen ?? []); setRisiko(json.risiko ?? [])
      setRows(json.data ?? []); setPerlu(json.jumlahPerlu ?? 0)
      setPerSumber(json.perSumber ?? [])
    } catch { setGalat('Gagal menghubungi server.') }
    finally { setMuat(false) }
  }, [slug, saring, sumber])

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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
            <button onClick={tarik} disabled={!!sibuk} style={tombol(true, sibuk === 'tarik')}>
              {sibuk === 'tarik' ? '⏳ Menarik…' : '⤓ Tarik sekarang'}
            </button>
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
        <div style={{ display: 'flex', gap: 'var(--sp-5)', flexWrap: 'wrap', marginTop: 'var(--sp-4)', paddingTop: 'var(--sp-4)', borderTop: '1px solid var(--c-border)' }}>
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

      <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--sp-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        {([['perlu', 'Perlu ditinjau'], ['selesai', 'Sudah ditetapkan'], ['semua', 'Semua']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setSaring(k)} style={pil(saring === k)}>{label}</button>
        ))}
        <span style={{ width: 12 }} />
        <button onClick={() => setSumber('')} style={pil(sumber === '')}>Semua sumber</button>
        {perSumber.map(s => (
          <button key={s.sumber} onClick={() => setSumber(s.sumber)} style={pil(sumber === s.sumber)}>
            {NAMA_SUMBER[s.sumber] ?? s.sumber}
          </button>
        ))}
      </div>

      {muat ? (
        <div style={{ color: 'var(--c-text-muted)', fontSize: 'var(--font-size-sm)' }}>Memuat…</div>
      ) : !rows.length ? (
        <div style={{ ...kartu, color: 'var(--c-text-muted)', fontSize: 'var(--font-size-sm)', lineHeight: 1.7 }}>
          {totalSebutan === 0
            ? <>Belum ada sebutan tersimpan. Tekan <strong>⤓ Tarik sekarang</strong> untuk
               mengambil sebutan Instagram — penarikan pertama membawa ratusan konten lama sekaligus.</>
            : saring === 'perlu' ? 'Tidak ada yang perlu ditinjau.' : 'Tidak ada pada saringan ini.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
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
