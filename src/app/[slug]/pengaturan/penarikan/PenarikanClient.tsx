'use client'

/**
 * Pengaturan → Penarikan Data.
 *
 * Dipindah keluar dari halaman Integrasi Meta. Alasannya bukan kerapian: sejak
 * Google ikut ditarik, jadwal di panel lama mengatur DUA sumber, tetapi tinggal
 * di halaman yang namanya menyebut satu di antaranya. Admin yang mencari jadwal
 * penarikan Google tidak akan pernah melihat ke sana.
 *
 * Jadwalnya tetap SATU untuk kedua sumber — satu rumah sakit wajarnya punya satu
 * jam penarikan, dan dua jadwal yang bisa berbeda hanya menambah hal untuk salah
 * disetel.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type Status = 'ok' | 'sebagian' | 'gagal'

interface Baris { tanggal: string; status: Status; pesan: string | null }
interface RingkasSumber {
  sumber: 'META' | 'GOOGLE'
  terakhir: Baris | null
  riwayat: Baris[]
  hariBolong: string[]
}
interface Konfig {
  aktif: boolean
  jam_snapshot: number
  last_run_at: string | null
  barisHarian: number
  jumlahKonten: number
  terekamSejak: string | null
  sumber: RingkasSumber[]
  googleTersambung: boolean
  barisGbp: number
  ulasanGbp: number
}

const WARNA: Record<Status, { bg: string; fg: string; label: string }> = {
  ok:       { bg: '#F0FDF4', fg: '#16A34A', label: 'Berhasil' },
  sebagian: { bg: '#FFFBEB', fg: '#B45309', label: 'Sebagian' },
  gagal:    { bg: '#FEF2F2', fg: '#DC2626', label: 'Gagal' },
}

const angka = (n: number) => n.toLocaleString('id-ID')

const kartu: React.CSSProperties = {
  background: 'white', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)',
  padding: 'var(--sp-5)', marginTop: 'var(--sp-5)',
}

const tombol = (utama: boolean, sibuk: boolean): React.CSSProperties => ({
  padding: '8px 16px', borderRadius: 'var(--r-md)', fontFamily: 'inherit',
  fontSize: 13, fontWeight: 700, cursor: sibuk ? 'wait' : 'pointer',
  border: utama ? 'none' : '1.5px solid var(--c-border)',
  background: utama ? (sibuk ? '#94A3B8' : 'var(--c-secondary)') : 'white',
  color: utama ? 'white' : 'var(--c-text-muted)',
})

/**
 * Pita 30 hari. Kotak abu-abu berarti TIDAK ADA catatan sama sekali untuk hari
 * itu — bukan "belum berhasil", melainkan penarikan yang tidak pernah terjadi.
 * Inilah yang membuat laporan triwulan bisa tampak wajar padahal berlubang.
 */
function Pita({ r }: { r: RingkasSumber }) {
  const peta = new Map(r.riwayat.map(b => [b.tanggal, b.status]))
  const hari: { tgl: string; status: Status | null }[] = []
  for (let i = 29; i >= 0; i--) {
    const tgl = new Date(Date.now() + 7 * 3600_000 - i * 86_400_000).toISOString().slice(0, 10)
    hari.push({ tgl, status: peta.get(tgl) ?? null })
  }
  return (
    <div style={{ display: 'flex', gap: 2, marginTop: 10, flexWrap: 'wrap' }}>
      {hari.map(h => (
        <div key={h.tgl} title={`${h.tgl} — ${h.status ? WARNA[h.status].label : 'tidak ada catatan'}`}
          style={{
            width: 11, height: 18, borderRadius: 2,
            background: h.status ? WARNA[h.status].fg : '#E2E8F0',
          }} />
      ))}
    </div>
  )
}

export default function PenarikanClient({ slug }: { slug: string }) {
  const [cfg, setCfg]     = useState<Konfig | null>(null)
  const [sibuk, setSibuk] = useState('')
  const [galat, setGalat] = useState('')
  const [kabar, setKabar] = useState('')

  const muat = useCallback(async () => {
    try {
      const res  = await fetch(`/api/${slug}/pengaturan/snapshot`)
      const json = await res.json()
      if (json.success) setCfg(json.data); else setGalat(json.error || 'Gagal memuat konfigurasi')
    } catch { setGalat('Gagal menghubungi server') }
  }, [slug])

  useEffect(() => { muat() }, [muat])

  async function simpan(patch: { aktif?: boolean; jam_snapshot?: number }) {
    setSibuk('simpan'); setGalat('')
    try {
      const res  = await fetch(`/api/${slug}/pengaturan/snapshot`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (json.success) setCfg(json.data); else setGalat(json.error || 'Gagal menyimpan')
    } catch { setGalat('Gagal menghubungi server') }
    finally { setSibuk('') }
  }

  async function jalankan(kunci: string, body: Record<string, unknown> | null, pesanSukses: string) {
    setSibuk(kunci); setGalat(''); setKabar('')
    try {
      const res  = await fetch(`/api/${slug}/pengaturan/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    body ? JSON.stringify(body) : undefined,
      })
      const json = await res.json()
      if (!json.success) { setGalat(json.error || 'Gagal menjalankan'); await muat(); return }
      setKabar(pesanSukses)
      await muat()
    } catch { setGalat('Gagal menghubungi server') }
    finally { setSibuk('') }
  }

  const meta   = cfg?.sumber.find(s => s.sumber === 'META')   ?? null
  const google = cfg?.sumber.find(s => s.sumber === 'GOOGLE') ?? null

  return (
    <div>
      {/* ── Jadwal ─────────────────────────────────────────────────────── */}
      <div style={kartu}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-primary)' }}>⏱ Jadwal Penarikan</div>
            <p style={{ fontSize: 13, color: 'var(--c-text-muted)', margin: '4px 0 0', maxWidth: 640, lineHeight: 1.6 }}>
              Merekam angka Meta dan Google tiap hari supaya laporan triwulan tetap bisa dibuat.
              Keduanya punya alasan yang sama tapi sebab berbeda: Instagram menghapus riwayat
              hariannya dalam hitungan pekan, sedangkan metrik Google hilang setelah sekitar
              18 bulan. Keduanya mustahil ditarik belakangan.
            </p>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flexShrink: 0 }}>
            <input type="checkbox" checked={!!cfg?.aktif} disabled={!!sibuk || !cfg}
              onChange={e => simpan({ aktif: e.target.checked })}
              style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <span style={{ fontSize: 13, fontWeight: 700 }}>{cfg?.aktif ? 'Aktif' : 'Nonaktif'}</span>
          </label>
        </div>

        {cfg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, color: 'var(--c-text-muted)' }}>Jalan tiap hari pukul</label>
            <select value={cfg.jam_snapshot} disabled={!!sibuk}
              onChange={e => simpan({ jam_snapshot: Number(e.target.value) })}
              style={{ padding: '6px 10px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--c-border)', fontSize: 13, fontFamily: 'inherit' }}>
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}:00 WIB</option>
              ))}
            </select>
            <span style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>
              Berlaku untuk kedua sumber.
            </span>
          </div>
        )}
      </div>

      {galat && (
        <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #EF4444', marginTop: 10 }}>{galat}</div>
      )}
      {kabar && (
        <div style={{ background: '#F0FDF4', color: '#16A34A', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, borderLeft: '3px solid #16A34A', marginTop: 10 }}>{kabar}</div>
      )}

      {/* ── Meta ───────────────────────────────────────────────────────── */}
      {cfg && (
        <div style={kartu}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Meta — Instagram &amp; Facebook</div>
              <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginTop: 2 }}>
                Angka akun harian, insight per konten, dan story.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => jalankan('backfill', { mode: 'backfill', hari: 90 }, 'Konten lama ditarik.')}
                disabled={!!sibuk} style={tombol(false, sibuk === 'backfill')}>
                ⟲ Konten lama (90 hari)
              </button>
              <button onClick={() => jalankan('dm', { mode: 'dm', hari: 120 }, 'Riwayat DM ditarik.')}
                disabled={!!sibuk} style={tombol(false, sibuk === 'dm')}>
                💬 Riwayat DM (120 hari)
              </button>
              <button onClick={() => jalankan('meta', null, 'Penarikan Meta selesai.')}
                disabled={!!sibuk} style={tombol(true, sibuk === 'meta')}>
                {sibuk === 'meta' ? '⏳ Memproses…' : '▶ Jalankan sekarang'}
              </button>
            </div>
          </div>

          <Statistik items={[
            { l: 'Baris harian',   v: angka(cfg.barisHarian) },
            { l: 'Konten terekam', v: angka(cfg.jumlahKonten) },
            { l: 'Terekam sejak',  v: cfg.terekamSejak ? String(cfg.terekamSejak).slice(0, 10) : '—' },
          ]} />
          <Riwayat r={meta} />
        </div>
      )}

      {/* ── Google ─────────────────────────────────────────────────────── */}
      {cfg && (
        <div style={kartu}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Google Bisnis</div>
              <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginTop: 2 }}>
                Metrik harian tiap lokasi dan seluruh ulasan.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => jalankan('gbackfill', { mode: 'google-backfill', hari: 545 },
                  'Metrik lama ditarik. Rentangnya kini sepanjang yang masih dilayani Google.')}
                disabled={!!sibuk || !cfg.googleTersambung}
                style={{ ...tombol(false, sibuk === 'gbackfill'), opacity: cfg.googleTersambung ? 1 : .5 }}>
                ⟲ Tarik metrik lama (18 bulan)
              </button>
              <button
                onClick={() => jalankan('google', { mode: 'google' }, 'Penarikan Google selesai.')}
                disabled={!!sibuk || !cfg.googleTersambung}
                style={{ ...tombol(true, sibuk === 'google'), opacity: cfg.googleTersambung ? 1 : .5 }}>
                {sibuk === 'google' ? '⏳ Memproses…' : '▶ Jalankan sekarang'}
              </button>
            </div>
          </div>

          {!cfg.googleTersambung && (
            <div style={{ background: '#FFFBEB', color: '#92400E', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 12.5, marginTop: 12, lineHeight: 1.6 }}>
              Belum tersambung ke Google, jadi penarikan dilewati — termasuk oleh jadwal harian.
              Buka{' '}
              <Link href={`/${slug}/pengaturan/google-bisnis`} style={{ color: 'var(--c-secondary)', fontWeight: 700 }}>
                Integrasi Google Business
              </Link>.
            </div>
          )}

          <Statistik items={[
            { l: 'Baris metrik lokasi', v: angka(cfg.barisGbp) },
            { l: 'Ulasan tersimpan',    v: angka(cfg.ulasanGbp) },
            { l: 'Jalan terakhir',      v: google?.terakhir?.tanggal ?? '—' },
          ]} />
          <Riwayat r={google} />

          <p style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 12, lineHeight: 1.6 }}>
            Jalan pertama jauh lebih berat karena menarik seluruh riwayat ulasan; sesudahnya hanya
            ulasan baru atau yang disunting. Metrik selalu ditarik ulang 14 hari ke belakang, sebab
            angka Google belum matang saat tanggalnya lewat — tayangan Search dan klik telepon baru
            terisi sekitar hari keenam.
            {' '}<strong>Tarik metrik lama</strong> cukup dijalankan sekali, dan sebaiknya SEGERA:
            Google hanya melayani sekitar 18 bulan ke belakang, dan jendela itu bergeser tiap hari —
            tanggal yang jatuh keluar tidak bisa diambil kembali oleh siapa pun.
          </p>
        </div>
      )}
    </div>
  )
}

function Statistik({ items }: { items: { l: string; v: string }[] }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1,
      background: 'var(--c-border)', border: '1px solid var(--c-border)', borderRadius: 8,
      overflow: 'hidden', marginTop: 14,
    }}>
      {items.map(s => (
        <div key={s.l} style={{ background: 'white', padding: '10px 14px' }}>
          <div style={{ fontSize: 10, color: 'var(--c-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.l}</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--c-primary)' }}>{s.v}</div>
        </div>
      ))}
    </div>
  )
}

function Riwayat({ r }: { r: RingkasSumber | null }) {
  if (!r) return null
  const st = r.terakhir ? WARNA[r.terakhir.status] : null
  return (
    <>
      {st && (
        <div style={{ marginTop: 12, background: st.bg, color: st.fg, padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 12, lineHeight: 1.6 }}>
          <strong>{st.label}</strong> · {r.terakhir!.tanggal}
          {r.terakhir!.pesan && <> — {r.terakhir!.pesan}</>}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginTop: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        30 hari terakhir
      </div>
      <Pita r={r} />
      {r.hariBolong.length > 0 && (
        <div style={{ fontSize: 12, color: '#B45309', marginTop: 8, lineHeight: 1.6 }}>
          <strong>{r.hariBolong.length} hari tanpa catatan</strong> sejak penarikan dinyalakan
          {r.hariBolong.length <= 6 && <> — {r.hariBolong.join(', ')}</>}.
          Metrik Google untuk hari itu masih bisa ditarik ulang selama belum lewat 18 bulan;
          angka harian Meta tidak.
        </div>
      )}
      {!r.terakhir && (
        <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginTop: 8 }}>
          Belum pernah dijalankan.
        </div>
      )}
    </>
  )
}
