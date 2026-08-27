'use client'

/**
 * Tab Google Bisnis pada Kanal Publik.
 *
 * Bentuknya mengikuti batas API-nya, bukan sebaliknya:
 *
 *  - Kartu lokasi di atas, daftar ulasan SATU lokasi di bawah. Paginasi ulasan
 *    Google berjalan per lokasi dengan token yang tidak bisa disatukan, jadi
 *    daftar gabungan tujuh lokasi hanya bisa dangkal — menyesatkan pada listing
 *    utama yang ulasannya lebih dari seribu.
 *  - Urutan (terbaru / terburuk / terbaik) dikerjakan Google lewat `orderBy`.
 *  - "Sembunyikan yang sudah dibalas" TIDAK bisa diminta ke Google — API tidak
 *    menyediakan saringan itu. Karena itu ia bekerja pada ulasan yang sudah
 *    dimuat saja, dan labelnya menyebutkan itu apa adanya alih-alih berpura-pura
 *    menyaring seluruh ulasan.
 */

import { useCallback, useEffect, useState } from 'react'

interface RingkasLokasi {
  nama: string; judul: string; jumlahUlasan: number; rataRata: number | null
}
interface Ulasan {
  reviewId: string; bintang: number; pengulas: string; fotoPengulas: string | null
  teks: string; terjemahan: string | null; dibuatPada: string
  balasan: { teks: string; diperbaruiPada: string } | null
  fotoUlasan: string[]
}

const angka = (n: number) => Math.round(n).toLocaleString('id-ID')

const tanggal = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

/** Warna rating mengikuti ambang yang lazim dipakai tim pemasaran: <4,0 perlu perhatian. */
const warnaRating = (r: number | null) =>
  r == null ? 'var(--c-text-muted)' : r < 3.5 ? '#B91C1C' : r < 4.0 ? '#B45309' : 'var(--c-success)'

function Bintang({ n }: { n: number }) {
  return (
    <span aria-label={`${n} dari 5 bintang`} style={{ color: '#F59E0B', letterSpacing: 1 }}>
      {'★'.repeat(n)}<span style={{ color: 'var(--c-border)' }}>{'★'.repeat(5 - n)}</span>
    </span>
  )
}

const kartu: React.CSSProperties = {
  background: 'white', border: '1px solid var(--c-border)',
  borderRadius: 'var(--r-md)', marginBottom: 'var(--sp-5)',
}

const tombol = (utama: boolean): React.CSSProperties => ({
  padding: '6px 13px', borderRadius: 'var(--r-md)', cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 12, fontWeight: 700,
  border: utama ? 'none' : '1.5px solid var(--c-border)',
  background: utama ? 'var(--c-secondary)' : 'white',
  color: utama ? 'white' : 'var(--c-text-muted)',
})

export default function GoogleBisnisTab({ slug, bisaBalas }: { slug: string; bisaBalas: boolean }) {
  const [lokasi, setLokasi]     = useState<RingkasLokasi[]>([])
  const [pilih, setPilih]       = useState<string>('')
  const [ulasan, setUlasan]     = useState<Ulasan[]>([])
  const [lanjut, setLanjut]     = useState<string | null>(null)
  const [urutan, setUrutan]     = useState<'terbaru' | 'terburuk' | 'terbaik'>('terbaru')
  const [sembunyi, setSembunyi] = useState(false)
  const [muatLokasi, setMuatLokasi] = useState(true)
  const [muatUlasan, setMuatUlasan] = useState(false)
  const [galat, setGalat]       = useState('')

  // Balasan
  const [draf, setDraf]         = useState<Record<string, string>>({})
  const [konfirmasi, setKonfirmasi] = useState<{ u: Ulasan; teks: string } | null>(null)
  const [kirim, setKirim]       = useState(false)
  const [kabar, setKabar]       = useState('')

  // ── Muat daftar lokasi sekali di awal ────────────────────────────────────
  useEffect(() => {
    (async () => {
      setMuatLokasi(true); setGalat('')
      try {
        const res  = await fetch(`/api/${slug}/kanal-publik/google-bisnis/lokasi`)
        const json = await res.json()
        if (!json.success) { setGalat(json.error ?? 'Gagal memuat profil bisnis.'); return }
        setLokasi(json.data)
        // Lokasi dengan ulasan terbanyak sudah berada di urutan pertama dari server.
        if (json.data.length > 0) setPilih(json.data[0].nama)
      } catch {
        setGalat('Tidak bisa menghubungi server.')
      } finally {
        setMuatLokasi(false)
      }
    })()
  }, [slug])

  // ── Muat ulasan tiap kali lokasi atau urutan berubah ─────────────────────
  const muatHalamanPertama = useCallback(async () => {
    if (!pilih) return
    setMuatUlasan(true); setGalat(''); setUlasan([]); setLanjut(null)
    try {
      const p = new URLSearchParams({ lokasi: pilih, urutan })
      const res  = await fetch(`/api/${slug}/kanal-publik/google-bisnis/ulasan?${p}`)
      const json = await res.json()
      if (!json.success) { setGalat(json.error ?? 'Gagal memuat ulasan.'); return }
      setUlasan(json.ulasan); setLanjut(json.tokenLanjut)
    } catch {
      setGalat('Tidak bisa menghubungi server.')
    } finally {
      setMuatUlasan(false)
    }
  }, [slug, pilih, urutan])

  useEffect(() => { muatHalamanPertama() }, [muatHalamanPertama])

  async function muatLagi() {
    if (!lanjut) return
    setMuatUlasan(true)
    try {
      const p = new URLSearchParams({ lokasi: pilih, urutan, token: lanjut })
      const res  = await fetch(`/api/${slug}/kanal-publik/google-bisnis/ulasan?${p}`)
      const json = await res.json()
      if (!json.success) { setGalat(json.error ?? 'Gagal memuat ulasan.'); return }
      setUlasan(l => [...l, ...json.ulasan]); setLanjut(json.tokenLanjut)
    } finally {
      setMuatUlasan(false)
    }
  }

  async function kirimBalasan() {
    if (!konfirmasi) return
    setKirim(true); setGalat(''); setKabar('')
    try {
      const res = await fetch(`/api/${slug}/kanal-publik/google-bisnis/ulasan`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ lokasi: pilih, reviewId: konfirmasi.u.reviewId, teks: konfirmasi.teks }),
      })
      const json = await res.json()
      if (!json.success) { setGalat(json.error ?? 'Balasan gagal terkirim.'); return }

      // Diperbarui di tempat supaya daftar tidak melompat ke atas — admin sering
      // membalas beberapa ulasan berurutan.
      setUlasan(l => l.map(x => x.reviewId === konfirmasi.u.reviewId
        ? { ...x, balasan: { teks: konfirmasi.teks, diperbaruiPada: new Date().toISOString() } }
        : x))
      setDraf(d => { const s = { ...d }; delete s[konfirmasi.u.reviewId]; return s })
      setKabar('Balasan terkirim dan sudah tayang di Google.')
      setKonfirmasi(null)
    } catch {
      setGalat('Tidak bisa menghubungi server.')
    } finally {
      setKirim(false)
    }
  }

  /** Menarik balasan yang sudah tayang. Dikonfirmasi lewat confirm() bawaan —
   *  dialog penuh disediakan untuk mengirim, karena di situlah teks perlu dibaca
   *  ulang; menghapus tidak punya teks baru yang perlu diperiksa. */
  async function hapus(u: Ulasan) {
    if (!window.confirm(`Hapus balasan untuk ulasan ${u.pengulas}? Balasan akan hilang dari Google.`)) return
    setGalat(''); setKabar('')
    try {
      const p = new URLSearchParams({ lokasi: pilih, reviewId: u.reviewId })
      const res  = await fetch(`/api/${slug}/kanal-publik/google-bisnis/ulasan?${p}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) { setGalat(json.error ?? 'Balasan gagal dihapus.'); return }
      setUlasan(l => l.map(x => x.reviewId === u.reviewId ? { ...x, balasan: null } : x))
      setKabar('Balasan dihapus dari Google.')
    } catch {
      setGalat('Tidak bisa menghubungi server.')
    }
  }

  const terpilih = lokasi.find(l => l.nama === pilih)
  const tampil   = sembunyi ? ulasan.filter(u => !u.balasan) : ulasan
  const belumDibalas = ulasan.filter(u => !u.balasan).length

  if (muatLokasi) {
    return <div style={{ padding: 'var(--sp-5)', color: 'var(--c-text-muted)' }}>Memuat profil bisnis…</div>
  }

  if (galat && lokasi.length === 0) {
    return (
      <div style={{ ...kartu, padding: 'var(--sp-5)', borderColor: '#FCA5A5' }}>
        <strong style={{ color: '#B91C1C' }}>{galat}</strong>
      </div>
    )
  }

  return (
    <>
      {/* ── Kartu tiap profil bisnis ─────────────────────────────────────── */}
      <div style={{
        display: 'grid', gap: 12, marginBottom: 'var(--sp-5)',
        gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))',
      }}>
        {lokasi.map(l => {
          const aktif = l.nama === pilih
          return (
            <button key={l.nama} onClick={() => setPilih(l.nama)}
              style={{
                textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', padding: 14,
                borderRadius: 'var(--r-md)', background: 'white',
                border: aktif ? '2px solid var(--c-secondary)' : '1px solid var(--c-border)',
                boxShadow: aktif ? '0 2px 10px rgba(0,0,0,.07)' : 'none',
              }}>
              <div style={{
                fontSize: 12.5, fontWeight: 700, lineHeight: 1.35, minHeight: 34,
                color: 'var(--c-text)',
              }}>
                {l.judul}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 9 }}>
                <span style={{ fontSize: 23, fontWeight: 800, color: warnaRating(l.rataRata) }}>
                  {l.rataRata != null ? l.rataRata.toFixed(1) : '—'}
                </span>
                {l.rataRata != null && <Bintang n={Math.round(l.rataRata)} />}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--c-text-muted)', marginTop: 3 }}>
                {l.jumlahUlasan > 0 ? `${angka(l.jumlahUlasan)} ulasan` : 'Belum ada ulasan'}
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Daftar ulasan lokasi terpilih ────────────────────────────────── */}
      <div style={kartu}>
        <div style={{
          padding: 'var(--sp-5)', borderBottom: '1px solid var(--c-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{terpilih?.judul ?? 'Ulasan'}</div>
            <div style={{ fontSize: 11.5, color: 'var(--c-text-muted)', marginTop: 2 }}>
              {ulasan.length > 0
                ? `${angka(ulasan.length)} dimuat dari ${angka(terpilih?.jumlahUlasan ?? 0)} · ${belumDibalas} di antaranya belum dibalas`
                : 'Tidak ada ulasan untuk ditampilkan.'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={urutan} onChange={e => setUrutan(e.target.value as typeof urutan)}
              style={{
                padding: '6px 10px', borderRadius: 'var(--r-md)', fontFamily: 'inherit',
                fontSize: 12, border: '1.5px solid var(--c-border)', background: 'white',
              }}>
              <option value="terbaru">Terbaru</option>
              <option value="terburuk">Bintang terendah dulu</option>
              <option value="terbaik">Bintang tertinggi dulu</option>
            </select>
            <button onClick={() => setSembunyi(s => !s)} style={tombol(sembunyi)}>
              {sembunyi ? 'Tampilkan semua' : 'Sembunyikan yang sudah dibalas'}
            </button>
          </div>
        </div>

        {galat && (
          <div style={{ padding: 'var(--sp-5)', color: '#B91C1C', fontSize: 13 }}>{galat}</div>
        )}
        {kabar && (
          <div style={{ padding: '10px var(--sp-5)', color: 'var(--c-success)', fontSize: 12.5, fontWeight: 600 }}>
            {kabar}
          </div>
        )}

        {sembunyi && (
          <div style={{ padding: '8px var(--sp-5)', fontSize: 11, color: 'var(--c-text-muted)', borderBottom: '1px solid var(--c-border)' }}>
            Saringan ini bekerja pada {angka(ulasan.length)} ulasan yang sudah dimuat, bukan seluruh
            ulasan lokasi ini — Google tidak menyediakan saringan “belum dibalas”.
          </div>
        )}

        {tampil.map(u => (
          <div key={u.reviewId} style={{ padding: 'var(--sp-5)', borderBottom: '1px solid var(--c-border)' }}>
            <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
              {u.fotoPengulas
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={u.fotoPengulas} alt="" width={34} height={34}
                    style={{ borderRadius: '50%', flexShrink: 0 }} />
                : <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--c-border)', flexShrink: 0 }} />}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 9, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 13 }}>{u.pengulas}</strong>
                  <Bintang n={u.bintang} />
                  <span style={{ fontSize: 11.5, color: 'var(--c-text-muted)' }}>{tanggal(u.dibuatPada)}</span>
                  {!u.balasan && (
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                      background: '#FEF3C7', color: '#92400E',
                    }}>Belum dibalas</span>
                  )}
                </div>

                {u.teks
                  ? <p style={{ margin: '7px 0 0', fontSize: 13, lineHeight: 1.6 }}>{u.teks}</p>
                  : <p style={{ margin: '7px 0 0', fontSize: 12.5, color: 'var(--c-text-muted)', fontStyle: 'italic' }}>
                      Hanya bintang, tanpa teks ulasan.
                    </p>}

                {u.terjemahan && (
                  <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.55 }}>
                    Terjemahan Google: {u.terjemahan}
                  </p>
                )}

                {u.fotoUlasan.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {u.fotoUlasan.map((f, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={f} alt="" width={62} height={62}
                        style={{ borderRadius: 'var(--r-md)', objectFit: 'cover', background: 'var(--c-border)' }} />
                    ))}
                  </div>
                )}

                {/* Balasan yang sudah ada */}
                {u.balasan && (
                  <div style={{
                    marginTop: 9, padding: '9px 11px', background: '#F8FAFC',
                    borderLeft: '3px solid var(--c-secondary)', borderRadius: 4,
                  }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      Balasan rumah sakit · {tanggal(u.balasan.diperbaruiPada)}
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.55 }}>{u.balasan.teks}</p>
                  </div>
                )}

                {/* Kotak balas */}
                {bisaBalas && (
                  <div style={{ marginTop: 9 }}>
                    {draf[u.reviewId] === undefined ? (
                      <div style={{ display: 'flex', gap: 7 }}>
                        <button onClick={() => setDraf(d => ({ ...d, [u.reviewId]: u.balasan?.teks ?? '' }))}
                          style={tombol(false)}>
                          {u.balasan ? 'Ubah balasan' : 'Balas'}
                        </button>
                        {u.balasan && (
                          <button onClick={() => hapus(u)}
                            style={{ ...tombol(false), color: '#B91C1C', borderColor: '#FCA5A5' }}>
                            Hapus balasan
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <textarea
                          value={draf[u.reviewId]}
                          onChange={e => setDraf(d => ({ ...d, [u.reviewId]: e.target.value }))}
                          rows={3} maxLength={4096}
                          placeholder="Tulis balasan yang akan tayang publik di Google…"
                          style={{
                            width: '100%', padding: 9, borderRadius: 'var(--r-md)', fontFamily: 'inherit',
                            fontSize: 12.5, border: '1.5px solid var(--c-border)', resize: 'vertical',
                          }} />
                        <div style={{ display: 'flex', gap: 7, marginTop: 6, alignItems: 'center' }}>
                          <button
                            disabled={!draf[u.reviewId]?.trim()}
                            onClick={() => setKonfirmasi({ u, teks: draf[u.reviewId].trim() })}
                            style={{ ...tombol(true), opacity: draf[u.reviewId]?.trim() ? 1 : .5 }}>
                            Kirim balasan
                          </button>
                          <button onClick={() => setDraf(d => { const s = { ...d }; delete s[u.reviewId]; return s })}
                            style={tombol(false)}>Batal</button>
                          <span style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>
                            {angka(draf[u.reviewId]?.length ?? 0)} / 4096
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {tampil.length === 0 && !muatUlasan && !galat && (
          <div style={{ padding: 'var(--sp-5)', color: 'var(--c-text-muted)', fontSize: 13 }}>
            {sembunyi ? 'Semua ulasan yang dimuat sudah dibalas.' : 'Belum ada ulasan pada lokasi ini.'}
          </div>
        )}

        <div style={{ padding: 'var(--sp-5)', display: 'flex', justifyContent: 'center' }}>
          {muatUlasan
            ? <span style={{ fontSize: 12.5, color: 'var(--c-text-muted)' }}>Memuat…</span>
            : lanjut && <button onClick={muatLagi} style={tombol(false)}>Muat 50 ulasan berikutnya</button>}
        </div>
      </div>

      {/* ── Dialog konfirmasi ────────────────────────────────────────────── */}
      {konfirmasi && (
        <div
          role="dialog" aria-modal="true"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 50,
            display: 'grid', placeItems: 'center', padding: 16,
          }}>
          <div style={{ background: 'white', borderRadius: 'var(--r-md)', maxWidth: 480, width: '100%', padding: 20 }}>
            <h3 style={{ margin: 0, fontSize: 15.5 }}>Kirim balasan ke Google?</h3>
            <p style={{ fontSize: 12.5, color: 'var(--c-text-muted)', lineHeight: 1.6, marginTop: 7 }}>
              Balasan ini langsung tayang publik di Google Maps dan Google Search, atas nama{' '}
              <strong>{terpilih?.judul}</strong>.
              {konfirmasi.u.balasan && (
                <> Ulasan ini <strong>sudah pernah dibalas</strong>, dan balasan lama akan
                ditimpa — Google tidak menyimpan riwayatnya.</>
              )}
            </p>
            <div style={{
              marginTop: 11, padding: 11, background: '#F8FAFC', borderRadius: 'var(--r-md)',
              fontSize: 12.5, lineHeight: 1.6, maxHeight: 190, overflowY: 'auto', whiteSpace: 'pre-wrap',
            }}>
              {konfirmasi.teks}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 15 }}>
              <button onClick={() => setKonfirmasi(null)} disabled={kirim} style={tombol(false)}>Batal</button>
              <button onClick={kirimBalasan} disabled={kirim} style={{ ...tombol(true), opacity: kirim ? .6 : 1 }}>
                {kirim ? 'Mengirim…' : 'Ya, kirim sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
