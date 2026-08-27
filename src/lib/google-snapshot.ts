/**
 * Snapshot harian Google Business Profile — untuk LAPORAN, bukan dasbor.
 *
 * Dasbor Kanal Publik tetap membaca langsung dari API. Yang direkam di sini hanya
 * yang tidak bisa diambil lagi nanti, atau yang terlalu mahal dihitung ulang:
 *
 *  1. **Metrik performa** — Business Performance API hanya melayani ~18 bulan ke
 *     belakang. Diuji langsung 27 Agu 2026: terisi penuh pada 17 bulan lalu,
 *     KOSONG pada 19 bulan. Tanpa rekaman ini, pembandingan tahun-ke-tahun hilang
 *     selamanya — dan hilangnya tidak ketahuan sampai laporan disusun.
 *  2. **Ulasan** — sebenarnya permanen di Google dan bisa diambil ulang lewat
 *     reviewId. Disimpan atas keputusan sadar user: dipakai mengangkat ulasan
 *     tertentu untuk evaluasi, dan menghitung ulang dari API tiap menyusun laporan
 *     berarti ~33 panggilan berpaginasi per lokasi yang terus bertambah.
 *
 * Menumpang scanner BullMQ tiap jam yang sudah ada, memakai jadwal yang sama
 * dengan snapshot medsos (`SocialSnapshotConfig.jam_snapshot`) — satu tenant
 * seharusnya punya satu jam pengambilan, bukan dua yang bisa berbeda.
 */

import { GBP_LAMA_V4, GBP_PERFORMA, googleGet, namaLokasiV4, pesanErrorGoogle } from './google-client'
import {
  daftarLokasi, petakanUlasan, siapkanKlien,
  type LokasiGbp, type UlasanGbp, type UlasanMentah,
} from './google-ulasan'
import { getTenantDb } from './tenant'

/**
 * Berapa hari ke belakang ditarik ulang tiap malam.
 *
 * Bukan 1: angka Google belum matang saat tanggalnya lewat. Diukur langsung pada
 * listing utama RKZ (27 Agu 2026), dan keterlambatannya BERBEDA per metrik:
 *   - H-1 dan H-2  : seluruh metrik masih 0
 *   - H-3 s/d H-5  : metrik peta sudah terisi, tetapi tayangan Search dan klik
 *                    telepon MASIH 0
 *   - H-6 ke belakang: seluruhnya terisi
 *
 * Karena itu jendelanya 14 hari, bukan 10 — memberi margin seminggu di atas
 * keterlambatan terburuk yang teramati. Ongkosnya nol panggilan tambahan (rentang
 * ini ada di dalam satu permintaan yang sama), sementara jendela yang terlalu
 * pendek akan mengunci angka nol pada metrik TERBESAR secara permanen, dan
 * kekurangannya baru ketahuan saat laporan triwulan disusun — kalau ketahuan.
 */
const HARI_TARIK = 14

/** Ambang berhenti saat menarik ulasan bertahap — dua halaman penuh tak berubah. */
const CUKUP_TAK_BERUBAH = 100

/** Pagar supaya backfill pertama tidak berjalan tanpa batas. */
const MAKS_HALAMAN = 60

const METRIK = [
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
  'BUSINESS_DIRECTION_REQUESTS',
  'CALL_CLICKS',
  'WEBSITE_CLICKS',
] as const

const KOLOM: Record<string, string> = {
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS:   'tayangan_maps_desktop',
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 'tayangan_search_desktop',
  BUSINESS_IMPRESSIONS_MOBILE_MAPS:    'tayangan_maps_mobile',
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH:  'tayangan_search_mobile',
  BUSINESS_DIRECTION_REQUESTS:         'permintaan_rute',
  CALL_CLICKS:                         'klik_telepon',
  WEBSITE_CLICKS:                      'klik_website',
}

export interface HasilSnapshotGoogle {
  lokasi: string
  status: 'ok' | 'sebagian' | 'gagal'
  pesan:  string
}

const mundur = (n: number) => new Date(Date.now() - n * 86_400_000)

/** "2026-08-27" dari bagian tanggal Google, yang datang terpisah y/m/d. */
function keTanggal(d: { year?: number; month?: number; day?: number } | undefined): string | null {
  if (!d?.year || !d.month || !d.day) return null
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}

/**
 * Metrik harian satu lokasi, dikembalikan sebagai peta tanggal → kolom → nilai.
 *
 * Seluruh metrik diminta dalam SATU panggilan (parameter `dailyMetrics` boleh
 * berulang), bukan tujuh panggilan terpisah.
 */
async function tarikMetrik(
  token: string, lokasi: string, hariKeBelakang = HARI_TARIK,
): Promise<{ ok: true; data: Map<string, Record<string, number>> } | { ok: false; pesan: string }> {
  const a = mundur(hariKeBelakang), b = mundur(1)
  const q = new URLSearchParams()
  for (const m of METRIK) q.append('dailyMetrics', m)
  q.set('dailyRange.startDate.year',  String(a.getUTCFullYear()))
  q.set('dailyRange.startDate.month', String(a.getUTCMonth() + 1))
  q.set('dailyRange.startDate.day',   String(a.getUTCDate()))
  q.set('dailyRange.endDate.year',    String(b.getUTCFullYear()))
  q.set('dailyRange.endDate.month',   String(b.getUTCMonth() + 1))
  q.set('dailyRange.endDate.day',     String(b.getUTCDate()))

  const r = await googleGet(`${GBP_PERFORMA}/${lokasi}:fetchMultiDailyMetricsTimeSeries?${q}`, token)
  if (!r.ok) return { ok: false, pesan: pesanErrorGoogle(r) }

  const peta = new Map<string, Record<string, number>>()

  // Tanggal yang punya SETIDAKNYA SATU nilai hadir. Google mengirim deretan
  // tanggal lengkap bahkan untuk periode yang tidak ia layani lagi — di luar
  // jendela ~18 bulan, seluruh `value` hilang. Tanpa pembedaan ini, backfill akan
  // menuliskan nol untuk periode yang sebenarnya TIDAK DIKETAHUI, dan laporan
  // membacanya seolah RKZ tidak ditemukan siapa pun.
  //
  // Absennya `value` pada SEBAGIAN metrik tetap berarti nol — itu memang cara
  // Google menyatakan nol. Yang menandakan "tidak ada data" adalah absen SEMUA.
  const adaNilai = new Set<string>()

  for (const multi of r.json?.multiDailyMetricTimeSeries ?? []) {
    for (const deret of multi?.dailyMetricTimeSeries ?? []) {
      const kolom = KOLOM[deret?.dailyMetric]
      if (!kolom) continue
      for (const titik of deret?.timeSeries?.datedValues ?? []) {
        const tgl = keTanggal(titik?.date)
        if (!tgl) continue
        if (titik?.value != null) adaNilai.add(tgl)
        const baris = peta.get(tgl) ?? {}
        baris[kolom] = Number(titik?.value ?? 0)
        peta.set(tgl, baris)
      }
    }
  }

  for (const tgl of peta.keys()) if (!adaNilai.has(tgl)) peta.delete(tgl)
  return { ok: true, data: peta }
}

/** Ringkasan ulasan lokasi — ikut gratis pada respons ulasan mana pun. */
async function tarikRingkasUlasan(
  token: string, accountId: string, lokasi: string,
): Promise<{ jumlah: number; rataRata: number }> {
  const r = await googleGet(`${GBP_LAMA_V4}/${namaLokasiV4(accountId, lokasi)}/reviews?pageSize=1`, token)
  if (!r.ok) return { jumlah: 0, rataRata: 0 }
  return {
    jumlah:   Number(r.json?.totalReviewCount ?? 0),
    rataRata: Number(r.json?.averageRating ?? 0),
  }
}

/** Menjalankan potongan-potongan promise supaya tidak membanjiri basis data. */
async function berkelompok<T>(item: T[], ukuran: number, fn: (x: T) => Promise<void>) {
  for (let i = 0; i < item.length; i += ukuran) {
    await Promise.all(item.slice(i, i + ukuran).map(fn))
  }
}

/**
 * Menarik ulasan satu lokasi secara BERTAHAP.
 *
 * Diurutkan `updateTime desc`, jadi ulasan baru maupun yang barusan disunting
 * selalu muncul di depan. Penarikan berhenti setelah cukup banyak ulasan berturut
 * yang sudah tersimpan dengan `updateTime` sama — pada jalan pertama, ketika
 * belum ada apa pun tersimpan, ini otomatis menjadi backfill penuh.
 */
async function tarikUlasan(
  token: string, accountId: string, l: LokasiGbp, slug: string,
): Promise<{ baru: number; diperbarui: number; galat?: string }> {
  const db = await getTenantDb(slug)

  const tersimpan = new Map<string, string>(
    (await db.gbpReview.findMany({
      where:  { tenant_slug: slug, lokasi: l.nama },
      select: { review_id: true, diubah_pada: true },
    })).map(r => [r.review_id, r.diubah_pada.toISOString()]),
  )

  let pageToken = ''
  let halaman = 0
  let takBerubah = 0
  let baru = 0, diperbarui = 0

  do {
    const q = new URLSearchParams({ pageSize: '50', orderBy: 'updateTime desc' })
    if (pageToken) q.set('pageToken', pageToken)

    const r = await googleGet(`${GBP_LAMA_V4}/${namaLokasiV4(accountId, l.nama)}/reviews?${q}`, token)
    if (!r.ok) return { baru, diperbarui, galat: pesanErrorGoogle(r) }

    // Pemetaan dipakai bersama dengan tab Kanal Publik. Menyalinnya ke sini akan
    // membuat dua salinan yang menyimpang begitu bentuk respons Google berubah.
    const mentah: UlasanMentah[] = r.json?.reviews ?? []
    const perluTulis: UlasanGbp[] = []

    for (const m of mentah) {
      const u = petakanUlasan(m)
      if (!u.reviewId) continue
      if (tersimpan.get(u.reviewId) === new Date(u.diubahPada).toISOString()) { takBerubah++; continue }

      takBerubah = 0
      if (tersimpan.has(u.reviewId)) diperbarui++; else baru++
      perluTulis.push(u)
    }

    await berkelompok(perluTulis, 25, async (u) => {
      const isi = {
        lokasi:        l.nama,
        lokasi_judul:  l.judul,
        bintang:       u.bintang,
        pengulas:      u.pengulas,
        foto_pengulas: u.fotoPengulas,
        teks:          u.teks || null,
        terjemahan:    u.terjemahan,
        // URL thumbnail berumur pendek, jadi selalu ditimpa dengan yang baru.
        foto:          u.fotoUlasan,
        dibuat_pada:   new Date(u.dibuatPada),
        diubah_pada:   new Date(u.diubahPada),
        balasan_teks:  u.balasan?.teks ?? null,
        balasan_pada:  u.balasan ? new Date(u.balasan.diperbaruiPada) : null,
        diambil_pada:  new Date(),
      }
      await db.gbpReview.upsert({
        where:  { tenant_slug_review_id: { tenant_slug: slug, review_id: u.reviewId } },
        // `ditandai` dan `catatan` sengaja TIDAK ikut di-update: keduanya milik
        // CRM, dan menimpanya dengan data Google akan menghapus hasil evaluasi.
        update: isi,
        create: { tenant_slug: slug, review_id: u.reviewId, ...isi },
      })
    })

    pageToken = r.json?.nextPageToken ?? ''
    halaman++
  } while (pageToken && halaman < MAKS_HALAMAN && takBerubah < CUKUP_TAK_BERUBAH)

  return { baru, diperbarui }
}

/**
 * Menuliskan peta tanggal→metrik ke basis data.
 *
 * Dipakai bersama oleh tarikan harian dan backfill. `ringkas` adalah keadaan
 * ulasan SAAT DIAMBIL, bukan nilai historis tanggal itu — pada backfill ia
 * sengaja TIDAK ditulis, karena menempelkan rata-rata hari ini ke tanggal dua
 * tahun lalu akan membuat grafik rating tampak datar sempurna, dan itu dusta.
 */
async function simpanMetrik(
  slug: string,
  l: LokasiGbp,
  data: Map<string, Record<string, number>>,
  ringkas: { jumlah: number; rataRata: number } | null,
): Promise<void> {
  const db = await getTenantDb(slug)
  for (const [tgl, nilai] of data) {
    const isi = {
      lokasi_judul:            l.judul,
      tayangan_maps_desktop:   nilai.tayangan_maps_desktop   ?? 0,
      tayangan_search_desktop: nilai.tayangan_search_desktop ?? 0,
      tayangan_maps_mobile:    nilai.tayangan_maps_mobile    ?? 0,
      tayangan_search_mobile:  nilai.tayangan_search_mobile  ?? 0,
      permintaan_rute:         nilai.permintaan_rute         ?? 0,
      klik_telepon:            nilai.klik_telepon            ?? 0,
      klik_website:            nilai.klik_website            ?? 0,
      diambil_pada:            new Date(),
      ...(ringkas ? { jumlah_ulasan: ringkas.jumlah, rata_rata: ringkas.rataRata } : {}),
    }
    await db.gbpLocationDaily.upsert({
      where:  { tenant_slug_lokasi_tanggal: { tenant_slug: slug, lokasi: l.nama, tanggal: new Date(tgl) } },
      update: isi,
      create: { tenant_slug: slug, lokasi: l.nama, tanggal: new Date(tgl), ...isi },
    })
  }
}

/**
 * Tarik metrik jauh ke belakang, sekali jalan.
 *
 * MENDESAK saat pertama disiapkan, dan alasannya bukan kerapian: jendela ~18
 * bulan Google BERGESER TIAP HARI. Hari yang jatuh keluar tidak bisa diambil
 * kembali oleh siapa pun, termasuk Google sendiri. Menunda backfill sebulan
 * berarti kehilangan sebulan tertua secara permanen.
 *
 * Murah: satu panggilan per lokasi menutup seluruh rentang — diuji 27 Agu 2026,
 * 545 hari dalam satu permintaan, seluruhnya terisi.
 */
export async function backfillMetrikGoogle(
  slug: string, hari = 545,
): Promise<HasilSnapshotGoogle[]> {
  const klien = await siapkanKlien(slug)
  if (!klien.ok) return [{ lokasi: '-', status: 'gagal', pesan: klien.pesan }]

  const lokasi = await daftarLokasi(klien.token, klien.accountId)
  if (lokasi.length === 0) {
    return [{ lokasi: '-', status: 'gagal', pesan: 'Tidak ada lokasi terbaca dari akun Google.' }]
  }

  const hasil: HasilSnapshotGoogle[] = []
  for (const l of lokasi) {
    const metrik = await tarikMetrik(klien.token, l.nama, Math.min(Math.max(hari, 30), 600))
    if (!metrik.ok) {
      hasil.push({ lokasi: l.judul, status: 'gagal', pesan: `metrik: ${metrik.pesan}` })
      continue
    }
    // Tanpa `ringkas`: baris lama tidak boleh dicap rata-rata rating hari ini.
    await simpanMetrik(slug, l, metrik.data, null)

    const tgl = [...metrik.data.keys()].sort()
    hasil.push({
      lokasi: l.judul,
      status: metrik.data.size > 0 ? 'ok' : 'gagal',
      pesan:  metrik.data.size > 0
        ? `${metrik.data.size} hari (${tgl[0]} s/d ${tgl[tgl.length - 1]})`
        : 'tidak ada data dalam rentang itu',
    })
  }
  return hasil
}

/** Snapshot seluruh lokasi satu tenant. */
export async function jalankanSnapshotGoogle(slug: string): Promise<HasilSnapshotGoogle[]> {
  const klien = await siapkanKlien(slug)
  if (!klien.ok) return [{ lokasi: '-', status: 'gagal', pesan: klien.pesan }]

  const lokasi = await daftarLokasi(klien.token, klien.accountId)
  if (lokasi.length === 0) {
    return [{ lokasi: '-', status: 'gagal', pesan: 'Tidak ada lokasi terbaca dari akun Google.' }]
  }

  const hasil: HasilSnapshotGoogle[] = []

  for (const l of lokasi) {
    const catatan: string[] = []
    let gagal = 0

    // ── Metrik harian ────────────────────────────────────────────────────
    const metrik = await tarikMetrik(klien.token, l.nama)
    if (!metrik.ok) {
      gagal++
      catatan.push(`metrik: ${metrik.pesan}`)
    } else {
      const ringkas = await tarikRingkasUlasan(klien.token, klien.accountId, l.nama)
      await simpanMetrik(slug, l, metrik.data, ringkas)
      catatan.push(`metrik ${metrik.data.size} hari`)
    }

    // ── Ulasan ───────────────────────────────────────────────────────────
    const ulasan = await tarikUlasan(klien.token, klien.accountId, l, slug)
    if (ulasan.galat) {
      gagal++
      catatan.push(`ulasan: ${ulasan.galat}`)
    } else {
      catatan.push(`ulasan ${ulasan.baru} baru, ${ulasan.diperbarui} diperbarui`)
    }

    hasil.push({
      lokasi: l.judul,
      status: gagal === 0 ? 'ok' : gagal === 2 ? 'gagal' : 'sebagian',
      pesan:  catatan.join(' · '),
    })
  }

  return hasil
}
