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
  // Dihitung supaya "tidak ada datanya" bisa dibedakan dari "datanya nol".
  let titik = 0
  /** Pesan galat terakhir per metrik — dipakai memutuskan apakah ini benar-benar galat. */
  const gagal = new Map<string, string>()

  type BalasanSeri = {
    data?: { name?: unknown; values?: { end_time?: string; value?: unknown }[] }[]
  }
  const serap = (json: BalasanSeri) => {
    for (const d of json?.data ?? []) {
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

  const url = (m: string, j: Rentang) =>
    `${objId}/insights?metric=${m}&period=day&${kueriRentang(j)}${extra}`

  for (const jendela of pecahJendela(periode)) {
    // Digabung dulu: satu permintaan untuk semua metrik, dan itulah jalur normal.
    const gabung = await graphGet(url(metrics.join(','), jendela), token)
    if (gabung.ok) { serap(gabung.json); continue }

    // SATU metrik yang melampaui batas riwayatnya sendiri menjatuhkan SELURUH
    // permintaan gabungan. Terbukti 1 Sep 2026: `follower_count` hanya melayani
    // 30 hari terakhir, sedangkan `reach` masih melayani setidaknya 73 hari —
    // tetapi diminta bersama, Graph menolak keduanya dengan galat #100 yang
    // hanya menyebut follower_count. Akibatnya jangkauan periode lampau tampak
    // "tidak disediakan Instagram" padahal Instagram menyediakannya.
    //
    // Karena itu diulang satu per satu: yang masih dilayani tetap terambil.
    if (metrics.length === 1) { gagal.set(metrics[0], pesanErrorGraph(gabung)); continue }
    for (const m of metrics) {
      const r = await graphGet(url(m, jendela), token)
      if (!r.ok) { gagal.set(m, pesanErrorGraph(r)); continue }
      serap(r.json)
    }
  }

  // Hanya dianggap GALAT bila tidak ada satu metrik pun yang berhasil. Kalau
  // sebagian berhasil, itu batas riwayat — bukan kerusakan, dan menaikkannya
  // jadi galat akan mengosongkan seluruh tab karena UI menyembunyikan segalanya
  // begitu `galat` terisi.
  const semuaGagal = metrics.length > 0 && metrics.every(m => gagal.has(m))
  return { seri, titik, galat: semuaGagal ? [...gagal.values()][0] : undefined }
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
// `profile_links_taps` ditambahkan 2 Sep 2026 setelah terbukti hidup lewat probe
// (24 pada Agustus, riwayat sampai Jun 2025). Ini metrik NIAT: menekan tautan di
// profil jauh lebih dekat ke maksud menghubungi rumah sakit daripada menyukai
// unggahan.
const IG_TOTAL  = ['views', 'accounts_engaged', 'total_interactions', 'likes', 'saves', 'profile_links_taps']
const IG_KONTEN = 'reach,saved,likes,comments,shares,total_interactions,views'

export interface TotalIg {
  jangkauan: number; tayangan: number; interaksi: number
  akunTerlibat: number; suka: number; disimpan: number; followerBaru: number
  /** Ketukan pada tautan/kontak di profil — metrik NIAT, bukan sekadar tanggapan. */
  tautanProfil: number
  /**
   * Follow BRUTO dan unfollow, dari `follows_and_unfollows`.
   *
   * `follow` sengaja dipisah dari `followerBaru` meski keduanya mengukur hal
   * yang sama: yang satu dari `follower_count` (deret harian, riwayat hanya 30
   * hari), yang lain dari metrik ini (riwayat ~11 bulan). Diadu pada tiga
   * jendela berbeda 2 Sep 2026, keduanya COCOK PERSIS — 81/81, 105/105, 53/53.
   * Selisih yang sempat dilaporkan ternyata salah penyelarasan tanggal, bukan
   * ketidakcocokan Meta.
   */
  follow:   number
  unfollow: number
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

  // ── Metrik khusus jenis media. `null` = tidak berlaku untuk jenis ini,
  //    DIBEDAKAN dari 0 yang berarti berlaku tetapi nilainya nol. ──
  /** Reels saja. MILIDETIK mentah — konversi ke detik hanya di lapis tampilan. */
  rerataTontonMs: number | null
  /** Reels saja. MILIDETIK mentah. */
  totalTontonMs:  number | null
  /** Reels saja. Persen, bukan pecahan: 50,8 berarti 50,8%. */
  lajuLewat:      number | null
  /** Foto & Carousel saja — Reels tidak mendukungnya. */
  kunjunganProfil: number | null
  aktivitasProfil: number | null
  followDariSini:  number | null
}
export interface RingkasInstagram {
  akun: { id: string; username: string; follower: number; media: number; nama: string } | null
  periode: TotalIg
  banding: TotalIg | null
  /**
   * Deret harian periode pembanding pulang KOSONG SELURUHNYA, bukan nol.
   * Dipertahankan untuk grafik tren yang memang butuh seluruh deret.
   */
  bandingSeriKosong: boolean
  /**
   * Metrik deret harian yang TIDAK ADA datanya pada periode pembanding, disebut
   * satu per satu. Wajib per metrik: batas riwayat tiap metrik berbeda jauh —
   * `follower_count` hanya 30 hari, `reach` setidaknya 73 — sehingga satu
   * bendera untuk keduanya akan menyembunyikan jangkauan yang sebenarnya ada.
   */
  bandingMetrikKosong: string[]
  harian: { tanggal: string; jangkauan: number }[]
  /** Deret pembanding, dicocokkan berdasarkan URUTAN hari — bukan tanggal. */
  bandingHarian: { tanggal: string; jangkauan: number }[]
  followerHarian: { tanggal: string; naik: number }[]
  /** SELURUH konten periode — dipakai hover grafik untuk menjawab "kenapa naik". */
  semuaKonten: KontenIg[]
  /**
   * Rincian jangkauan SATU PERIODE — bukan per hari; Meta tidak menyediakannya
   * per hari. Angka tiap dimensi adalah hitungan unik yang saling tumpang tindih,
   * jadi jumlahnya melebihi total periode.
   */
  rincianPeriode: { perJenis: Record<string, number>; perFollow: Record<string, number> }
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
  /** Sebaran follower — kota teratas, usia, gender. Lihat catatan di tarikDemografiIg. */
  demografi: DemografiIg
  /** Peringatan kejujuran angka saat rentang melewati satu jendela. */
  catatanUnik: string | null
  galat?: string
}

const IG_KOSONG: TotalIg = {
  jangkauan: 0, tayangan: 0, interaksi: 0, akunTerlibat: 0, suka: 0, disimpan: 0,
  followerBaru: 0, tautanProfil: 0, follow: 0, unfollow: 0,
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

  const fu = await tarikFollowUnfollowIg(igId, token, periode)
  hasil.follow   = fu.follow
  hasil.unfollow = fu.unfollow

  const serapTotal = (json: { data?: { name?: unknown; total_value?: { value?: unknown } }[] }) => {
    for (const d of json?.data ?? []) {
      const n = Number(d?.total_value?.value ?? 0)
      switch (d.name) {
        case 'views':              hasil.tayangan     += n; break
        case 'accounts_engaged':   hasil.akunTerlibat += n; break
        case 'total_interactions': hasil.interaksi    += n; break
        case 'likes':              hasil.suka         += n; break
        case 'saves':              hasil.disimpan     += n; break
        case 'profile_links_taps': hasil.tautanProfil += n; break
      }
    }
  }

  const urlTotal = (m: string, j: Rentang) =>
    `${igId}/insights?metric=${m}&metric_type=total_value&period=day&${kueriRentang(j)}`

  for (const jendela of pecahJendela(periode)) {
    const gabung = await graphGet(urlTotal(IG_TOTAL.join(','), jendela), token)
    if (gabung.ok) { serapTotal(gabung.json); continue }

    // Penjagaan yang sama seperti pada tarikSeri: sebelumnya kegagalan gabungan
    // hanya di-`continue`, sehingga SATU metrik yang bermasalah membuat seluruh
    // metrik total periode itu senyap menjadi nol. Diulang satu per satu supaya
    // yang masih dilayani tetap terambil.
    for (const m of IG_TOTAL) {
      const r = await graphGet(urlTotal(m, jendela), token)
      if (r.ok) serapTotal(r.json)
    }
  }
  return { total: hasil, seri, seriKosong: titik === 0, galat }
}


/**
 * Rincian jangkauan menurut satu dimensi (`media_product_type` / `follow_type`).
 *
 * HANYA TERSEDIA SEBAGAI AGREGAT PERIODE, bukan per hari. Dibuktikan langsung
 * dari bentuk balasannya: dengan `period=day&breakdown=...` Graph mengembalikan
 * `values:[{value,end_time}]` polos tanpa jejak rincian — parameternya diterima
 * lalu diabaikan tanpa keluhan. Rinciannya baru muncul pada
 * `metric_type=total_value`, di dalam `total_value.breakdowns[].results[]`.
 *
 * Pelajarannya: pada Graph, permintaan yang TIDAK DITOLAK belum tentu DIPENUHI.
 * Untuk breakdown, status 200 bukan bukti apa-apa.
 *
 * CATATAN ANGKA: jangkauan adalah hitungan UNIK, jadi penjumlahan seluruh
 * dimensi MELEBIHI totalnya — satu orang yang melihat Reels dan Carousel
 * terhitung di keduanya. Karena itu nilainya tidak boleh disajikan sebagai
 * persentase dari total; ia akan melampaui 100% dan menyesatkan.
 */
async function tarikRincian(
  igId: string, token: string, periode: Rentang, dimensi: string,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}

  for (const jendela of pecahJendela(periode)) {
    const r = await graphGet(
      `${igId}/insights?metric=reach&period=day&metric_type=total_value&breakdown=${dimensi}&${kueriRentang(jendela)}`,
      token,
    )
    if (!r.ok) continue

    for (const d of r.json?.data ?? []) {
      for (const b of d?.total_value?.breakdowns ?? []) {
        for (const hasil of b.results ?? []) {
          const nama = (hasil.dimension_values ?? [])[0]
          if (!nama) continue
          out[String(nama)] = (out[String(nama)] ?? 0) + Number(hasil.value ?? 0)
        }
      }
    }
  }
  return out
}


/**
 * Metric total_value Instagram PER HARI.
 *
 * `views`, `total_interactions`, `likes`, dan `saves` hanya dikembalikan sebagai
 * satu angka untuk seluruh rentang yang diminta. Untuk mendapat nilai harian,
 * satu-satunya jalan adalah meminta satu hari per panggilan — dan itulah yang
 * dilakukan di sini.
 *
 * Sebelumnya jalur murah yang dipakai: satu panggilan untuk seluruh jendela,
 * sehingga kolom tayangan dan interaksi di tabel harian selalu kosong. Membagi
 * rata angka periode ke tiap tanggal sempat terpikir dan sengaja DITOLAK — itu
 * menciptakan angka harian yang tidak pernah terjadi, dan grafiknya akan tampak
 * meyakinkan justru karena mulus.
 *
 * `accounts_engaged` sengaja tidak diambil: ia hitungan unik, dan nilai harian
 * yang dijumlahkan menjadi periode akan menghitung orang yang sama berkali-kali.
 */
export async function tarikTotalHarianIg(
  igId: string, token: string, periode: Rentang,
): Promise<Map<string, { tayangan: number; interaksi: number; suka: number; disimpan: number; follow: number; unfollow: number; tautanProfil: number }>> {
  const out = new Map<string, { tayangan: number; interaksi: number; suka: number; disimpan: number; follow: number; unfollow: number; tautanProfil: number }>()

  let hari = Date.parse(periode.mulai)
  const akhir = Date.parse(periode.selesai)
  while (hari <= akhir) {
    const tgl = iso(hari)
    const r = await graphGet(
      `${igId}/insights?metric=views,total_interactions,likes,saves,profile_links_taps` +
      `&metric_type=total_value&period=day&${kueriRentang({ mulai: tgl, selesai: tgl })}`,
      token,
    )
    if (r.ok) {
      const nilai = { tayangan: 0, interaksi: 0, suka: 0, disimpan: 0, follow: 0, unfollow: 0, tautanProfil: 0 }
      for (const d of r.json?.data ?? []) {
        const n = Number(d?.total_value?.value ?? 0)
        if (d.name === 'views')              nilai.tayangan  = n
        if (d.name === 'total_interactions') nilai.interaksi = n
        if (d.name === 'likes')              nilai.suka      = n
        if (d.name === 'saves')              nilai.disimpan  = n
        if (d.name === 'profile_links_taps') nilai.tautanProfil = n
      }
      // Panggilan KEDUA untuk hari yang sama: follows_and_unfollows menuntut
      // breakdown yang tidak boleh dikenakan pada metrik di atas. Terbukti
      // melayani per hari (20 Agu: 9 follow / 2 unfollow).
      const fu = await tarikFollowUnfollowIg(igId, token, { mulai: tgl, selesai: tgl })
      nilai.follow   = fu.follow
      nilai.unfollow = fu.unfollow

      out.set(tgl, nilai)
    }
    hari += HARI
  }
  return out
}


/**
 * Story Instagram yang SEDANG TAYANG, beserta metriknya.
 *
 * Story hidup 24 jam dan `/stories` hanya mengembalikan yang aktif — tidak ada
 * endpoint arsip. Sekali terlewat, angkanya hilang untuk selamanya dan tidak bisa
 * ditarik ulang dengan cara apa pun. Itu sebabnya penangkapannya dijalankan tiap
 * jam, bukan sekali sehari: bukan demi kesegaran, melainkan supaya bacaan terakhir
 * sebelum kedaluwarsa sedekat mungkin dengan total 24 jam yang sebenarnya.
 *
 * `navigation` sengaja TIDAK diminta di sini meski probe membuktikannya hidup: ia
 * menuntut `breakdown` yang akan ikut terpasang pada seluruh metric lain dalam satu
 * permintaan gabungan. Satu field yang salah menggugurkan semuanya — pelajaran dari
 * postingan Facebook.
 */
const IG_STORY_METRIK = 'views,reach,replies,shares,total_interactions,follows,profile_visits'

export interface StoryIg {
  id: string; tanggal: string; permalink: string; gambar: string; jenis: string
  tayangan: number; jangkauan: number; balasan: number; dibagikan: number
  interaksi: number; followerBaru: number; kunjunganProfil: number
}

export async function ambilStoryIg(igId: string, token: string): Promise<StoryIg[]> {
  const dasar = 'id,media_type,timestamp,permalink,thumbnail_url,media_url'

  // Bertingkat seperti pengambil konten: kalau insights ditolak, daftar story-nya
  // tetap terekam. Story yang tercatat tanpa angka masih jauh lebih berguna
  // daripada story yang hilang sama sekali.
  let r = await graphGet(`${igId}/stories?fields=${dasar},insights.metric(${IG_STORY_METRIK})`, token, 20_000)
  if (!r.ok) r = await graphGet(`${igId}/stories?fields=${dasar}`, token, 20_000)
  if (!r.ok) return []

  const nilai = (m: any, nama: string) =>
    Number((m?.insights?.data ?? []).find((i: any) => i.name === nama)?.values?.[0]?.value ?? 0)

  return (r.json?.data ?? []).map((m: any) => ({
    id: String(m.id),
    jenis: 'Story',
    tanggal: String(m.timestamp ?? '').slice(0, 10),
    permalink: String(m.permalink ?? ''),
    gambar: String(m.thumbnail_url || m.media_url || ''),
    tayangan:        nilai(m, 'views'),
    jangkauan:       nilai(m, 'reach'),
    balasan:         nilai(m, 'replies'),
    dibagikan:       nilai(m, 'shares'),
    interaksi:       nilai(m, 'total_interactions'),
    followerBaru:    nilai(m, 'follows'),
    kunjunganProfil: nilai(m, 'profile_visits'),
  }))
}

export async function ringkasInstagram(
  cfg: KonfigMeta, periode: Rentang, banding?: Rentang | null,
): Promise<RingkasInstagram> {
  const kosong: RingkasInstagram = {
    akun: null, periode: IG_KOSONG, banding: null, bandingSeriKosong: false,
    bandingMetrikKosong: [],
    harian: [], bandingHarian: [], followerHarian: [], semuaKonten: [],
    rincianPeriode: { perJenis: {}, perFollow: {} }, teratas: [], engagementTeratas: [],
    jenisKonten: [], hariFollower: [], catatanUnik: null,
    demografi: { kota: [], usia: [], gender: [] },
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
  const demografi = await tarikDemografiIg(igId, token)
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
    // Dihitung dari deret itu sendiri, bukan dari status permintaan: satu sumber
    // kebenaran yang sekaligus mencakup "ditolak Graph" dan "dijawab tapi kosong".
    bandingMetrikKosong: bandingHasil
      ? IG_SERI.filter(m => !Object.values(bandingHasil.seri).some(h => m in h))
      : [],
    harian:         tanggal.map(t => ({ tanggal: t, jangkauan: seri[t].reach ?? 0 })),
    bandingHarian:  bandingHasil
      ? Object.keys(bandingHasil.seri).sort().map(t => ({ tanggal: t, jangkauan: bandingHasil.seri[t].reach ?? 0 }))
      : [],
    followerHarian: tanggal.map(t => ({ tanggal: t, naik: seri[t].follower_count ?? 0 })),
    semuaKonten:       rMedia.semua,
    rincianPeriode: { perJenis: rJenis, perFollow: rFollow },
    demografi,
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

/**
 * Follow bruto & unfollow lewat `follows_and_unfollows`.
 *
 * Panggilan SENDIRI, tidak digabung dengan IG_TOTAL: metrik ini menuntut
 * `breakdown=follow_type` sekaligus `metric_type=total_value`, dan breakdown itu
 * akan ikut dikenakan pada metrik lain bila digabung.
 *
 * Nilai pecahannya BUKAN "pengikut vs bukan pengikut" seperti pada `reach`.
 * Uraian Meta sendiri berbunyi "jumlah akun yang mengikuti Anda dan jumlah akun
 * yang batal mengikuti", dan pembacaan FOLLOWER=follow / NON_FOLLOWER=unfollow
 * sudah dibuktikan dengan mengadu FOLLOWER terhadap penjumlahan `follower_count`
 * pada tiga jendela: cocok persis ketiganya.
 */
async function tarikFollowUnfollowIg(
  igId: string, token: string, periode: Rentang,
): Promise<{ follow: number; unfollow: number }> {
  let follow = 0, unfollow = 0
  for (const jendela of pecahJendela(periode)) {
    const r = await graphGet(
      `${igId}/insights?metric=follows_and_unfollows&metric_type=total_value` +
      `&breakdown=follow_type&period=day&${kueriRentang(jendela)}`,
      token,
    )
    if (!r.ok) continue
    const hasil = r.json?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? []
    for (const x of hasil as { dimension_values?: string[]; value?: unknown }[]) {
      const n = Number(x.value ?? 0)
      if (x.dimension_values?.[0] === 'FOLLOWER')     follow   += n
      if (x.dimension_values?.[0] === 'NON_FOLLOWER') unfollow += n
    }
  }
  return { follow, unfollow }
}

/**
 * Demografi FOLLOWER — bukan demografi pasien.
 *
 * Penamaan ini dijaga ketat di seluruh sistem. Yang diukur adalah sebaran
 * geografis dan usia orang yang MENGIKUTI akun Instagram; itu tidak membuktikan
 * asal pasien, wilayah rujukan, maupun catchment area rumah sakit. Menyebutnya
 * "wilayah rujukan" adalah klaim yang melampaui apa yang benar-benar diukur.
 *
 * Dua kerabatnya — `reached_audience_demographics` dan
 * `engaged_audience_demographics` — SUDAH DIUJI dan tidak tersedia untuk akun
 * ini: seluruh timeframe lama ditolak ("no longer supported"), sedangkan
 * `this_week` dan `this_month` menjawab tanpa satu pecahan pun. Jangan dipasang
 * tanpa probe ulang.
 *
 * Meta hanya mengembalikan sejumlah entri teratas per dimensi, jadi hasilnya
 * disebut "kota teratas" — bukan seluruh kota follower.
 */
export interface DemografiIg {
  kota:   { label: string; jumlah: number }[]
  usia:   { label: string; jumlah: number }[]
  gender: { label: string; jumlah: number }[]
}

async function tarikDemografiIg(igId: string, token: string): Promise<DemografiIg> {
  const ambil = async (breakdown: string) => {
    const r = await graphGet(
      `${igId}/insights?metric=follower_demographics&period=lifetime` +
      `&metric_type=total_value&breakdown=${breakdown}&timeframe=this_month`,
      token,
    )
    if (!r.ok) return []
    const hasil = r.json?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? []
    return (hasil as { dimension_values?: string[]; value?: unknown }[])
      .map(x => ({ label: String(x.dimension_values?.[0] ?? '-'), jumlah: Number(x.value ?? 0) }))
      .filter(x => x.jumlah > 0)
      .sort((a, b) => b.jumlah - a.jumlah)
  }

  // Tiga dimensi saja. `country` sengaja dilewati: untuk rumah sakit yang
  // melayani satu kota, 45 negara hanya derau yang menutupi yang berguna.
  const [kota, usia, gender] = await Promise.all([ambil('city'), ambil('age'), ambil('gender')])
  return { kota: kota.slice(0, 15), usia, gender }
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
/**
 * Metrik yang KETERSEDIAANNYA BERGANTUNG JENIS MEDIA.
 *
 * Diuji langsung 2 Sep 2026, dan hasilnya berlawanan dengan dugaan wajar: kedua
 * kelompok ini SALING EKSKLUSIF, bukan sekadar "sebagian tersedia".
 *
 *   Reels/Video   : watch time & skip rate ADA — profile_visits/follows DITOLAK
 *   Foto/Carousel : profile_visits/follows ADA — watch time & skip rate DITOLAK
 *
 * Galatnya berbunyi persis: "The Media Insights API does not support the
 * <metric> metric for this media product type."
 *
 * Karena satu metrik yang tidak didukung menggugurkan SELURUH permintaan, kedua
 * kelompok tidak boleh pernah diminta bersama. Itu sebabnya fungsi ini memilih
 * bundel berdasarkan jenis, bukan meminta gabungan lalu berharap.
 */
const BUNDEL_REELS  = ['ig_reels_avg_watch_time', 'ig_reels_video_view_total_time', 'reels_skip_rate']
const BUNDEL_STATIS = ['profile_visits', 'profile_activity', 'follows']

/** Jenis yang memakai bundel Reels — sisanya dianggap statis. */
const JENIS_REELS = new Set(['Reels', 'Video'])

async function perkayaMediaIg(items: KontenIg[], token: string): Promise<void> {
  // Hanya konten yang benar-benar ditampilkan yang diperkaya. Satu panggilan per
  // konten, jadi memperkaya seluruh periode akan menambah puluhan panggilan pada
  // tiap pembukaan halaman — biaya yang tidak sebanding dengan manfaatnya untuk
  // konten yang tidak dilihat siapa pun.
  await Promise.all(items.map(async it => {
    const reels  = JENIS_REELS.has(it.jenis)
    const bundel = reels ? BUNDEL_REELS : BUNDEL_STATIS
    const r = await graphGet(`${it.id}/insights?metric=${bundel.join(',')}`, token)
    if (!r.ok) return

    const nilai = (nama: string) => {
      const d = (r.json?.data ?? []).find((x: { name?: string }) => x.name === nama)
      const v = d?.values?.[0]?.value
      return v === undefined || v === null ? null : Number(v)
    }
    if (reels) {
      it.rerataTontonMs = nilai('ig_reels_avg_watch_time')
      it.totalTontonMs  = nilai('ig_reels_video_view_total_time')
      it.lajuLewat      = nilai('reels_skip_rate')
    } else {
      it.kunjunganProfil = nilai('profile_visits')
      it.aktivitasProfil = nilai('profile_activity')
      it.followDariSini  = nilai('follows')
    }
  }))
}

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
      rerataTontonMs: null, totalTontonMs: null, lajuLewat: null,
      kunjunganProfil: null, aktivitasProfil: null, followDariSini: null,
    }
  })

  const per = new Map<string, { jenis: string; jumlah: number; jangkauan: number; interaksi: number }>()
  for (const it of items) {
    const p = per.get(it.jenis) ?? { jenis: it.jenis, jumlah: 0, jangkauan: 0, interaksi: 0 }
    p.jumlah += 1; p.jangkauan += it.jangkauan; p.interaksi += it.interaksi
    per.set(it.jenis, p)
  }

  const teratas = [...items].sort((a, b) => b.jangkauan - a.jangkauan || b.interaksi - a.interaksi).slice(0, 15)
  const engagementTeratas = items
    .filter(i => i.jangkauan >= AMBANG_JANGKAUAN_RASIO)
    .sort((a, b) => b.rasioInteraksi - a.rasioInteraksi)
    .slice(0, 10)

  // Objek yang sama dipakai di kedua daftar, jadi memperkaya sekali per objek
  // sudah cukup — dedup lewat Set mencegah panggilan ganda untuk konten yang
  // muncul di keduanya.
  await perkayaMediaIg([...new Set([...teratas, ...engagementTeratas])], token)

  return {
    semua: items,
    teratas,
    engagementTeratas,
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
 * Metric Page yang TERBUKTI hidup lewat probe akun RKZ.
 *
 * KOREKSI 2 Sep 2026 — komentar di sini sebelumnya menyatakan Facebook "hanya
 * bisa dilaporkan lewat metric AKSI, bukan berapa orang melihat". Itu KELIRU.
 * Benar bahwa keluarga lama dihapus (`page_impressions`,
 * `page_impressions_unique`, `post_impressions*`, `post_engaged_users`), tetapi
 * Meta menggantinya dengan keluarga Media View — dan keluarga itu hidup:
 *
 *   page_media_view               30 titik harian
 *   page_total_media_view_unique  30 titik harian
 *   post_media_view               per postingan
 *   post_total_media_view_unique  per postingan
 *
 * JANGAN MENAMAINYA "JANGKAUAN". Metodologi Meta berubah, jadi angka baru tidak
 * boleh disambungkan dengan riwayat Reach/Impressions lama seolah satu deret.
 * Sebutannya di seluruh sistem: **Tayangan Media** dan **Penonton Unik**.
 *
 * Kandidat pecahan paid/organic dan follower/non-follower SUDAH diuji dan tidak
 * ada: sepuluh nama dicoba (`page_media_view_paid`, `_organic`, `_by_follower_status`,
 * dan varian post-nya) — seluruhnya dijawab "The value must be a valid insights
 * metric". Jangan dipasang tanpa probe ulang.
 */
const FB_SERI = [
  'page_post_engagements', 'page_daily_follows_unique', 'page_views_total',
  'page_follows', 'page_video_views', 'page_total_actions',
  'page_media_view', 'page_total_media_view_unique',
  // Unfollow dipasangkan dengan `page_daily_follows_unique` yang sudah ada —
  // keduanya hitungan UNIK, jadi selisihnya bermakna. Angkanya kecil di RKZ
  // (4 unfollow berbanding 13 follow dalam 48 hari), tetapi itu memang keadaan
  // Halaman-nya, bukan tanda metriknya tidak jalan.
  'page_daily_unfollows_unique',
]

export interface TotalFb {
  interaksi: number; followerBaru: number; kunjunganProfil: number
  tayanganVideo: number; totalAksi: number
  /** Keluarga Media View — pengganti Reach/Impressions yang dihapus Meta.
   *  Metodologinya BERBEDA; jangan disambung dengan riwayat jangkauan lama. */
  tayanganMedia: number
  penontonUnik:  number
  /** Hitungan UNIK, sepadan dengan followerBaru — selisihnya bermakna. */
  unfollow: number
}
export interface RingkasFacebook {
  page: { id: string; nama: string; follower: number } | null
  periode: TotalFb
  banding: TotalFb | null
  /** Sama seperti Instagram: kosong bukan nol, jadi selisihnya tak boleh dihitung. */
  bandingSeriKosong: boolean
  harian: { tanggal: string; interaksi: number }[]
  /** Tayangan video & kunjungan profil per hari — dipakai tabel laporan. */
  tayanganVideoHarian: Record<string, number>
  kunjunganHarian: Record<string, number>
  /** Keluarga Media View per hari — dipakai grafik dan snapshot harian. */
  tayanganMediaHarian: Record<string, number>
  penontonUnikHarian:  Record<string, number>
  /** Unfollow per hari — dipakai snapshot harian. */
  unfollowHarian:      Record<string, number>
  bandingHarian: { tanggal: string; interaksi: number }[]
  followerHarian: { tanggal: string; naik: number }[]
  semuaKonten: {
    id: string; jenis: string; tanggal: string; permalink: string; teks: string; gambar: string
    jangkauan: number; interaksi: number
  }[]
  teratas: {
    id: string; tanggal: string; permalink: string; teks: string; gambar: string
    reaksi: number; komentar: number; dibagikan: number; klik: number
    /** Keluarga Media View per postingan — BUKAN jangkauan lama. */
    tayanganMedia: number; penontonUnik: number
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
  tayanganMedia: 0, penontonUnik: 0, unfollow: 0,
}

const totalDariSeri = (seri: SeriHarian): TotalFb => ({
  interaksi:       jumlah(seri, 'page_post_engagements'),
  followerBaru:    jumlah(seri, 'page_daily_follows_unique'),
  kunjunganProfil: jumlah(seri, 'page_views_total'),
  tayanganVideo:   jumlah(seri, 'page_video_views'),
  totalAksi:       jumlah(seri, 'page_total_actions'),
  tayanganMedia:   jumlah(seri, 'page_media_view'),
  // Penonton unik dijumlahkan lintas hari, jadi orang yang sama pada dua hari
  // berbeda terhitung dua kali — sama persis dengan sifat jangkauan Instagram,
  // dan sama-sama diperingatkan lewat `catatanUnik`.
  penontonUnik:    jumlah(seri, 'page_total_media_view_unique'),
  unfollow:        jumlah(seri, 'page_daily_unfollows_unique'),
})

export async function ringkasFacebook(
  cfg: KonfigMeta, periode: Rentang, banding?: Rentang | null,
): Promise<RingkasFacebook> {
  const kosong: RingkasFacebook = {
    page: null, periode: FB_KOSONG, banding: null, bandingSeriKosong: false,
    harian: [], tayanganVideoHarian: {}, kunjunganHarian: {},
    tayanganMediaHarian: {}, penontonUnikHarian: {}, unfollowHarian: {},
    bandingHarian: [], followerHarian: [], semuaKonten: [], teratas: [], komentarTersedia: false,
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
    tayanganVideoHarian: Object.fromEntries(tanggal.map(t => [t, utama.seri[t].page_video_views ?? 0])),
    kunjunganHarian:     Object.fromEntries(tanggal.map(t => [t, utama.seri[t].page_views_total ?? 0])),
    tayanganMediaHarian: Object.fromEntries(tanggal.map(t => [t, utama.seri[t].page_media_view ?? 0])),
    penontonUnikHarian:  Object.fromEntries(tanggal.map(t => [t, utama.seri[t].page_total_media_view_unique ?? 0])),
    unfollowHarian:      Object.fromEntries(tanggal.map(t => [t, utama.seri[t].page_daily_unfollows_unique ?? 0])),
    bandingHarian:  seriBanding
      ? Object.keys(seriBanding.seri).sort().map(t => ({ tanggal: t, interaksi: seriBanding.seri[t].page_post_engagements ?? 0 }))
      : [],
    followerHarian: tanggal.map(t => ({ tanggal: t, naik: utama.seri[t].page_daily_follows_unique ?? 0 })),
    semuaKonten: post.semua.map((p: any) => ({
      id: p.id, jenis: 'Postingan', tanggal: p.tanggal, permalink: p.permalink,
      // `jangkauan` diisi PENONTON UNIK: itulah padanan terdekatnya pada
      // paradigma baru, dan grafik hover memakai field ini. Namanya di layar
      // tetap "Penonton Unik", tidak pernah "Jangkauan".
      teks: p.teks, gambar: p.gambar, jangkauan: p.penontonUnik ?? 0,
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
  // KOREKSI 2 Sep 2026: `post_media_view` dan `post_total_media_view_unique`
  // terbukti hidup lewat probe akun RKZ (119 dan 76 pada postingan terakhir).
  // Inilah pengganti `post_impressions` yang dihapus Meta — bukan padanannya,
  // karena metodologinya berbeda dan tidak boleh disambung sebagai satu deret.
  const wawasan = 'insights.metric(post_clicks,post_reactions_by_type_total,post_media_view,post_total_media_view_unique)'
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
      tayanganMedia: Number(wawasanNilai(p, 'post_media_view') ?? 0),
      penontonUnik:  Number(wawasanNilai(p, 'post_total_media_view_unique') ?? 0),
    }
  })

  const urut = [...items].sort((a: any, b: any) =>
    (b.reaksi + b.komentar + b.dibagikan + b.klik) - (a.reaksi + a.komentar + a.dibagikan + a.klik))

  return { items: urut.slice(0, 15), semua: items, galat, adaKomentar }
}
