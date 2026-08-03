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
  ambilAccessToken, googleGet, googlePost, pesanErrorGoogle, namaLokasiV4,
  GBP_AKUN, GBP_INFO, GBP_PERFORMA, GBP_LAMA_V4,
  GA4_ADMIN, GA4_DATA, YT_DATA, YT_ANALYTICS,
  type KredensialGoogle,
} from './google-client'

export type StatusCek = 'ok' | 'gagal' | 'lewati'

export interface HasilCek {
  kunci:   string
  label:   string
  status:  StatusCek
  pesan:   string
  detail?: string
}

export interface ConfigProbeGbp extends KredensialGoogle {
  account_id?:         string | null
  location_utama?:     string | null
  ga4_property_id?:    string | null
  youtube_channel_id?: string | null
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

/** "YYYY-MM-DD" n hari lalu — format tanggal yang dipakai GA4 & YouTube Analytics. */
function tanggalMundur(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Petunjuk tindakan untuk kegagalan API Business Profile.
 *
 * Dipisahkan karena dua kode status di sini punya arti yang sangat berbeda dan
 * SANGAT mudah disalahartikan:
 *  - 403 → API-nya belum di-enable di project (masalah konfigurasi, cepat beres).
 *  - 429 → BUKAN "terlalu sering memanggil". Kuota project masih 0 permintaan per
 *    menit, sehingga permintaan PERTAMA pun langsung ditolak. Itulah wujud nyata
 *    pengajuan allowlist yang belum disetujui Google. Tanpa penjelasan ini, admin
 *    akan menyangka sistemnya membanjiri Google dan mencoba "menunggu sebentar",
 *    padahal yang ditunggu adalah persetujuan yang bisa makan waktu berminggu.
 */
function petunjukGbp(status: number): string {
  if (status === 403) return ' — API belum diaktifkan di project Google Cloud.'
  if (status === 429) return ' — kuota project masih 0 permintaan/menit, jadi permintaan pertama pun ditolak.' +
    ' Ini yang terjadi selama pengajuan akses Google Business Profile belum disetujui — bukan karena terlalu sering memanggil.' +
    ' Pantau di APIs & Services → Quotas: 0 = belum disetujui, 300 = sudah.'
  return ''
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
  const rAkun = await googleGet(`${GBP_AKUN}/accounts?pageSize=20`, token)
  if (!rAkun.ok) {
    hasil.push({
      kunci: 'akun', label: 'Account Management API', status: 'gagal',
      pesan: pesanErrorGoogle(rAkun) + petunjukGbp(rAkun.status),
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
    const rLok = await googleGet(
      `${GBP_INFO}/${accountId}/locations?readMask=name,title&pageSize=100`, token,
    )
    if (!rLok.ok) {
      hasil.push({
        kunci: 'lokasi', label: 'Business Information API', status: 'gagal',
        pesan: pesanErrorGoogle(rLok) + petunjukGbp(rLok.status),
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

    const rPerf = await googleGet(
      `${GBP_PERFORMA}/${lokasiPertama}:fetchMultiDailyMetricsTimeSeries?${q.toString()}`, token,
    )
    if (!rPerf.ok) {
      hasil.push({
        kunci: 'performa', label: 'Business Performance API', status: 'gagal',
        pesan: pesanErrorGoogle(rPerf) + petunjukGbp(rPerf.status),
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
    const rUlas = await googleGet(
      `${GBP_LAMA_V4}/${namaLokasiV4(accountId, lokasiPertama)}/reviews?pageSize=5`, token,
    )
    if (!rUlas.ok) {
      hasil.push({
        kunci: 'ulasan', label: 'Ulasan (API v4)', status: 'gagal',
        // Ini cek yang PALING SERING merah lebih dulu: API v4 hanya terbuka untuk
        // project yang sudah lolos peninjauan Google, terpisah dari API v1.
        pesan: pesanErrorGoogle(rUlas) + (rUlas.status === 403 || rUlas.status === 404
          ? ' — API lama (v4) khusus ulasan biasanya baru terbuka setelah project Anda disetujui Google. Ajukan akses lewat formulir Google Business Profile API.'
          : petunjukGbp(rUlas.status)),
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

  // ══ Layanan lain yang berbagi OAuth yang sama ═════════════════════════
  // Google Analytics & YouTube TIDAK menunggu allowlist Business Profile —
  // keduanya seharusnya hijau begitu tersambung, meski GBP masih ditinjau.
  // Memisahkannya di sini supaya jelas mana yang benar-benar terhambat.

  // ── 6. Google Analytics — daftar properti (Admin API) ────────────────
  let propertyId = cfg.ga4_property_id?.trim() || ''
  const rGaAdmin = await googleGet(`${GA4_ADMIN}/accountSummaries?pageSize=50`, token)
  if (!rGaAdmin.ok) {
    hasil.push({
      kunci: 'ga4_properti', label: 'Google Analytics — Properti', status: 'gagal',
      pesan: pesanErrorGoogle(rGaAdmin) + (rGaAdmin.status === 403
        ? ' — aktifkan "Google Analytics Admin API" di project Google Cloud, lalu sambungkan ulang bila scope analytics.readonly belum disetujui.'
        : ''),
      detail: potong(rGaAdmin.json),
    })
  } else {
    const ringkas: any[] = rGaAdmin.json?.accountSummaries ?? []
    const properti = ringkas.flatMap((a: any) =>
      (a.propertySummaries ?? []).map((p: any) => ({ id: p.property, nama: p.displayName, akun: a.displayName })),
    )
    const cocok = propertyId ? properti.find((p: any) => p.id === propertyId) : null
    if (!propertyId && properti.length > 0) propertyId = properti[0].id
    hasil.push({
      kunci: 'ga4_properti', label: 'Google Analytics — Properti', status: 'ok',
      pesan: `${properti.length} properti terbaca` +
        (cfg.ga4_property_id
          ? (cocok ? ` · "${cfg.ga4_property_id}" cocok.` : ` · PERINGATAN: "${cfg.ga4_property_id}" tidak ada dalam daftar.`)
          : properti.length ? ` · memakai "${propertyId}" untuk uji data.` : '.'),
      detail: properti.slice(0, 20).map((p: any) => `${p.id} — ${p.nama} (${p.akun})`).join('\n'),
    })
  }

  // ── 7. Google Analytics — tarik data (Data API) ──────────────────────
  if (!propertyId) {
    hasil.push({
      kunci: 'ga4_data', label: 'Google Analytics — Data', status: 'lewati',
      pesan: 'Dilewati — belum ada properti GA4 yang bisa diuji.',
    })
  } else {
    const rGaData = await googlePost(`${GA4_DATA}/${propertyId}:runReport`, token, {
      dateRanges: [{ startDate: tanggalMundur(28), endDate: tanggalMundur(1) }],
      metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }],
    })
    if (!rGaData.ok) {
      hasil.push({
        kunci: 'ga4_data', label: 'Google Analytics — Data', status: 'gagal',
        pesan: pesanErrorGoogle(rGaData) + (rGaData.status === 403
          ? ' — aktifkan "Google Analytics Data API" di project Google Cloud.'
          : ''),
        detail: potong(rGaData.json),
      })
    } else {
      const baris = rGaData.json?.rows?.[0]?.metricValues ?? []
      const [sesi, pengguna, tayang] = baris.map((m: any) => m.value ?? '0')
      hasil.push({
        kunci: 'ga4_data', label: 'Google Analytics — Data', status: 'ok',
        pesan: `Data 28 hari terakhir terbaca dari ${propertyId}: ${sesi ?? 0} sesi, ${pengguna ?? 0} pengguna aktif, ${tayang ?? 0} tayangan halaman.`,
        detail: potong(rGaData.json, 400),
      })
    }
  }

  // ── 8. YouTube — identitas channel (Data API) ────────────────────────
  const rYtChannel = await googleGet(`${YT_DATA}/channels?part=snippet,statistics&mine=true`, token)
  if (!rYtChannel.ok) {
    hasil.push({
      kunci: 'yt_channel', label: 'YouTube — Channel', status: 'gagal',
      pesan: pesanErrorGoogle(rYtChannel) + (rYtChannel.status === 403
        ? ' — aktifkan "YouTube Data API v3" di project Google Cloud.'
        : ''),
      detail: potong(rYtChannel.json),
    })
  } else {
    const items: any[] = rYtChannel.json?.items ?? []
    if (items.length === 0) {
      // Bukan error teknis: akun tersambung memang tidak memiliki channel.
      hasil.push({
        kunci: 'yt_channel', label: 'YouTube — Channel', status: 'gagal',
        pesan: 'API dapat diakses, tetapi akun yang tersambung tidak memiliki channel YouTube. Pastikan menyambungkan akun pemilik channel RKZ.',
      })
    } else {
      const c = items[0]
      hasil.push({
        kunci: 'yt_channel', label: 'YouTube — Channel', status: 'ok',
        pesan: `"${c.snippet?.title ?? '-'}" (${c.id}) — ${c.statistics?.subscriberCount ?? '?'} subscriber, ` +
          `${c.statistics?.videoCount ?? '?'} video, ${c.statistics?.viewCount ?? '?'} total tayangan.`,
        detail: potong(c.snippet, 300),
      })
    }
  }

  // ── 9. YouTube — metrik (Analytics API) ──────────────────────────────
  {
    const ch = cfg.youtube_channel_id?.trim()
    const q  = new URLSearchParams({
      // "MINE" = channel milik akun yang tersambung; dipakai bila belum diisi manual.
      ids:       ch ? `channel==${ch}` : 'channel==MINE',
      startDate: tanggalMundur(28),
      endDate:   tanggalMundur(2),   // data YouTube tertinggal 1–2 hari
      metrics:   'views,estimatedMinutesWatched,averageViewPercentage,subscribersGained',
    })
    const rYtA = await googleGet(`${YT_ANALYTICS}/reports?${q.toString()}`, token)
    if (!rYtA.ok) {
      hasil.push({
        kunci: 'yt_analytics', label: 'YouTube — Analytics', status: 'gagal',
        pesan: pesanErrorGoogle(rYtA) + (rYtA.status === 403
          ? ' — aktifkan "YouTube Analytics API" di project Google Cloud.'
          : ''),
        detail: potong(rYtA.json),
      })
    } else {
      const b = rYtA.json?.rows?.[0] ?? []
      hasil.push({
        kunci: 'yt_analytics', label: 'YouTube — Analytics', status: 'ok',
        pesan: b.length
          ? `28 hari terakhir: ${b[0]} tayangan, ${b[1]} menit ditonton, retensi rata-rata ${b[2]}%, ${b[3]} subscriber baru.`
          : 'API dapat diakses, tetapi belum ada data pada rentang 28 hari terakhir.',
        detail: potong(rYtA.json, 400),
      })
    }
  }

  return hasil
}
