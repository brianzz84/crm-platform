/**
 * Penarik data Kanal Publik — Instagram & Facebook Page.
 *
 * Mengikuti pola google-kanal.ts: MEMBACA LANGSUNG dari Meta tiap halaman dibuka,
 * tanpa tabel penyimpan sendiri, dan tiap potongan laporan ditarik lewat panggilan
 * terpisah yang kegagalannya ditangani sendiri-sendiri — satu bagian yang ditolak
 * Graph hanya membuat bagian itu kosong, bukan menggugurkan seluruh halaman.
 *
 * Daftar metric di sini BUKAN tebakan: seluruhnya hasil probe penemuan metric
 * 3 Agu 2026 terhadap akun RKZ (lihat meta-social-diagnostik.ts). Yang terbukti
 * mati sengaja tidak dipakai, dan konsekuensinya dicatat di komentar masing-masing.
 */
import { graphGet, pesanErrorGraph } from './meta-social-client'

export interface KonfigMeta {
  page_id?:        string | null
  ig_business_id?: string | null
  insights_token?: string | null
  access_token?:   string | null
}

export interface Rentang { mulai: string; selesai: string }

const HARI = 86_400_000
const iso  = (t: number) => new Date(t).toISOString().slice(0, 10)
const unix = (tgl: string) => Math.floor(Date.parse(tgl + 'T00:00:00Z') / 1000)

/**
 * Insights Meta menolak rentang panjang dalam satu permintaan, jadi rentang
 * dipecah menjadi jendela ≤30 hari lalu hasilnya disambung. Batas 30 dipilih
 * karena aman untuk Instagram maupun Facebook Page.
 */
const MAKS_JENDELA = 30

function pecahJendela(r: Rentang): Rentang[] {
  const out: Rentang[] = []
  let mulai = Date.parse(r.mulai)
  const akhir = Date.parse(r.selesai)
  while (mulai <= akhir) {
    const selesai = Math.min(mulai + (MAKS_JENDELA - 1) * HARI, akhir)
    out.push({ mulai: iso(mulai), selesai: iso(selesai) })
    mulai = selesai + HARI
  }
  return out
}

/**
 * Graph menandai nilai harian dengan `end_time`, yaitu saat jendela hari itu
 * DITUTUP — praktisnya menunjuk hari berikutnya. Tanpa koreksi ini seluruh seri
 * harian bergeser satu hari, kesalahan yang tidak kelihatan pada grafik tapi
 * membuat angka tidak cocok saat diadu dengan dashboard resmi Meta.
 */
const tanggalDariEndTime = (endTime: string) => iso(Date.parse(endTime) - HARI)

/** `until` dimajukan sehari supaya nilai hari terakhir ikut terbawa. */
function kueriRentang(r: Rentang) {
  return `since=${unix(r.mulai)}&until=${unix(r.selesai) + 86_400}`
}

type SeriHarian = Record<string, Record<string, number>>

/**
 * Tarik metric bergaya deret waktu (period=day) lalu susun jadi peta
 * tanggal → { metric: nilai }. Nilai di luar rentang yang diminta dibuang,
 * karena Graph kerap mengembalikan sehari lebih banyak di kedua ujungnya.
 */
async function tarikSeri(
  objId: string, metrics: string[], token: string, periode: Rentang, extra = '',
): Promise<{ seri: SeriHarian; galat?: string; titik: number }> {
  const seri: SeriHarian = {}
  let galat: string | undefined
  // Dihitung supaya "tidak ada datanya" bisa dibedakan dari "datanya nol".
  let titik = 0

  for (const jendela of pecahJendela(periode)) {
    const r = await graphGet(
      `${objId}/insights?metric=${metrics.join(',')}&period=day&${kueriRentang(jendela)}${extra}`,
      token,
    )
    if (!r.ok) { galat ??= pesanErrorGraph(r); continue }

    for (const d of r.json?.data ?? []) {
      const nama = String(d.name ?? '')
      for (const v of d.values ?? []) {
        if (!v?.end_time) continue
        const tgl = tanggalDariEndTime(v.end_time)
        if (tgl < periode.mulai || tgl > periode.selesai) continue
        ;(seri[tgl] ??= {})[nama] = Number(v.value ?? 0)
        titik += 1
      }
    }
  }
  return { seri, galat, titik }
}

/** Jumlahkan satu metric sepanjang seri. */
const jumlah = (seri: SeriHarian, metric: string) =>
  Object.values(seri).reduce((s, hari) => s + (hari[metric] ?? 0), 0)

// ──────────────────────────────────────────────
// Instagram
// ──────────────────────────────────────────────

/**
 * Metric akun yang TERBUKTI hidup. `impressions`, `profile_views`, dan
 * `website_clicks` sudah dihapus Meta — jangan ditambahkan kembali tanpa
 * membuktikannya lewat probe lebih dulu.
 */
const IG_SERI   = ['reach', 'follower_count']
const IG_TOTAL  = ['views', 'accounts_engaged', 'total_interactions', 'likes', 'saves']
const IG_KONTEN = 'reach,saved,likes,comments,shares,total_interactions,views'

export interface TotalIg {
  jangkauan: number; tayangan: number; interaksi: number
  akunTerlibat: number; suka: number; disimpan: number; followerBaru: number
}
export interface KontenIg {
  id: string; jenis: string; tanggal: string; permalink: string; teks: string
  /** URL sampul dari CDN Instagram. Berumur pendek — jangan disimpan ke DB. */
  gambar: string
  /** Tayangan (`views`) dibedakan dari jangkauan: satu orang bisa menonton berkali-kali. */
  tayangan: number
  jangkauan: number; suka: number; komentar: number; dibagikan: number
  disimpan: number; interaksi: number
  /** Interaksi per 100 jangkauan — membandingkan konten besar dan kecil secara adil. */
  rasioInteraksi: number
}
export interface RingkasInstagram {
  akun: { id: string; username: string; follower: number; media: number; nama: string } | null
  periode: TotalIg
  banding: TotalIg | null
  /**
   * Deret harian periode pembanding pulang KOSONG, bukan nol. Jangkauan dan
   * follower baru pada `banding` karena itu tidak boleh dipakai menghitung
   * selisih — nilainya 0 hanya karena datanya tidak ada.
   */
  bandingSeriKosong: boolean
  harian: { tanggal: string; jangkauan: number }[]
  /** Deret pembanding, dicocokkan berdasarkan URUTAN hari — bukan tanggal. */
  bandingHarian: { tanggal: string; jangkauan: number }[]
  followerHarian: { tanggal: string; naik: number }[]
  /** SELURUH konten periode — dipakai hover grafik untuk menjawab "kenapa naik". */
  semuaKonten: KontenIg[]
  /** Rincian jangkauan harian: dari format apa, dan dari follower atau bukan. */
  rincianHarian: { tanggal: string; perJenis: Record<string, number>; perFollow: Record<string, number> }[]
  teratas: KontenIg[]
  /** Urutan berdasarkan MUTU tanggapan, bukan besarnya jangkauan. */
  engagementTeratas: KontenIg[]
  jenisKonten: { jenis: string; jumlah: number; jangkauan: number; rasioInteraksi: number }[]
  /**
   * Hari dengan follower baru terbanyak beserta konten yang terbit hari itu.
   * Ini KETERKAITAN waktu, bukan atribusi — Instagram tidak memberi tahu konten
   * mana yang membuat seseorang menekan Ikuti.
   */
  hariFollower: { tanggal: string; naik: number; konten: string[] }[]
  /** Peringatan kejujuran angka saat rentang melewati satu jendela. */
  catatanUnik: string | null
  galat?: string
}

const IG_KOSONG: TotalIg = {
  jangkauan: 0, tayangan: 0, interaksi: 0, akunTerlibat: 0, suka: 0, disimpan: 0, followerBaru: 0,
}

/**
 * Ambang jangkauan untuk peringkat engagement. Tanpa ini daftar dikuasai konten
 * bernasib sial — 20 jangkauan dengan 4 interaksi menjadi 20%, mengalahkan konten
 * yang benar-benar berhasil. Rasio hanya bermakna bila penyebutnya cukup besar.
 */
const AMBANG_JANGKAUAN_RASIO = 300

/**
 * Ringkasan satu periode: deret harian + metric total_value, sekali jalan.
 *
 * `seriKosong` menandai Graph tidak mengembalikan SATU titik pun untuk deret
 * harian — berbeda dari deret yang nilainya nol. Pembedaan ini wajib: Instagram
 * menyimpan riwayat `reach` dan `follower_count` jauh lebih pendek daripada
 * metric total_value, jadi periode pembanding yang agak lampau bisa pulang
 * kosong sementara tayangan dan interaksinya tetap terisi. Tanpa penanda ini,
 * kosong terbaca sebagai nol dan melahirkan "▲ 56.431" — klaim tumbuh dari nol
 * yang sepenuhnya palsu.
 */
async function ringkasPeriodeIg(
  igId: string, token: string, periode: Rentang,
): Promise<{ total: TotalIg; seri: SeriHarian; seriKosong: boolean; galat?: string }> {
  const hasil = { ...IG_KOSONG }

  const { seri, galat, titik } = await tarikSeri(igId, IG_SERI, token, periode)
  hasil.jangkauan    = jumlah(seri, 'reach')
  hasil.followerBaru = jumlah(seri, 'follower_count')

  for (const jendela of pecahJendela(periode)) {
    const r = await graphGet(
      `${igId}/insights?metric=${IG_TOTAL.join(',')}&metric_type=total_value&period=day&${kueriRentang(jendela)}`,
      token,
    )
    if (!r.ok) continue
    for (const d of r.json?.data ?? []) {
      const n = Number(d?.total_value?.value ?? 0)
      switch (d.name) {
        case 'views':              hasil.tayangan     += n; break
        case 'accounts_engaged':   hasil.akunTerlibat += n; break
        case 'total_interactions': hasil.interaksi    += n; break
        case 'likes':              hasil.suka         += n; break
        case 'saves':              hasil.disimpan     += n; break
      }
    }
  }
  return { total: hasil, seri, seriKosong: titik === 0, galat }
}


/**
 * Rincian jangkauan harian menurut satu dimensi (`media_product_type` atau
 * `follow_type`). Terbukti lewat probe bahwa breakdown BEKERJA pada deret harian,
 * bukan hanya agregat — jadi tiap batang grafik bisa dipecah sumbernya.
 *
 * Menjawab kasus yang paling membingungkan: jangkauan melonjak padahal tidak ada
 * postingan baru. Jawabannya biasanya Story, atau konten lama yang menyebar ke
 * non-follower.
 *
 * Bentuk balasan Graph untuk breakdown tidak seragam antar versi, jadi dua bentuk
 * yang mungkin diurai keduanya. Kalau tidak satu pun cocok, hasilnya KOSONG —
 * bukan tebakan. Rincian yang salah lebih berbahaya daripada rincian yang absen,
 * karena ia tetap terlihat masuk akal.
 */
async function tarikRincian(
  igId: string, token: string, periode: Rentang, dimensi: string,
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  for (const jendela of pecahJendela(periode)) {
    const r = await graphGet(
      `${igId}/insights?metric=reach&period=day&breakdown=${dimensi}&${kueriRentang(jendela)}`,
      token,
    )
    if (!r.ok) continue

    for (const d of r.json?.data ?? []) {
      for (const v of d.values ?? []) {
        if (!v?.end_time) continue
        const tgl = tanggalDariEndTime(v.end_time)
        if (tgl < periode.mulai || tgl > periode.selesai) continue

        const bucket = out.get(tgl) ?? {}

        // Bentuk A: value berupa peta { POST: 123, STORY: 45 }
        if (v.value && typeof v.value === 'object') {
          for (const [k, n] of Object.entries(v.value)) bucket[k] = Number(n ?? 0)
        }
        // Bentuk B: daftar breakdowns dengan dimension_values
        for (const b of v.breakdowns ?? d.breakdowns ?? []) {
          for (const hasil of b.results ?? []) {
            const nama = (hasil.dimension_values ?? [])[0]
            if (nama) bucket[String(nama)] = Number(hasil.value ?? 0)
          }
        }

        if (Object.keys(bucket).length) out.set(tgl, bucket)
      }
    }
  }
  return out
}

export async function ringkasInstagram(
  cfg: KonfigMeta, periode: Rentang, banding?: Rentang | null,
): Promise<RingkasInstagram> {
  const kosong: RingkasInstagram = {
    akun: null, periode: IG_KOSONG, banding: null, bandingSeriKosong: false,
    harian: [], bandingHarian: [], followerHarian: [], semuaKonten: [], rincianHarian: [], teratas: [], engagementTeratas: [],
    jenisKonten: [], hariFollower: [], catatanUnik: null,
  }

  const token = cfg.insights_token || cfg.access_token || ''
  const igId  = cfg.ig_business_id?.trim() || ''
  if (!token) return { ...kosong, galat: 'Token Insights belum diisi di Pengaturan → Integrasi Meta.' }
  if (!igId)  return { ...kosong, galat: 'Instagram Business ID belum diisi di Pengaturan → Integrasi Meta.' }

  const rAkun = await graphGet(`${igId}?fields=username,name,followers_count,media_count`, token)
  if (!rAkun.ok) return { ...kosong, galat: pesanErrorGraph(rAkun) }

  // Satu panggilan per periode: sebelumnya deret harian ditarik dua kali untuk
  // periode utama — sekali di sini, sekali lagi di dalam penghitung total.
  const [utama, bandingHasil, rMedia, rJenis, rFollow] = await Promise.all([
    ringkasPeriodeIg(igId, token, periode),
    banding ? ringkasPeriodeIg(igId, token, banding) : Promise.resolve(null),
    ambilMediaIg(igId, token, periode),
    tarikRincian(igId, token, periode, 'media_product_type'),
    tarikRincian(igId, token, periode, 'follow_type'),
  ])
  const { seri, galat } = utama

  const tanggal = Object.keys(seri).sort()
  const banyakJendela = pecahJendela(periode).length > 1

  return {
    akun: {
      id: igId,
      username: rAkun.json?.username ?? '-',
      nama:     rAkun.json?.name ?? '',
      follower: Number(rAkun.json?.followers_count ?? 0),
      media:    Number(rAkun.json?.media_count ?? 0),
    },
    periode: utama.total,
    banding: bandingHasil?.total ?? null,
    bandingSeriKosong: !!bandingHasil?.seriKosong,
    harian:         tanggal.map(t => ({ tanggal: t, jangkauan: seri[t].reach ?? 0 })),
    bandingHarian:  bandingHasil
      ? Object.keys(bandingHasil.seri).sort().map(t => ({ tanggal: t, jangkauan: bandingHasil.seri[t].reach ?? 0 }))
      : [],
    followerHarian: tanggal.map(t => ({ tanggal: t, naik: seri[t].follower_count ?? 0 })),
    semuaKonten:       rMedia.semua,
    rincianHarian: tanggal.map(t => ({
      tanggal: t,
      perJenis:  rJenis.get(t)  ?? {},
      perFollow: rFollow.get(t) ?? {},
    })),
    teratas:           rMedia.teratas,
    engagementTeratas: rMedia.engagementTeratas,
    jenisKonten:       rMedia.jenisKonten,
    hariFollower: tanggal
      .map(t => ({
        tanggal: t,
        naik: seri[t].follower_count ?? 0,
        konten: rMedia.semua
          .filter(k => k.tanggal === t)
          .map(k => `${k.jenis}: ${k.teks || 'tanpa teks'}`),
      }))
      .filter(h => h.naik > 0)
      .sort((a, b) => b.naik - a.naik)
      .slice(0, 10),
    catatanUnik: banyakJendela
      ? 'Rentang ini melebihi 30 hari sehingga ditarik per potongan. Jangkauan dan akun terlibat adalah PENJUMLAHAN potongan — orang yang sama pada periode berbeda ikut terhitung lebih dari sekali. Untuk angka unik yang tepat, pakai rentang maksimal 30 hari.'
      : null,
    galat,
  }
}

const LABEL_JENIS_IG: Record<string, string> = {
  IMAGE: 'Foto', VIDEO: 'Video', CAROUSEL_ALBUM: 'Carousel', REELS: 'Reels',
}

/**
 * Daftar konten + metric per konten dalam SATU permintaan lewat field bersarang.
 *
 * Penurunan bertingkat, dari yang terkaya ke yang paling aman. Urutannya penting:
 * gambar diminta di lapis TERLUAR supaya kalau Graph menolaknya, yang hilang hanya
 * gambar — bukan angka insights yang jauh lebih berharga. Pelajaran dari postingan
 * Facebook: satu field bersarang yang ditolak menggugurkan seluruh permintaan.
 */
export async function ambilMediaIg(
  igId: string, token: string, periode: Rentang, maksHalaman = 1,
) {
  const dasar   = 'id,caption,media_type,timestamp,permalink'
  const wawasan = `insights.metric(${IG_KONTEN})`
  // Video menyimpan gambar sampulnya di thumbnail_url, foto di media_url; carousel
  // kadang hanya menyediakannya lewat anak-anaknya. Ketiganya diminta sekaligus.
  const gambar  = 'media_url,thumbnail_url,children{media_url,thumbnail_url}'
  const rentang = kueriRentang(periode)

  const minta = (fields: string, after = '') =>
    graphGet(`${igId}/media?fields=${fields}&limit=50&${rentang}${after ? `&after=${after}` : ''}`, token)

  // Tentukan sekali di halaman pertama seberapa kaya field yang diterima Graph,
  // lalu pakai bentuk itu untuk seluruh halaman. Menegosiasikan ulang tiap
  // halaman hanya menghabiskan panggilan tanpa menambah informasi.
  let fields = `${dasar},${wawasan},${gambar}`
  let r = await minta(fields)
  if (!r.ok) { fields = `${dasar},${wawasan}`; r = await minta(fields) }
  if (!r.ok) { fields = dasar;                 r = await minta(fields) }
  if (!r.ok) return { semua: [], teratas: [], engagementTeratas: [], jenisKonten: [] }

  const mentah: any[] = [...(r.json?.data ?? [])]
  let after: string | undefined = r.json?.paging?.cursors?.after
  let halaman = 1

  // Paginasi memakai cursor `after`, bukan URL `paging.next` — URL itu sudah
  // memuat token di dalamnya dan tidak layak dioper-oper.
  while (after && halaman < maksHalaman) {
    const rr = await minta(fields, after)
    if (!rr.ok) break
    const batch: any[] = rr.json?.data ?? []
    if (!batch.length) break
    mentah.push(...batch)
    after = rr.json?.paging?.cursors?.after
    halaman++
  }

  const nilai = (m: any, nama: string) =>
    Number((m?.insights?.data ?? []).find((i: any) => i.name === nama)?.values?.[0]?.value ?? 0)

  const items: KontenIg[] = mentah.map((m: any) => {
    const jangkauan = nilai(m, 'reach')
    const interaksi = nilai(m, 'total_interactions')
    const anak = m?.children?.data?.[0]
    return {
      id: String(m.id),
      jenis: LABEL_JENIS_IG[m.media_type] ?? String(m.media_type ?? '-'),
      tanggal: String(m.timestamp ?? '').slice(0, 10),
      permalink: String(m.permalink ?? ''),
      teks: String(m.caption ?? '').replace(/\s+/g, ' ').slice(0, 500),
      tayangan: nilai(m, 'views'),
      // Sampul video didahulukan atas berkas videonya sendiri, supaya yang dimuat
      // di daftar selalu gambar — bukan video berukuran besar.
      gambar: String(m.thumbnail_url || m.media_url || anak?.thumbnail_url || anak?.media_url || ''),
      jangkauan,
      suka:      nilai(m, 'likes'),
      komentar:  nilai(m, 'comments'),
      dibagikan: nilai(m, 'shares'),
      disimpan:  nilai(m, 'saved'),
      interaksi,
      rasioInteraksi: jangkauan > 0 ? (interaksi / jangkauan) * 100 : 0,
    }
  })

  const per = new Map<string, { jenis: string; jumlah: number; jangkauan: number; interaksi: number }>()
  for (const it of items) {
    const p = per.get(it.jenis) ?? { jenis: it.jenis, jumlah: 0, jangkauan: 0, interaksi: 0 }
    p.jumlah += 1; p.jangkauan += it.jangkauan; p.interaksi += it.interaksi
    per.set(it.jenis, p)
  }

  return {
    semua: items,
    teratas: [...items].sort((a, b) => b.jangkauan - a.jangkauan || b.interaksi - a.interaksi).slice(0, 15),
    engagementTeratas: items
      .filter(i => i.jangkauan >= AMBANG_JANGKAUAN_RASIO)
      .sort((a, b) => b.rasioInteraksi - a.rasioInteraksi)
      .slice(0, 10),
    jenisKonten: [...per.values()]
      .map(p => ({
        jenis: p.jenis, jumlah: p.jumlah, jangkauan: p.jangkauan,
        rasioInteraksi: p.jangkauan > 0 ? (p.interaksi / p.jangkauan) * 100 : 0,
      }))
      .sort((a, b) => b.jangkauan - a.jangkauan),
  }
}

// ──────────────────────────────────────────────
// Facebook Page
// ──────────────────────────────────────────────

/**
 * Metric Page yang TERBUKTI hidup. Perlu diketahui saat membaca dashboard ini:
 * seluruh metric jangkauan tingkat Page (`page_impressions`,
 * `page_impressions_unique`) sudah DIHAPUS Meta, dan tingkat postingan pun
 * (`post_impressions*`, `post_engaged_users`) ikut hilang. Karena itu Facebook
 * hanya bisa dilaporkan lewat metric AKSI — bukan berapa orang melihat.
 */
const FB_SERI = [
  'page_post_engagements', 'page_daily_follows_unique', 'page_views_total',
  'page_follows', 'page_video_views', 'page_total_actions',
]

export interface TotalFb {
  interaksi: number; followerBaru: number; kunjunganProfil: number
  tayanganVideo: number; totalAksi: number
}
export interface RingkasFacebook {
  page: { id: string; nama: string; follower: number } | null
  periode: TotalFb
  banding: TotalFb | null
  /** Sama seperti Instagram: kosong bukan nol, jadi selisihnya tak boleh dihitung. */
  bandingSeriKosong: boolean
  harian: { tanggal: string; interaksi: number }[]
  bandingHarian: { tanggal: string; interaksi: number }[]
  followerHarian: { tanggal: string; naik: number }[]
  semuaKonten: {
    id: string; jenis: string; tanggal: string; permalink: string; teks: string; gambar: string
    jangkauan: number; interaksi: number
  }[]
  teratas: {
    id: string; tanggal: string; permalink: string; teks: string; gambar: string
    reaksi: number; komentar: number; dibagikan: number; klik: number
  }[]
  /**
   * Jumlah komentar tidak bisa ditarik karena izin `pages_read_user_content`
   * belum ada. Reaksi & klik TETAP terisi lewat Insights per postingan, jadi ini
   * kekurangan sebagian — bukan kegagalan yang membuat semuanya nol.
   */
  komentarTersedia: boolean
  /** Alasan penghitung per postingan tidak terisi — dibedakan dari galat halaman. */
  galatPostingan?: string
  galat?: string
}

const FB_KOSONG: TotalFb = {
  interaksi: 0, followerBaru: 0, kunjunganProfil: 0, tayanganVideo: 0, totalAksi: 0,
}

const totalDariSeri = (seri: SeriHarian): TotalFb => ({
  interaksi:       jumlah(seri, 'page_post_engagements'),
  followerBaru:    jumlah(seri, 'page_daily_follows_unique'),
  kunjunganProfil: jumlah(seri, 'page_views_total'),
  tayanganVideo:   jumlah(seri, 'page_video_views'),
  totalAksi:       jumlah(seri, 'page_total_actions'),
})

export async function ringkasFacebook(
  cfg: KonfigMeta, periode: Rentang, banding?: Rentang | null,
): Promise<RingkasFacebook> {
  const kosong: RingkasFacebook = {
    page: null, periode: FB_KOSONG, banding: null, bandingSeriKosong: false,
    harian: [], bandingHarian: [], followerHarian: [], semuaKonten: [], teratas: [], komentarTersedia: false,
  }

  const token  = cfg.insights_token || cfg.access_token || ''
  const pageId = cfg.page_id?.trim() || ''
  if (!token)  return { ...kosong, galat: 'Token Insights belum diisi di Pengaturan → Integrasi Meta.' }
  if (!pageId) return { ...kosong, galat: 'Facebook Page ID belum diisi di Pengaturan → Integrasi Meta.' }

  const rPage = await graphGet(`${pageId}?fields=name,followers_count,fan_count`, token)
  if (!rPage.ok) return { ...kosong, galat: pesanErrorGraph(rPage) }

  const [utama, seriBanding, post] = await Promise.all([
    tarikSeri(pageId, FB_SERI, token, periode),
    banding ? tarikSeri(pageId, FB_SERI, token, banding) : Promise.resolve(null),
    ambilPostFb(pageId, token, periode),
  ])

  const tanggal = Object.keys(utama.seri).sort()

  return {
    page: {
      id: pageId,
      nama: rPage.json?.name ?? '-',
      follower: Number(rPage.json?.followers_count ?? rPage.json?.fan_count ?? 0),
    },
    periode: totalDariSeri(utama.seri),
    banding: seriBanding ? totalDariSeri(seriBanding.seri) : null,
    bandingSeriKosong: !!seriBanding && seriBanding.titik === 0,
    harian:         tanggal.map(t => ({ tanggal: t, interaksi: utama.seri[t].page_post_engagements ?? 0 })),
    bandingHarian:  seriBanding
      ? Object.keys(seriBanding.seri).sort().map(t => ({ tanggal: t, interaksi: seriBanding.seri[t].page_post_engagements ?? 0 }))
      : [],
    followerHarian: tanggal.map(t => ({ tanggal: t, naik: utama.seri[t].page_daily_follows_unique ?? 0 })),
    semuaKonten: post.semua.map((p: any) => ({
      id: p.id, jenis: 'Postingan', tanggal: p.tanggal, permalink: p.permalink,
      teks: p.teks, gambar: p.gambar, jangkauan: 0,
      interaksi: p.reaksi + p.komentar + p.dibagikan,
    })),
    teratas: post.items,
    komentarTersedia: post.adaKomentar,
    galatPostingan: post.galat,
    galat: utama.galat,
  }
}

/**
 * Jumlah reaksi/komentar/bagikan diambil lewat `summary(true)`, BUKAN lewat
 * Insights — metric engagement per postingan sudah dihapus Meta, sedangkan
 * penghitung ringkasan ini masih tersedia.
 *
 * Percobaan bertingkat, dan ALASAN kegagalannya dibawa keluar. Versi pertama
 * menggabungkan penghitung ringkasan dengan `insights.metric(post_clicks)`;
 * ketika Graph menolak gabungan itu, seluruh permintaan gugur dan kode jatuh ke
 * daftar tanpa angka — hasilnya semua postingan tampil dengan 0 reaksi tanpa
 * satu pun petunjuk kenapa. Kegagalan yang menyamar sebagai "datanya memang nol"
 * adalah yang paling mahal, jadi sekarang sebabnya ikut dilaporkan ke UI.
 */
export async function ambilPostFb(
  pageId: string, token: string, periode: Rentang, maksHalaman = 1,
) {
  const inti    = 'id,message,created_time,permalink_url,shares,full_picture'
  // Insights per postingan hanya butuh izin yang SUDAH dipunyai. Terbukti dari
  // probe: post_clicks & post_reactions_by_type_total hidup.
  const wawasan = 'insights.metric(post_clicks,post_reactions_by_type_total)'
  // Komentar & reaksi lewat summary menuntut `pages_read_user_content` yang belum
  // ditambahkan. Diminta di lapis terluar supaya ketiadaannya hanya menghilangkan
  // jumlah komentar, bukan menggugurkan seluruh angka seperti sebelumnya.
  const ringkas = 'comments.summary(true),reactions.summary(true)'
  const rentang = kueriRentang(periode)

  const minta = (fields: string, after = '') =>
    graphGet(`${pageId}/posts?fields=${fields}&limit=50&${rentang}${after ? `&after=${after}` : ''}`, token)

  let galat: string | undefined
  let adaKomentar = true

  // Bentuk field ditentukan sekali di halaman pertama, lalu dipakai untuk seluruh
  // halaman — sama seperti pada media Instagram.
  let fields = `${inti},${wawasan},${ringkas}`
  let r = await minta(fields)
  if (!r.ok) {
    galat = pesanErrorGraph(r)
    adaKomentar = false
    fields = `${inti},${wawasan}`
    r = await minta(fields)
  }
  if (!r.ok) { fields = inti; r = await minta(fields) }
  if (!r.ok) return { items: [], semua: [], galat: galat || pesanErrorGraph(r), adaKomentar: false }

  const mentah: any[] = [...(r.json?.data ?? [])]
  let after: string | undefined = r.json?.paging?.cursors?.after
  let halaman = 1
  while (after && halaman < maksHalaman) {
    const rr = await minta(fields, after)
    if (!rr.ok) break
    const batch: any[] = rr.json?.data ?? []
    if (!batch.length) break
    mentah.push(...batch)
    after = rr.json?.paging?.cursors?.after
    halaman++
  }

  const wawasanNilai = (p: any, nama: string) =>
    (p?.insights?.data ?? []).find((i: any) => i.name === nama)?.values?.[0]?.value

  const items = mentah.map((p: any) => {
    // post_reactions_by_type_total mengembalikan peta {like: n, love: n, …};
    // jumlah seluruh jenisnya = total reaksi.
    const perJenis = wawasanNilai(p, 'post_reactions_by_type_total')
    const reaksiWawasan = perJenis && typeof perJenis === 'object'
      ? Object.values(perJenis).reduce((s: number, n: any) => s + Number(n ?? 0), 0)
      : 0

    return {
      id: String(p.id),
      tanggal: String(p.created_time ?? '').slice(0, 10),
      permalink: String(p.permalink_url ?? ''),
      gambar: String(p.full_picture ?? ''),
      teks: String(p.message ?? '').replace(/\s+/g, ' ').slice(0, 500),
      reaksi:    Number(p?.reactions?.summary?.total_count ?? reaksiWawasan),
      komentar:  Number(p?.comments?.summary?.total_count ?? 0),
      dibagikan: Number(p?.shares?.count ?? 0),
      klik:      Number(wawasanNilai(p, 'post_clicks') ?? 0),
    }
  })

  const urut = [...items].sort((a: any, b: any) =>
    (b.reaksi + b.komentar + b.dibagikan + b.klik) - (a.reaksi + a.komentar + a.dibagikan + a.klik))

  return { items: urut.slice(0, 15), semua: items, galat, adaKomentar }
}
