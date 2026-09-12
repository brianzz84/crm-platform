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

import { useCallback, useEffect, useRef, useState } from 'react'
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

/**
 * Penjelasan tiap sumber, ditulis untuk ADMIN DAN MANAJEMEN — bukan untuk
 * programer.
 *
 * Ada di layar, bukan di dokumen, karena yang membaca angka ini enam bulan lagi
 * bukan orang yang ikut merancangnya. Tanpa keterangan, "Tandaan Instagram: 608"
 * dan "Ulasan Google: 1.652" akan dijumlahkan begitu saja seolah mengukur hal
 * yang sama — padahal yang satu berisi ucapan terima kasih dan yang lain berisi
 * keluhan.
 *
 * Tiap naskah menjawab tiga hal, berurutan: apa ini, di mana terjadinya, dan
 * apa yang perlu diwaspadai saat membacanya.
 */
const PENJELASAN: Record<string, { apa: string; catat: string }> = {
  SEBUTAN_IG: {
    apa: 'Unggahan orang lain yang menandai akun RKZ. Mereka memasang foto atau video '
       + 'di akunnya sendiri, lalu menandai RKZ di dalamnya. Yang tersimpan: takarir '
       + 'unggahan mereka, nama akunnya, dan tautan ke unggahan aslinya.',
    catat: 'Isinya cenderung baik — ucapan terima kasih, kegiatan bersama mitra, penanda '
         + 'lokasi. Itu bukan kebetulan: menandai adalah tindakan sukarela, dan orang '
         + 'yang kecewa tidak menandai rumah sakit di unggahannya. Jadi angka di sini '
         + 'menggambarkan siapa yang mau berasosiasi dengan RKZ, BUKAN sentimen publik '
         + 'secara keseluruhan.',
  },
  SEBUTAN_YT: {
    apa: 'Video orang lain yang menyebut nama RKZ. Ditemukan lewat pencarian kata kunci, '
       + 'bukan lewat tandaan — jadi video yang menyebut RKZ tanpa menandai siapa pun '
       + 'tetap tertangkap.',
    catat: 'YouTube mencocokkan kata secara longgar, sehingga sebagian besar hasilnya '
         + 'tidak ada kaitannya dengan RKZ. Hanya video yang memuat frasa lengkap di '
         + 'judul atau deskripsi yang disimpan; sisanya dibuang sebelum masuk. Video '
         + 'dari channel RKZ sendiri juga tidak ikut.',
  },
  SEBUTAN_ULASAN: {
    apa: 'Ulasan bintang di profil Google Maps RKZ — mencakup seluruh lokasi, bukan hanya '
       + 'rumah sakit utama. Bintangnya ditempelkan di depan tulisan supaya langsung '
       + 'terlihat saat ditinjau.',
    catat: 'Inilah tempat keluhan pasien paling sering mendarat, jadi jangan heran bila '
         + 'sentimennya lebih keras daripada sumber lain. Sekitar satu dari enam ulasan '
         + 'hanya berisi bintang tanpa tulisan — itu tetap disimpan, karena bintang saja '
         + 'sudah cukup untuk menilai puas atau tidak.',
  },
  SEBUTAN_KOMENTAR_IG: {
    apa: 'Komentar orang di bawah unggahan RKZ sendiri di Instagram. Berbeda dari Tandaan: '
       + 'yang ini terjadi di halaman kita, bukan di halaman mereka.',
    catat: 'Di sinilah pertanyaan dan keluhan biasanya ditulis, karena orang tahu RKZ pasti '
         + 'membacanya. Balasan dari admin RKZ sendiri TIDAK ikut tersimpan — kalau ikut, '
         + 'sentimen kita akan naik oleh kata-kata kita sendiri. Yang tidak tertangkap: '
         + 'komentar di unggahan orang lain.',
  },
  SEBUTAN_KOMENTAR_FB: {
    apa: 'Komentar orang di bawah unggahan RKZ sendiri di Facebook. Sama seperti Komentar '
       + 'IG, hanya berbeda kanal.',
    catat: 'Balasan admin RKZ sendiri tidak ikut tersimpan. Yang tidak tertangkap: komentar '
         + 'di unggahan orang lain.',
  },
}

const WARNA: Record<string, string> = {
  ok: 'var(--c-success)', sebagian: '#D97706', gagal: '#DC2626',
}

export default function PitaCakupan({ slug }: { slug: string }) {
  const [sumber, setSumber] = useState<Sumber[] | null>(null)
  const [buka, setBuka] = useState(false)
  /**
   * Sumber yang penjelasannya sedang tampil.
   *
   * HOVER di perangkat yang punya tetikus, KETUK di layar sentuh. Bukan salah
   * satu saja: hover lebih rapi di komputer, tetapi di ponsel hover tidak pernah
   * terjadi — keterangan yang hanya bisa dilihat dari komputer tidak menolong
   * orang yang membuka laporan dari jalan.
   *
   * Dipilih lewat `matchMedia('(hover: hover)')`, bukan dengan memasang kedua
   * penangan sekaligus: di layar sentuh, satu ketukan memicu mouseenter DAN
   * click berturut-turut, sehingga panelnya terbuka lalu langsung tertutup lagi.
   */
  const [jelas, setJelas] = useState<string | null>(null)
  const bisaHover = useRef(true)
  const tunda = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    bisaHover.current =
      typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches !== false
  }, [])

  /** Penutupan ditunda sesaat supaya kursor sempat berpindah dari ikon ke panel
   *  tanpa panelnya keburu hilang di celah antara keduanya. */
  const tutupNanti = () => {
    if (tunda.current) clearTimeout(tunda.current)
    tunda.current = setTimeout(() => setJelas(null), 120)
  }
  const batalTutup = () => { if (tunda.current) clearTimeout(tunda.current) }

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
      // Jangkar bagi panel penjelasan yang mengambang di bawahnya.
      position: 'relative',
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
            {PENJELASAN[s.kunci] && (
              <button
                onMouseEnter={() => { if (bisaHover.current) { batalTutup(); setJelas(s.kunci) } }}
                onMouseLeave={() => { if (bisaHover.current) tutupNanti() }}
                // Keyboard: Tab membuka, Tab berikutnya menutup. Tanpa onBlur,
                // panelnya akan menggantung terbuka setelah fokus berpindah.
                onFocus={() => { batalTutup(); setJelas(s.kunci) }}
                onBlur={tutupNanti}
                onClick={() => { if (!bisaHover.current) setJelas(j => j === s.kunci ? null : s.kunci) }}
                aria-label={`Apa itu ${s.label}?`}
                style={{
                  width: 15, height: 15, borderRadius: 999, flexShrink: 0, padding: 0,
                  border: `1px solid ${jelas === s.kunci ? 'var(--c-secondary)' : 'var(--c-border)'}`,
                  background: jelas === s.kunci ? 'var(--c-secondary)' : 'transparent',
                  color: jelas === s.kunci ? 'white' : 'var(--c-text-muted)',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, fontWeight: 800,
                  lineHeight: '13px',
                }}>i</button>
            )}
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

      {/* MENGAMBANG, bukan menyisip. Panel yang menyisip akan mendorong seluruh
          isi halaman turun tiap kali kursor lewat di atas ikon — dan pada hover,
          itu berarti halaman melompat-lompat selama tetikus digerakkan.
          Direntang `left: 0; right: 0` supaya lebarnya mengikuti pita dan tidak
          pernah terpotong di tepi layar, berapa pun posisi ikonnya. */}
      {jelas && PENJELASAN[jelas] && (
        <div
          onMouseEnter={batalTutup}
          onMouseLeave={() => { if (bisaHover.current) tutupNanti() }}
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
            marginTop: 6, lineHeight: 1.7,
            background: 'white', border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-lg)', padding: 'var(--sp-4)',
            boxShadow: '0 8px 24px rgba(15,23,42,.12)',
          }}>
          <div style={{ fontWeight: 800, color: 'var(--c-text)', marginBottom: 4 }}>
            {sumber.find(s => s.kunci === jelas)?.label}
          </div>
          <div style={{ color: 'var(--c-text)' }}>{PENJELASAN[jelas].apa}</div>
          {/* Bagian "yang perlu diwaspadai" dibedakan warnanya, karena inilah
              yang paling sering dilewatkan pembaca yang buru-buru — dan justru
              yang mencegah angka disalahtafsirkan. */}
          <div style={{ color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 'var(--r-sm)', padding: '8px 11px', marginTop: 8 }}>
            <strong>Yang perlu diperhatikan:</strong> {PENJELASAN[jelas].catat}
          </div>
        </div>
      )}

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
