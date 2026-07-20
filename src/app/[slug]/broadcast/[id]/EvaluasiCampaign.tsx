'use client'

import { useCallback, useEffect, useState } from 'react'

interface FunnelData {
  totalPenerima: number; terkirim: number; diterima: number; dibaca: number; dibalas: number; gagal: number
  errorBreakdown: { kode: string; jumlah: number }[]
}
interface SentimenRow { kategori: string; jumlah: number }
interface KonversiRow {
  personId: string; nama: string; tanggal: string; hariSetelahKirim: number
  layanan: string; jenis: 'langsung' | 'produk_lain'; pernahMembalas: boolean
}
interface SudahTerjadwalRow { personId: string; nama: string; jadwalKontrol: string }
interface Baseline { sebelum: number; sesudah: number; selisih: number }
interface RingkasanKonversi { orangBerkunjung: number; orangAmbilPromo: number; orangProdukLain: number; orangTanpaBalas: number }
interface EvaluasiData {
  belumDikirim: boolean
  hariWindow: number
  windowMulai: string | null
  windowSelesai: string | null
  funnel: FunnelData
  sentimenRekap: SentimenRow[]
  belumDihitungSentimen: number
  konversi: KonversiRow[]
  ringkasanKonversi: RingkasanKonversi
  sudahTerjadwal: SudahTerjadwalRow[]
  baseline: Baseline
}

const PILIHAN_HARI = [
  { label: '1 bulan', hari: 30 },
  { label: '3 bulan', hari: 90 },
  { label: '6 bulan', hari: 180 },
]

const SENTIMEN_CFG: Record<string, { label: string; color: string; bg: string }> = {
  tertarik:       { label: 'Tertarik',      color: '#278B58', bg: '#E8F5E9' },
  tanya:          { label: 'Bertanya',      color: '#0089A8', bg: '#E0F4F4' },
  menolak:        { label: 'Menolak',       color: '#9A6C00', bg: '#FDF3DC' },
  komplain:       { label: 'Komplain',      color: '#C0392B', bg: '#FDECEA' },
  salah_sasaran:  { label: 'Salah Sasaran', color: '#6B7B8D', bg: '#F1F3F6' },
  lainnya:        { label: 'Lainnya',       color: '#6B7B8D', bg: '#F1F3F6' },
}

function fmtTgl(s: string) {
  return new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}
function pct(num: number, den: number) {
  if (!den) return '—'
  return Math.round((num / den) * 100) + '%'
}

const kartu: React.CSSProperties = {
  background: 'white', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)',
  padding: 'var(--sp-5)', boxShadow: 'var(--shadow-sm)', marginBottom: 'var(--sp-5)',
}
const judulKartu: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: 'var(--c-primary)', marginBottom: 'var(--sp-4)',
}

export default function EvaluasiCampaign({ slug, campaignId }: { slug: string; campaignId: string }) {
  const [hari, setHari]         = useState(30)
  const [hariCustom, setHariCustom] = useState('')
  const [data, setData]         = useState<EvaluasiData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [hitungUlang, setHitungUlang] = useState(false)
  const [pesanHitung, setPesanHitung] = useState('')

  const load = useCallback(async (h: number) => {
    setLoading(true); setError('')
    try {
      const res  = await fetch(`/api/${slug}/broadcast/${campaignId}/evaluasi?hari=${h}`)
      const json = await res.json()
      if (!json.success) { setError(json.error || 'Gagal memuat evaluasi'); return }
      setData(json.data)
    } catch { setError('Gagal menghubungi server') }
    finally { setLoading(false) }
  }, [slug, campaignId])

  useEffect(() => { load(hari) }, [load, hari])

  async function jalankanHitungUlangSentimen() {
    setHitungUlang(true); setPesanHitung(''); setError('')
    try {
      const res  = await fetch(`/api/${slug}/broadcast/${campaignId}/evaluasi/sentimen`, { method: 'POST' })
      const json = await res.json()
      if (!json.success) { setError(json.error || 'Gagal menghitung sentimen'); return }
      const h = json.data
      setPesanHitung(`Selesai: ${h.diproses} balasan diklasifikasi${h.dilewatiKosong ? `, ${h.dilewatiKosong} dilewati (tidak ada pesan)` : ''}${h.gagal ? `, ${h.gagal} gagal` : ''}.`)
      await load(hari)
    } catch { setError('Gagal menghubungi server') }
    finally { setHitungUlang(false) }
  }

  function terapkanHariCustom() {
    const n = parseInt(hariCustom, 10)
    if (Number.isFinite(n) && n >= 1 && n <= 730) setHari(n)
  }

  if (loading && !data) {
    return <div style={{ ...kartu, textAlign: 'center', color: 'var(--c-text-muted)' }}>Memuat evaluasi…</div>
  }
  if (error && !data) {
    return <div style={{ ...kartu, color: '#C0392B' }}>⚠ {error}</div>
  }
  if (!data) return null

  if (data.belumDikirim) {
    return (
      <div style={{ ...kartu, textAlign: 'center', color: 'var(--c-text-muted)' }}>
        Campaign ini belum pernah dikirim — evaluasi baru tersedia setelah campaign berjalan.
      </div>
    )
  }

  const totalSentimenTerhitung = data.sentimenRekap.reduce((a, s) => a + s.jumlah, 0)
  const r = data.ringkasanKonversi

  return (
    <div>
      {/* ── Pemilih jendela waktu ── */}
      <div style={{ ...kartu, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>Jendela evaluasi:</span>
        {PILIHAN_HARI.map(p => (
          <button key={p.hari} onClick={() => { setHari(p.hari); setHariCustom('') }}
            style={{
              padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: hari === p.hari ? '2px solid var(--c-secondary)' : '1.5px solid var(--c-border)',
              background: hari === p.hari ? 'var(--c-secondary)18' : 'white',
              color: hari === p.hari ? 'var(--c-secondary)' : 'var(--c-text-muted)', fontFamily: 'inherit',
            }}>
            {p.label}
          </button>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input value={hariCustom} onChange={e => setHariCustom(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && terapkanHariCustom()}
            placeholder="custom (hari)" style={{
              width: 100, padding: '6px 10px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--c-border)',
              fontSize: 12, fontFamily: 'inherit', outline: 'none',
            }} />
          <button onClick={terapkanHariCustom} style={{
            padding: '6px 12px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--c-border)',
            background: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--c-text)', fontFamily: 'inherit',
          }}>
            Terapkan
          </button>
        </div>
        {loading && <span style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>Memuat…</span>}
        <span style={{ fontSize: 12, color: 'var(--c-text-muted)', marginLeft: 'auto' }}>
          {data.windowMulai && `${fmtTgl(data.windowMulai)} → ${fmtTgl(data.windowSelesai!)}`}
        </span>
      </div>

      {error && <div style={{ ...kartu, color: '#C0392B', fontSize: 13 }}>⚠ {error}</div>}

      {/* ── Funnel (seumur hidup — tidak dipengaruhi jendela) ── */}
      <div style={kartu}>
        <div style={judulKartu}>Funnel Pengiriman <span style={{ fontWeight: 400, color: 'var(--c-text-muted)', textTransform: 'none' }}>(seumur hidup campaign, tidak dibatasi jendela)</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 'var(--sp-3)' }}>
          {[
            { label: 'Penerima', val: data.funnel.totalPenerima, sub: null,                                          color: 'var(--c-primary)' },
            { label: 'Terkirim',  val: data.funnel.terkirim,      sub: pct(data.funnel.terkirim, data.funnel.totalPenerima), color: 'var(--c-secondary)' },
            { label: 'Diterima',  val: data.funnel.diterima,      sub: pct(data.funnel.diterima, data.funnel.terkirim),      color: '#7B5EA7' },
            { label: 'Dibaca',    val: data.funnel.dibaca,        sub: pct(data.funnel.dibaca,   data.funnel.terkirim),      color: '#278B58' },
            { label: 'Dibalas',   val: data.funnel.dibalas,       sub: pct(data.funnel.dibalas,  data.funnel.terkirim),      color: '#E8A800' },
            { label: 'Gagal',     val: data.funnel.gagal,         sub: pct(data.funnel.gagal,    data.funnel.totalPenerima), color: '#EF4444' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--c-bg)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val.toLocaleString('id-ID')}</div>
              {s.sub && <div style={{ fontSize: 11, color: s.color, fontWeight: 600 }}>{s.sub}</div>}
              <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
        {data.funnel.errorBreakdown.length > 0 && (
          <div style={{ marginTop: 'var(--sp-4)', fontSize: 12, color: 'var(--c-text-muted)' }}>
            <strong style={{ color: 'var(--c-text)' }}>Rincian gagal</strong> (kualitas data kontak, bukan kegagalan pesan):
            {data.funnel.errorBreakdown.map(e => (
              <span key={e.kode} style={{ display: 'block', marginTop: 4 }}>• {e.jumlah}× — {e.kode}</span>
            ))}
          </div>
        )}
      </div>

      {/* ── Sentimen balasan ── */}
      <div style={kartu}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)', flexWrap: 'wrap', gap: 8 }}>
          <div style={judulKartu}>Sentimen Balasan</div>
          <button onClick={jalankanHitungUlangSentimen} disabled={hitungUlang || data.funnel.dibalas === 0}
            style={{
              padding: '7px 14px', borderRadius: 'var(--r-sm)', border: 'none',
              background: hitungUlang || data.funnel.dibalas === 0 ? 'var(--c-border)' : 'var(--c-secondary)',
              color: hitungUlang || data.funnel.dibalas === 0 ? 'var(--c-text-faint)' : 'white',
              fontWeight: 600, fontSize: 12, fontFamily: 'inherit',
              cursor: hitungUlang || data.funnel.dibalas === 0 ? 'not-allowed' : 'pointer',
            }}>
            {hitungUlang ? '⏳ Menghitung…' : '🔄 Hitung Ulang Sentimen'}
          </button>
        </div>
        {pesanHitung && <div style={{ fontSize: 12, color: '#278B58', marginBottom: 'var(--sp-3)' }}>✓ {pesanHitung}</div>}

        {data.funnel.dibalas === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--c-text-muted)' }}>Belum ada balasan.</div>
        ) : totalSentimenTerhitung === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--c-text-muted)' }}>
            {data.belumDihitungSentimen} balasan belum dianalisis — klik "Hitung Ulang Sentimen" di atas.
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 'var(--sp-3)' }}>
              {data.sentimenRekap.map(s => {
                const cfg = SENTIMEN_CFG[s.kategori] ?? SENTIMEN_CFG.lainnya
                return (
                  <div key={s.kategori} style={{ background: cfg.bg, borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: cfg.color }}>{s.jumlah}</div>
                    <div style={{ fontSize: 11, color: cfg.color, fontWeight: 600, marginTop: 2 }}>{cfg.label}</div>
                  </div>
                )
              })}
            </div>
            {data.belumDihitungSentimen > 0 && (
              <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginTop: 'var(--sp-3)' }}>
                {data.belumDihitungSentimen} balasan baru belum dianalisis.
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Konversi kunjungan ── */}
      <div style={kartu}>
        <div style={judulKartu}>Konversi Kunjungan <span style={{ fontWeight: 400, color: 'var(--c-text-muted)', textTransform: 'none' }}>(dalam {data.hariWindow} hari setelah kirim)</span></div>
        <div style={{ display: 'flex', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)', flexWrap: 'wrap' }}>
          <div><span style={{ fontSize: 24, fontWeight: 800, color: 'var(--c-primary)' }}>{r.orangBerkunjung}</span> <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>orang berkunjung</span></div>
          <div><span style={{ fontSize: 24, fontWeight: 800, color: '#278B58' }}>{r.orangAmbilPromo}</span> <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>ambil produk dipromosikan</span></div>
          <div><span style={{ fontSize: 24, fontWeight: 800, color: '#7B5EA7' }}>{r.orangProdukLain}</span> <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>hanya produk lain</span></div>
          <div><span style={{ fontSize: 24, fontWeight: 800, color: '#E8A800' }}>{r.orangTanpaBalas}</span> <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>tanpa pernah membalas</span></div>
        </div>

        {data.konversi.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginBottom: 6 }}>
              Satu baris per kunjungan — orang yang datang lebih dari sekali bisa muncul beberapa kali.
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Nama', 'Tanggal', 'H+', 'Layanan', 'Jenis', 'Sempat Balas'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', borderBottom: '2px solid var(--c-border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.konversi.map(k => (
                  <tr key={k.personId} style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{k.nama}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--c-text-muted)' }}>{fmtTgl(k.tanggal)}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--c-text-muted)' }}>H+{k.hariSetelahKirim}</td>
                    <td style={{ padding: '8px 12px' }}>{k.layanan}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                        background: k.jenis === 'langsung' ? '#E8F5E9' : '#F3EEF9',
                        color: k.jenis === 'langsung' ? '#278B58' : '#7B5EA7',
                      }}>
                        {k.jenis === 'langsung' ? 'Produk promo' : 'Produk lain'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', color: k.pernahMembalas ? '#278B58' : 'var(--c-text-faint)' }}>
                      {k.pernahMembalas ? 'Ya' : 'Tidak'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.sudahTerjadwal.length > 0 && (
          <div style={{ marginTop: 'var(--sp-4)', fontSize: 12, color: 'var(--c-text-muted)' }}>
            <strong style={{ color: 'var(--c-text)' }}>{data.sudahTerjadwal.length} orang dikecualikan dari konversi</strong> — sudah punya jadwal kontrol sebelum campaign ini dikirim:
            {data.sudahTerjadwal.map(s => (
              <span key={s.personId} style={{ display: 'block', marginTop: 4 }}>• {s.nama} (jadwal {fmtTgl(s.jadwalKontrol)})</span>
            ))}
          </div>
        )}
      </div>

      {/* ── Baseline pre/post ── */}
      <div style={kartu}>
        <div style={judulKartu}>Pembanding Sebelum/Sesudah</div>
        <p style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 'var(--sp-3)', lineHeight: 1.6 }}>
          Jumlah penerima yang berkunjung (apa pun layanannya) dalam {data.hariWindow} hari sebelum vs sesudah campaign.
          <strong> Ini bukan bukti sebab-akibat</strong> — dengan jumlah penerima sekecil ini, selisihnya bisa saja kebetulan.
        </p>
        <div style={{ display: 'flex', gap: 'var(--sp-5)', alignItems: 'baseline' }}>
          <div><span style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-text-muted)' }}>{data.baseline.sebelum}</span> <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>sebelum</span></div>
          <span style={{ fontSize: 18, color: 'var(--c-text-faint)' }}>→</span>
          <div><span style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-primary)' }}>{data.baseline.sesudah}</span> <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>sesudah</span></div>
          <div style={{
            fontSize: 14, fontWeight: 700,
            color: data.baseline.selisih > 0 ? '#278B58' : data.baseline.selisih < 0 ? '#C0392B' : 'var(--c-text-muted)',
          }}>
            {data.baseline.selisih > 0 ? '+' : ''}{data.baseline.selisih}
          </div>
        </div>
      </div>
    </div>
  )
}
