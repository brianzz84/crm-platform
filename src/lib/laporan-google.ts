/**
 * Laporan Google Bisnis — dihitung dari tabel snapshot, bukan dari API.
 *
 * Alasannya berbeda untuk dua jenis datanya, dan perbedaan itu ditampilkan apa
 * adanya ke pembaca laporan:
 *
 *  - **Ulasan** lengkap sejak listing dibuat (RKZ: 2011), karena backfill pertama
 *    menarik seluruh riwayat. Periode mana pun bisa dilaporkan.
 *  - **Metrik performa** hanya sejauh yang sempat direkam. Google melayani ~18
 *    bulan ke belakang dan jendelanya bergeser tiap hari, jadi kedalamannya
 *    ditentukan kapan backfill dijalankan — bukan kapan listing dibuat.
 *
 * Karena itu `metrikSejak` dan `ulasanSejak` dikembalikan terpisah. Menampilkan
 * nol untuk periode sebelum perekaman akan terbaca seolah tidak ada yang mencari
 * RKZ di Google, dan itu kesimpulan yang salah dari data yang tidak ada.
 */

import { getTenantDb } from './tenant'

/** Angka satu profil dalam satu bulan — isi baris yang muncul saat bulan dibuka. */
export interface BarisBulanLokasi {
  lokasi:         string
  judul:          string
  tayanganSearch: number
  tayanganMaps:   number
  permintaanRute: number
  klikTelepon:    number
  klikWebsite:    number
}

export interface BarisBulan {
  bulan:           string // "2026-08"
  tayanganSearch:  number
  tayanganMaps:    number
  permintaanRute:  number
  klikTelepon:     number
  klikWebsite:     number
  /**
   * Rincian tiap profil pada bulan itu. Ikut dikirim, bukan diambil lewat
   * permintaan terpisah saat baris dibuka: seluruhnya hanya 18 bulan × 7 profil,
   * dan memuatnya sekaligus membuat rincian ikut tercetak — laporan ini akan
   * dicetak dan ditempel ke paparan, jadi isi yang hanya ada setelah diklik akan
   * hilang justru saat dipakai.
   */
  perLokasi:       BarisBulanLokasi[]
}

export interface BarisLokasi {
  lokasi:         string
  judul:          string
  tayangan:       number
  permintaanRute: number
  klikTelepon:    number
  klikWebsite:    number
  jumlahUlasan:   number
  rataRata:       number | null
}

export interface BarisUlasanBulan {
  bulan:    string
  jumlah:   number
  /**
   * Rata-rata bintang ulasan yang MASUK bulan itu — bukan rating listing.
   * Rating yang tampil di Google adalah akumulasi sejak listing dibuat (RKZ:
   * 2011), jadi keduanya hampir selalu berbeda dan mudah tertukar.
   */
  rataRata: number
  /**
   * Sebaran per bintang. Menggantikan satu ember "≤3", yang menyembunyikan
   * perbedaan yang justru paling penting: pada RKZ, sebarannya DUA KUTUB —
   * 12 bulan terakhir berisi 169 bintang-5 dan 25 bintang-1, dengan hampir
   * tidak ada apa pun di antaranya. Satu angka "32 ulasan ≤3" menyamarkan bahwa
   * 25 di antaranya adalah bintang terburuk.
   */
  bintang:  { b1: number; b2: number; b3: number; b4: number; b5: number }
  dibalas:  number
}

/** Kecepatan membalas ulasan yang masuk pada periode — ukuran layanan, bukan volume. */
export interface JedaBalasan {
  kurangSehari: number
  satuTiga:     number
  empatTujuh:   number
  lebihTujuh:   number
  belum:        number
}

export interface LaporanGoogle {
  metrikSejak:  string | null
  ulasanSejak:  string | null
  bulanan:      BarisBulan[]
  perLokasi:    BarisLokasi[]
  ulasanBulan:  BarisUlasanBulan[]
  jeda:         JedaBalasan
  ringkas: {
    tayangan:       number
    permintaanRute: number
    klikTelepon:    number
    klikWebsite:    number
    ulasanBaru:     number
    rataRata:       number | null
    rendah:         number
    /** Ulasan yang LAHIR di periode ini dan sudah punya balasan. */
    dibalas:        number

    /**
     * Balasan yang DIKIRIM pada periode ini, dihitung dari `balasan_pada` —
     * bukan dari kapan ulasannya lahir.
     *
     * Dua ukuran ini menjawab pertanyaan berbeda, dan keduanya diperlukan untuk
     * menilai kinerja petugas:
     *   - `dibalas` / `ulasanBaru` → seberapa responsif terhadap ulasan yang masuk
     *   - `balasanDikirim`         → seluruh pekerjaan membalas pada periode itu,
     *     TERMASUK menggarap tumpukan lama
     *
     * Tanpa yang kedua, petugas yang membereskan ulasan bertahun lalu tidak
     * mendapat kredit sama sekali. Pada Agustus 2026 itu bukan kasus teoretis:
     * 11 dari 47 balasan ditujukan ke ulasan lama.
     */
    balasanDikirim:     number
    balasanUlasanLama:  number

    /** Konteks strategis, bukan ukuran kinerja — sengaja tidak dijadikan judul. */
    totalUlasan:        number
    totalDibalas:       number
  }
}

const bulanDari = (d: Date) => d.toISOString().slice(0, 7)

export async function rakitLaporanGoogle(
  slug: string, mulai: string, selesai: string,
): Promise<LaporanGoogle> {
  const db = await getTenantDb(slug)
  const dariTgl = new Date(`${mulai}T00:00:00.000Z`)
  const sampaiTgl = new Date(`${selesai}T00:00:00.000Z`)

  const [
    harian, ulasan, metrikTertua, ulasanTertua, totalUlasan, totalDibalas,
    balasanDikirim, balasanUlasanLama,
  ] = await Promise.all([
    db.gbpLocationDaily.findMany({
      where:   { tenant_slug: slug, tanggal: { gte: dariTgl, lte: sampaiTgl } },
      orderBy: { tanggal: 'asc' },
    }),
    db.gbpReview.findMany({
      where:   { tenant_slug: slug, dibuat_pada: { gte: dariTgl, lte: sampaiTgl } },
      select:  { bintang: true, dibuat_pada: true, balasan_teks: true, balasan_pada: true },
      orderBy: { dibuat_pada: 'asc' },
    }),
    db.gbpLocationDaily.findFirst({
      where: { tenant_slug: slug }, orderBy: { tanggal: 'asc' }, select: { tanggal: true },
    }),
    db.gbpReview.findFirst({
      where: { tenant_slug: slug }, orderBy: { dibuat_pada: 'asc' }, select: { dibuat_pada: true },
    }),
    db.gbpReview.count({ where: { tenant_slug: slug } }),
    db.gbpReview.count({ where: { tenant_slug: slug, balasan_teks: { not: null } } }),

    // Balasan yang DIKIRIM pada periode ini — rentangnya di `balasan_pada`,
    // bukan `dibuat_pada`, jadi kueri terpisah dan tidak bisa diturunkan dari
    // daftar ulasan di atas.
    db.gbpReview.count({
      where: { tenant_slug: slug, balasan_pada: { gte: dariTgl, lte: sampaiTgl } },
    }),
    db.gbpReview.count({
      where: {
        tenant_slug:  slug,
        balasan_pada: { gte: dariTgl, lte: sampaiTgl },
        dibuat_pada:  { lt: dariTgl },
      },
    }),
  ])

  // ── Rekap per bulan ────────────────────────────────────────────────────
  const petaBulan = new Map<string, BarisBulan>()
  // Kunci gabungan bulan+lokasi, supaya rincian per profil dihitung dalam satu
  // sapuan yang sama — bukan mengulang perulangan atas 3.758 baris.
  const petaBulanLokasi = new Map<string, BarisBulanLokasi>()

  for (const h of harian) {
    const b = bulanDari(h.tanggal)
    const search = h.tayangan_search_desktop + h.tayangan_search_mobile
    const maps   = h.tayangan_maps_desktop + h.tayangan_maps_mobile

    const baris = petaBulan.get(b) ?? {
      bulan: b, tayanganSearch: 0, tayanganMaps: 0, permintaanRute: 0,
      klikTelepon: 0, klikWebsite: 0, perLokasi: [],
    }
    baris.tayanganSearch += search
    baris.tayanganMaps   += maps
    baris.permintaanRute += h.permintaan_rute
    baris.klikTelepon    += h.klik_telepon
    baris.klikWebsite    += h.klik_website
    petaBulan.set(b, baris)

    const kunci = `${b}|${h.lokasi}`
    const rinci = petaBulanLokasi.get(kunci) ?? {
      lokasi: h.lokasi, judul: h.lokasi_judul,
      tayanganSearch: 0, tayanganMaps: 0, permintaanRute: 0, klikTelepon: 0, klikWebsite: 0,
    }
    rinci.judul = h.lokasi_judul
    rinci.tayanganSearch += search
    rinci.tayanganMaps   += maps
    rinci.permintaanRute += h.permintaan_rute
    rinci.klikTelepon    += h.klik_telepon
    rinci.klikWebsite    += h.klik_website
    petaBulanLokasi.set(kunci, rinci)
  }

  for (const [kunci, rinci] of petaBulanLokasi) {
    petaBulan.get(kunci.split('|')[0])?.perLokasi.push(rinci)
  }
  // Profil terbesar di atas, supaya urutannya sama tiap bulan dan mata tidak
  // perlu mencari ulang saat membandingkan dua bulan yang dibuka bersamaan.
  for (const b of petaBulan.values()) {
    b.perLokasi.sort((x, y) =>
      (y.tayanganSearch + y.tayanganMaps) - (x.tayanganSearch + x.tayanganMaps))
  }

  // ── Rekap per lokasi ───────────────────────────────────────────────────
  // Jumlah ulasan dan rating diambil dari baris TERBARU tiap lokasi, bukan
  // dijumlahkan: keduanya nilai keadaan saat diambil, bukan kejadian harian.
  // Menjumlahkannya akan menghasilkan angka yang berlipat sebanyak jumlah hari.
  const petaLokasi = new Map<string, BarisLokasi>()
  const terbaruLokasi = new Map<string, Date>()
  for (const h of harian) {
    const baris = petaLokasi.get(h.lokasi) ?? {
      lokasi: h.lokasi, judul: h.lokasi_judul,
      tayangan: 0, permintaanRute: 0, klikTelepon: 0, klikWebsite: 0,
      jumlahUlasan: 0, rataRata: null,
    }
    baris.judul = h.lokasi_judul
    baris.tayangan += h.tayangan_search_desktop + h.tayangan_search_mobile
                    + h.tayangan_maps_desktop  + h.tayangan_maps_mobile
    baris.permintaanRute += h.permintaan_rute
    baris.klikTelepon    += h.klik_telepon
    baris.klikWebsite    += h.klik_website

    const terbaru = terbaruLokasi.get(h.lokasi)
    if (!terbaru || h.tanggal > terbaru) {
      terbaruLokasi.set(h.lokasi, h.tanggal)
      baris.jumlahUlasan = h.jumlah_ulasan
      baris.rataRata     = h.rata_rata > 0 ? h.rata_rata : null
    }
    petaLokasi.set(h.lokasi, baris)
  }

  // ── Ulasan per bulan ───────────────────────────────────────────────────
  const petaUlasan = new Map<string, {
    jumlah: number; total: number; dibalas: number
    b1: number; b2: number; b3: number; b4: number; b5: number
  }>()
  for (const u of ulasan) {
    const b = bulanDari(u.dibuat_pada)
    const s = petaUlasan.get(b) ?? { jumlah: 0, total: 0, dibalas: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0 }
    s.jumlah++
    s.total += u.bintang
    if (u.bintang === 1) s.b1++
    else if (u.bintang === 2) s.b2++
    else if (u.bintang === 3) s.b3++
    else if (u.bintang === 4) s.b4++
    else if (u.bintang === 5) s.b5++
    if (u.balasan_teks) s.dibalas++
    petaUlasan.set(b, s)
  }

  // ── Kecepatan membalas ulasan yang MASUK pada periode ──────────────────
  // Sengaja dibatasi pada ulasan periode ini, sejalan dengan angka responsivitas
  // di atasnya. Balasan ke ulasan lama punya jeda bertahun dan akan menenggelamkan
  // seluruh ember; pekerjaan itu dihitung terpisah lewat `balasanUlasanLama`.
  const jeda: JedaBalasan = { kurangSehari: 0, satuTiga: 0, empatTujuh: 0, lebihTujuh: 0, belum: 0 }
  for (const u of ulasan) {
    if (!u.balasan_pada) { jeda.belum++; continue }
    const hari = (u.balasan_pada.getTime() - u.dibuat_pada.getTime()) / 86_400_000
    if (hari < 1) jeda.kurangSehari++
    else if (hari <= 3) jeda.satuTiga++
    else if (hari <= 7) jeda.empatTujuh++
    else jeda.lebihTujuh++
  }

  const ulasanBulan: BarisUlasanBulan[] = [...petaUlasan.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bulan, s]) => ({
      bulan, jumlah: s.jumlah,
      rataRata: s.jumlah > 0 ? Number((s.total / s.jumlah).toFixed(2)) : 0,
      bintang: { b1: s.b1, b2: s.b2, b3: s.b3, b4: s.b4, b5: s.b5 },
      dibalas: s.dibalas,
    }))

  const bulanan = [...petaBulan.values()].sort((a, b) => a.bulan.localeCompare(b.bulan))

  return {
    metrikSejak: metrikTertua?.tanggal.toISOString().slice(0, 10) ?? null,
    ulasanSejak: ulasanTertua?.dibuat_pada.toISOString().slice(0, 10) ?? null,
    bulanan,
    perLokasi: [...petaLokasi.values()].sort((a, b) => b.tayangan - a.tayangan),
    ulasanBulan,
    jeda,
    ringkas: {
      tayangan:       bulanan.reduce((n, b) => n + b.tayanganSearch + b.tayanganMaps, 0),
      permintaanRute: bulanan.reduce((n, b) => n + b.permintaanRute, 0),
      klikTelepon:    bulanan.reduce((n, b) => n + b.klikTelepon, 0),
      klikWebsite:    bulanan.reduce((n, b) => n + b.klikWebsite, 0),
      ulasanBaru:     ulasan.length,
      rataRata:       ulasan.length > 0
        ? Number((ulasan.reduce((n, u) => n + u.bintang, 0) / ulasan.length).toFixed(2))
        : null,
      rendah:       ulasan.filter(u => u.bintang > 0 && u.bintang <= 3).length,
      dibalas:      ulasan.filter(u => u.balasan_teks).length,
      balasanDikirim,
      balasanUlasanLama,
      totalUlasan,
      totalDibalas,
    },
  }
}
