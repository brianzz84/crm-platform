/**
 * Probe Diagnostik Google Business Profile (Fase 0) — memverifikasi apakah
 * kredensial + akses API sudah cukup untuk menarik ULASAN, PERFORMA LOKASI, dan
 * STATUS LISTING, SEBELUM membangun penarik data & dashboard.
 *
 * Kenapa probe ini penting: akses Google Business Profile API tidak otomatis
 * meski akunnya sudah korporat — tiap API harus diaktifkan di project Google
 * Cloud DAN project-nya harus lolos peninjauan Google. Probe memisahkan dengan
 * jelas mana yang sudah hidup dan mana yang masih menunggu persetujuan, supaya
 * tidak ada tebak-tebakan saat menunggu.
 *
 * Privasi/keamanan:
 *  - Hanya GET read-only ke resource milik tenant. Tidak menulis apa pun ke Google.
 *  - client_secret & refresh_token tidak pernah di-log; potongan respons dipangkas.
 *  - Dibatasi laju sederhana per tenant agar tidak membebani kuota API.
 */
import {
  ambilAccessToken, gbpGet, pesanErrorGbp, namaLokasiV4,
  GBP_AKUN, GBP_INFO, GBP_PERFORMA, GBP_LAMA_V4,
  type KredensialGbp,
} from './google-business-client'

export type StatusCek = 'ok' | 'gagal' | 'lewati'

export interface HasilCek {
  kunci:   string
  label:   string
  status:  StatusCek
  pesan:   string
  detail?: string
}

export interface ConfigProbeGbp extends KredensialGbp {
  account_id?:     string | null
  location_utama?: string | null
}

// ── Rate limit sederhana per tenant (proses ini): maks 10 probe / 5 menit ──
const jejak = new Map<string, number[]>()
function cekBatasLaju(slug: string) {
  const now = Date.now(), jendela = 5 * 60_000
  const arr = (jejak.get(slug) ?? []).filter(t => now - t < jendela)
  if (arr.length >= 10) throw new Error('Terlalu banyak percobaan. Coba lagi beberapa menit.')
  arr.push(now); jejak.set(slug, arr)
}

const potong = (v: any, n = 240) => JSON.stringify(v ?? {}).slice(0, n)

/** YYYY-MM-DD beberapa hari lalu — data performa Google tertinggal beberapa hari. */
function mundurHari(n: number): { year: number; month: number; day: number } {
  const d = new Date(Date.now() - n * 86_400_000)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

export async function jalankanProbeGoogleBisnis(slug: string, cfg: ConfigProbeGbp): Promise<HasilCek[]> {
  cekBatasLaju(slug)
  const hasil: HasilCek[] = []

  // ── 1. Kredensial OAuth ──────────────────────────────────────────────
  let token: string
  try {
    token = await ambilAccessToken(slug, cfg)
    hasil.push({
      kunci: 'token', label: 'Kredensial OAuth',
      status: 'ok', pesan: 'Refresh token berhasil ditukar menjadi access token.',
    })
  } catch (e: any) {
    const pesan = String(e?.message ?? e)
    // invalid_grant hampir selalu berarti consent dicabut atau token sudah basi —
    // arahkan ke tindakan yang benar, bukan sekadar menampilkan kode errornya.
    const arahan = pesan.includes('invalid_grant')
      ? ' Refresh token tidak lagi berlaku (consent dicabut, atau dibuat ulang). Lakukan proses izin OAuth ulang lalu simpan refresh token yang baru.'
      : pesan.includes('invalid_client')
      ? ' Client ID atau Client Secret tidak cocok dengan project Google Cloud.'
      : ''
    return [{
      kunci: 'token', label: 'Kredensial OAuth', status: 'gagal',
      pesan: pesan + arahan,
    }]
  }

  // ── 2. Account Management API ────────────────────────────────────────
  let accountId = cfg.account_id?.trim() || ''
  const rAkun = await gbpGet(`${GBP_AKUN}/accounts?pageSize=20`, token)
  if (!rAkun.ok) {
    hasil.push({
      kunci: 'akun', label: 'Account Management API', status: 'gagal',
      pesan: pesanErrorGbp(rAkun) + (rAkun.status === 403
        ? ' — API belum diaktifkan di project Google Cloud, atau project belum disetujui Google.'
        : ''),
      detail: potong(rAkun.json),
    })
  } else {
    const daftar: any[] = rAkun.json?.accounts ?? []
    const cocok = accountId ? daftar.find(a => a.name === accountId) : null
    if (!accountId && daftar.length > 0) accountId = daftar[0].name   // pakai yang pertama utk cek lanjutan
    hasil.push({
      kunci: 'akun', label: 'Account Management API', status: 'ok',
      pesan: `${daftar.length} akun terbaca` +
        (cfg.account_id ? (cocok ? ` · "${cfg.account_id}" cocok.` : ` · PERINGATAN: "${cfg.account_id}" tidak ada dalam daftar.`) : '.'),
      detail: daftar.map(a => `${a.name} — ${a.accountName ?? '-'}`).join('\n').slice(0, 400),
    })
  }

  // ── 3. Business Information API — daftar & status listing ────────────
  let lokasiPertama = cfg.location_utama?.trim() || ''
  if (!accountId) {
    hasil.push({
      kunci: 'lokasi', label: 'Business Information API', status: 'lewati',
      pesan: 'Dilewati — belum ada Account ID (isi di form, atau perbaiki cek di atas dulu).',
    })
  } else {
    // readMask wajib diisi. Sengaja minimal (name,title) supaya cek ini menguji
    // AKSES, bukan ketersediaan field; penggalian field dilakukan di fase berikutnya.
    const rLok = await gbpGet(
      `${GBP_INFO}/${accountId}/locations?readMask=name,title&pageSize=100`, token,
    )
    if (!rLok.ok) {
      hasil.push({
        kunci: 'lokasi', label: 'Business Information API', status: 'gagal',
        pesan: pesanErrorGbp(rLok) + (rLok.status === 403
          ? ' — API belum diaktifkan di Google Cloud Console.'
          : ''),
        detail: potong(rLok.json),
      })
    } else {
      const lokasi: any[] = rLok.json?.locations ?? []
      if (!lokasiPertama && lokasi.length > 0) lokasiPertama = lokasi[0].name
      hasil.push({
        kunci: 'lokasi', label: 'Business Information API', status: 'ok',
        pesan: `${lokasi.length} lokasi terbaca dari ${accountId}.`,
        detail: lokasi.slice(0, 20).map(l => `${l.name} — ${l.title ?? '-'}`).join('\n'),
      })
    }
  }

  // ── 4. Business Performance API ──────────────────────────────────────
  if (!lokasiPertama) {
    hasil.push({
      kunci: 'performa', label: 'Business Performance API', status: 'lewati',
      pesan: 'Dilewati — belum ada lokasi yang bisa diuji.',
    })
  } else {
    const mulai   = mundurHari(10)
    const selesai = mundurHari(3)   // data performa Google tertinggal beberapa hari
    const q = new URLSearchParams()
    q.append('dailyMetrics', 'CALL_CLICKS')
    q.append('dailyMetrics', 'BUSINESS_DIRECTION_REQUESTS')
    q.append('dailyMetrics', 'WEBSITE_CLICKS')
    q.set('dailyRange.startDate.year',  String(mulai.year))
    q.set('dailyRange.startDate.month', String(mulai.month))
    q.set('dailyRange.startDate.day',   String(mulai.day))
    q.set('dailyRange.endDate.year',    String(selesai.year))
    q.set('dailyRange.endDate.month',   String(selesai.month))
    q.set('dailyRange.endDate.day',     String(selesai.day))

    const rPerf = await gbpGet(
      `${GBP_PERFORMA}/${lokasiPertama}:fetchMultiDailyMetricsTimeSeries?${q.toString()}`, token,
    )
    if (!rPerf.ok) {
      hasil.push({
        kunci: 'performa', label: 'Business Performance API', status: 'gagal',
        pesan: pesanErrorGbp(rPerf) + (rPerf.status === 403
          ? ' — API belum diaktifkan di Google Cloud Console.'
          : ''),
        detail: potong(rPerf.json),
      })
    } else {
      const seri: any[] = rPerf.json?.multiDailyMetricTimeSeries ?? []
      hasil.push({
        kunci: 'performa', label: 'Business Performance API', status: 'ok',
        pesan: `Metrik terbaca untuk ${lokasiPertama} (${seri.length} deret: klik telepon, permintaan rute, klik website).`,
        detail: potong(rPerf.json, 400),
      })
    }
  }

  // ── 5. Ulasan (API lama v4) ──────────────────────────────────────────
  if (!accountId || !lokasiPertama) {
    hasil.push({
      kunci: 'ulasan', label: 'Ulasan (API v4)', status: 'lewati',
      pesan: 'Dilewati — butuh Account ID dan minimal satu lokasi.',
    })
  } else {
    const rUlas = await gbpGet(
      `${GBP_LAMA_V4}/${namaLokasiV4(accountId, lokasiPertama)}/reviews?pageSize=5`, token,
    )
    if (!rUlas.ok) {
      hasil.push({
        kunci: 'ulasan', label: 'Ulasan (API v4)', status: 'gagal',
        // Ini cek yang PALING SERING merah lebih dulu: API v4 hanya terbuka untuk
        // project yang sudah lolos peninjauan Google, terpisah dari API v1.
        pesan: pesanErrorGbp(rUlas) + (rUlas.status === 403 || rUlas.status === 404
          ? ' — API lama (v4) khusus ulasan biasanya baru terbuka setelah project Anda disetujui Google. Ajukan akses lewat formulir Google Business Profile API.'
          : ''),
        detail: potong(rUlas.json),
      })
    } else {
      const ulasan: any[] = rUlas.json?.reviews ?? []
      hasil.push({
        kunci: 'ulasan', label: 'Ulasan (API v4)', status: 'ok',
        pesan: `Berhasil membaca ulasan — total ${rUlas.json?.totalReviewCount ?? ulasan.length} ulasan, rata-rata ${rUlas.json?.averageRating ?? '-'}.`,
        detail: ulasan.slice(0, 3).map(u => `${u.starRating ?? '-'} — ${(u.comment ?? '').slice(0, 80)}`).join('\n'),
      })
    }
  }

  return hasil
}
