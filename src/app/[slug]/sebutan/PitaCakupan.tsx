'use client'

/**
 * Pita cakupan — apa yang dipantau, dan apa yang TIDAK.
 *
 * Ditaruh di layar, bukan di dokumen, karena dokumen dibaca sekali saat dikirim
 * sementara kesimpulan ditarik berbulan-bulan kemudian di depan layar, oleh orang
 * yang tidak ikut rapat waktu itu. Keterangan cakupan harus hadir di TITIK
 * PENAFSIRAN.
 *
 * Dua bagian yang sifatnya berbeda:
 *
 * 1. Status tiap sumber — berubah tiap hari, datang dari catatan lari. Ini yang
 *    membedakan "penarik rusak tiga minggu" dari "penarik sehat yang tidak
 *    menemukan apa-apa"; tanpa catatan lari keduanya menghasilkan layar sepi yang
 *    identik.
 *
 * 2. Yang tidak terpantau — tidak pernah berubah, tidak butuh data. Ia cuma harus
 *    ADA di sana, supaya tak seorang pun perlu mengingat batasannya sendiri.
 */

import { useCallback, useEffect, useState } from 'react'
import { angka, tanggal } from './tampilan'

interface Sumber {
  kunci: string
  label: string
  terakhir: { tanggal: string; status: 'ok' | 'sebagian' | 'gagal'; pesan: string | null } | null
  hariBolong: number
  tersimpan: number
}

/**
 * Batas yang tidak akan berubah oleh pekerjaan apa pun. Ditulis di kode, bukan
 * ditarik dari mana-mana, karena ia memang bukan data — ia sifat platformnya.
 */
const TIDAK_TERPANTAU = [
  ['Komentar di unggahan orang lain',
   'Meta tidak punya endpoint pencarian komentar. Tidak di tingkat akses mana pun, tidak dengan biaya berapa pun.'],
  ['Unggahan Instagram tanpa tandaan dan tanpa tagar',
   'Hanya terjangkau lewat pencarian tagar, yang terkunci App Review “Instagram Public Content Access”.'],
  ['Twitter/X dan TikTok',
   'API-nya berbayar mahal atau menuntut afiliasi akademik.'],
  ['Akun privat',
   'Tidak terlihat oleh API mana pun.'],
  ['Klik dari AI Overviews Google',
   'Tiba sebagai organik google.com biasa, tidak terpisahkan bahkan di Search Console.'],
] as const

const WARNA: Record<string, string> = {
  ok: 'var(--c-success)', sebagian: '#D97706', gagal: '#DC2626',
}

export default function PitaCakupan({ slug }: { slug: string }) {
  const [sumber, setSumber] = useState<Sumber[] | null>(null)
  const [buka, setBuka] = useState(false)

  const ambil = useCallback(async () => {
    try {
      const res  = await fetch(`/api/${slug}/sebutan/cakupan`)
      const json = await res.json()
      if (json.success) setSumber(json.sumber ?? [])
    } catch { /* pita cakupan tidak boleh menggagalkan halaman */ }
  }, [slug])

  useEffect(() => { ambil() }, [ambil])

  if (!sumber) return null

  const bermasalah = sumber.filter(
    s => !s.terakhir || s.terakhir.status === 'gagal' || s.hariBolong > 0).length

  return (
    <div style={{
      background: 'var(--c-bg-subtle,#F8FAFC)', border: '1px solid var(--c-border)',
      borderRadius: 'var(--r-lg)', padding: '12px var(--sp-4)', marginBottom: 'var(--sp-4)',
      fontSize: 12,
    }}>
      <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontWeight: 800, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '.5px', fontSize: 10 }}>
          Yang dipantau
        </span>

        {sumber.map(s => (
          <span key={s.kunci} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 8, height: 8, borderRadius: 999, flexShrink: 0,
              background: s.terakhir ? WARNA[s.terakhir.status] : 'var(--c-text-faint)',
            }} />
            <span style={{ color: 'var(--c-text)' }}>{s.label}</span>
            <span style={{ color: 'var(--c-text-faint)' }}>
              {/* BELUM PERNAH BERJALAN dinyatakan apa adanya. Menampilkan "0
                  sebutan" untuk penarik yang tidak pernah hidup akan terbaca
                  sebagai "tidak ada yang membicarakan kita". */}
              {!s.terakhir
                ? '— belum pernah berjalan'
                : `${angka(s.tersimpan)} · ${tanggal(s.terakhir.tanggal)}`}
              {s.hariBolong > 0 && (
                <span style={{ color: '#B45309' }}> · {s.hariBolong} hari bolong</span>
              )}
            </span>
          </span>
        ))}

        <button onClick={() => setBuka(b => !b)} style={{
          marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 12, color: 'var(--c-secondary)', fontWeight: 700,
          padding: 0,
        }}>
          {buka ? 'Tutup' : 'Apa yang tidak terpantau?'}
        </button>
      </div>

      {bermasalah > 0 && (
        <div style={{ marginTop: 8, color: '#B45309', lineHeight: 1.6 }}>
          <strong>{bermasalah} dari {sumber.length} sumber tidak sehat.</strong>{' '}
          Selama itu berlangsung, daftar yang sepi <em>bukan</em> bukti tidak ada yang
          dibicarakan — hanya bukti tidak ada yang terbaca.
        </div>
      )}

      {buka && (
        <div style={{ marginTop: 'var(--sp-3)', paddingTop: 'var(--sp-3)', borderTop: '1px solid var(--c-border)' }}>
          <div style={{ color: 'var(--c-text-muted)', lineHeight: 1.65, marginBottom: 8 }}>
            Modul ini <strong>tidak menangkap semua</strong> percakapan tentang RKZ. Yang
            berikut berada di luar jangkauan dan tidak akan berubah oleh pekerjaan apa pun:
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--c-text-muted)', lineHeight: 1.7 }}>
            {TIDAK_TERPANTAU.map(([judul, sebab]) => (
              <li key={judul}>
                <strong style={{ color: 'var(--c-text)' }}>{judul}</strong> — {sebab}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 8, color: 'var(--c-text-faint)', lineHeight: 1.65 }}>
            Keluhan yang tidak menandai siapa pun paling sering mendarat di{' '}
            <strong>ulasan Google</strong>, dan itu terpantau.
          </div>
        </div>
      )}
    </div>
  )
}
