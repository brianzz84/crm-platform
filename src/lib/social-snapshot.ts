/**
 * Kolektor snapshot Kanal Publik — dijalankan sekali sehari oleh worker.
 *
 * Bukan pengganti pembacaan langsung di dashboard. Ini merekam untuk LAPORAN
 * TRIWULANAN, karena dua hal yang sudah terbukti: deret harian Instagram menghilang
 * dari API dalam hitungan pekan, dan insight konten IG/FB selalu berupa total
 * sepanjang masa sehingga performa "7 hari pertama" hanya bisa diketahui bila
 * diukur tepat pada hari ketujuh.
 *
 * Prinsip yang dipegang di sini:
 *  - IDEMPOTEN. Dijalankan dua kali pada hari yang sama harus menghasilkan keadaan
 *    yang sama. Semua tulisan memakai upsert dengan kunci tanpa kolom nullable.
 *  - TARIK ULANG, bukan sekali tulis. Meta merevisi angka beberapa hari setelahnya
 *    (penyaringan spam, atribusi terlambat), jadi menulis "kemarin" sekali lalu
 *    tidak menengoknya lagi akan mengabadikan angka sementara.
 *  - JUJUR SOAL UMUR. Snapshot berumur tetap hanya ditulis kalau kontennya memang
 *    berusia segitu hari ini.
 *  - GAGAL SEBAGIAN TETAP TERSIMPAN. Satu kanal bermasalah tidak boleh membatalkan
 *    kanal lain; kegagalannya dilaporkan, bukan ditelan.
 */
import { getTenantDb } from './tenant'
import {
  ambilMediaIg, ambilPostFb, ambilStoryIg, ringkasFacebook, ringkasInstagram, tarikTotalHarianIg, type Rentang,
} from './meta-kanal'
import { ringkasGa4, ringkasYouTube } from './google-kanal'

/** Hari ke belakang yang ditarik ulang tiap malam. */
const HARI_TARIK_ULANG = 7

/**
 * Baris berjalan yang ditimpa tiap malam — bukan umur tetap.
 *
 * Selain baris ini, tiap konten juga ditulis pada UMUR SEBENARNYA setiap malam.
 * Umur 1, 7, dan 30 karena itu terbentuk sendiri dan tidak perlu diistimewakan:
 * pada hari ketujuh yang tertulis adalah baris umur 7, dan esoknya umur 8 —
 * jadi baris umur 7 tidak pernah tersentuh lagi, beku dengan sendirinya.
 *
 * Menyimpan SELURUH umur, bukan hanya tiga, membuka kemampuan yang tidak bisa
 * didapat dari Meta: selisih angka sebuah konten antara kemarin dan hari ini
 * adalah sumbangan konten itu terhadap jangkauan hari ini. Dijumlahkan, ia
 * menjelaskan lonjakan harian tanpa perlu API yang merinci sumbernya.
 * Biayanya sepele — 60 konten x 90 hari masih di bawah 6.000 baris.
 */
const UMUR_TERAKHIR = -1

const HARI_MS = 86_400_000
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)

export interface HasilSnapshot {
  kanal: string
  status: 'ok' | 'gagal' | 'lewati'
  pesan: string
}

/** Selisih hari kalender antara terbit dan hari ini (UTC). */
function umurHari(terbit: Date, sekarang: Date): number {
  const a = Date.parse(iso(terbit.getTime()))
  const b = Date.parse(iso(sekarang.getTime()))
  return Math.round((b - a) / HARI_MS)
}


/**
 * Tangkap story Instagram yang sedang tayang. Dijalankan TIAP JAM.
 *
 * Story hidup 24 jam dan tidak punya arsip. Sekali terlewat, hilang selamanya —
 * satu-satunya bagian dari seluruh sistem ini yang benar-benar tidak bisa
 * ditarik ulang.
 *
 * Kenapa tiap jam, bukan sekali sehari: satu jalan harian secara teori menangkap
 * semua story, karena tiap story pasti melewati satu jadwal dalam masa hidup 24
 * jamnya. Tapi UMUR SAAT DITANGKAP jadi acak antara 1 dan 24 jam. Story yang
 * terbit menjelang jadwal akan selalu tampak paling buruk — bukan karena
 * kontennya, melainkan karena diukur terlalu dini. Itu kesimpulan keliru yang
 * berbahaya untuk keputusan konten.
 *
 * Karena angka story hanya menaik, menyimpan NILAI TERTINGGI yang pernah terlihat
 * membuat bacaan terakhir sebelum kedaluwarsa mendekati total sebenarnya.
 */
export async function tangkapStory(slug: string): Promise<{ jumlah: number; galat?: string }> {
  const db   = await getTenantDb(slug)
  const meta = await db.metaConfig.findUnique({ where: { tenant_slug: slug } })
  const token = meta?.insights_token || meta?.access_token
  if (!meta?.ig_business_id || !token) return { jumlah: 0, galat: 'Instagram belum dikonfigurasi.' }

  try {
    const story = await ambilStoryIg(meta.ig_business_id, token)
    for (const st of story) {
      const induk = await db.socialContent.upsert({
        where:  { tenant_slug_kanal_konten_id: { tenant_slug: slug, kanal: 'IG', konten_id: st.id } },
        create: {
          tenant_slug: slug, kanal: 'IG', konten_id: st.id, jenis: 'Story',
          terbit_pada: new Date(st.tanggal), permalink: st.permalink || null,
          sampul_url: st.gambar || null,
        },
        // Sampul disegarkan karena URL CDN Instagram berumur pendek; `sifat` tidak
        // pernah disentuh kolektor — itu milik manusia.
        update: { sampul_url: st.gambar || null, permalink: st.permalink || null },
      })

      const lama = await db.socialContentSnapshot.findUnique({
        where: { content_id_umur_hari: { content_id: induk.id, umur_hari: UMUR_TERAKHIR } },
      })

      // Nilai TERTINGGI, bukan yang terbaru. Angka story hanya menaik, jadi bacaan
      // yang lebih kecil pasti berarti pengukuran lebih dini — bukan penurunan.
      const naik = (a: number, b: number | undefined) => Math.max(a, b ?? 0)
      const metrik = {
        tayangan:         naik(st.tayangan,        lama?.tayangan),
        jangkauan:        naik(st.jangkauan,       lama?.jangkauan),
        komentar:         naik(st.balasan,         lama?.komentar),
        dibagikan:        naik(st.dibagikan,       lama?.dibagikan),
        interaksi:        naik(st.interaksi,       lama?.interaksi),
        follower_baru:    naik(st.followerBaru,    lama?.follower_baru),
        kunjungan_profil: naik(st.kunjunganProfil, lama?.kunjungan_profil),
      }

      await db.socialContentSnapshot.upsert({
        where:  { content_id_umur_hari: { content_id: induk.id, umur_hari: UMUR_TERAKHIR } },
        create: { content_id: induk.id, umur_hari: UMUR_TERAKHIR, ...metrik },
        update: { ...metrik, diambil_pada: new Date() },
      })
    }
    return { jumlah: story.length }
  } catch (e: any) {
    return { jumlah: 0, galat: String(e?.message ?? e) }
  }
}

export async function jalankanSnapshot(slug: string): Promise<HasilSnapshot[]> {
  const db    = await getTenantDb(slug)
  const hasil: HasilSnapshot[] = []

  const sekarang = new Date()
  const periode: Rentang = {
    mulai:   iso(sekarang.getTime() - HARI_TARIK_ULANG * HARI_MS),
    selesai: iso(sekarang.getTime() - HARI_MS),   // s/d kemarin; hari ini belum lengkap
  }

  const [meta, google] = await Promise.all([
    db.metaConfig.findUnique({ where: { tenant_slug: slug } }),
    db.googleConfig.findUnique({ where: { tenant_slug: slug } }),
  ])

  const simpanHarian = async (kanal: 'IG' | 'FB' | 'YOUTUBE' | 'GA4', tanggal: string, data: Record<string, number>) => {
    await db.socialAccountDaily.upsert({
      where:  { tenant_slug_kanal_tanggal: { tenant_slug: slug, kanal, tanggal: new Date(tanggal) } },
      create: { tenant_slug: slug, kanal, tanggal: new Date(tanggal), ...data },
      update: { ...data, diambil_pada: new Date() },
    })
  }

  // ── Instagram ──────────────────────────────────────────────
  if (meta?.ig_business_id && (meta.insights_token || meta.access_token)) {
    try {
      const ig = await ringkasInstagram(meta, periode, null)
      if (ig.galat) throw new Error(ig.galat)

      const followerTotal = ig.akun?.follower ?? 0
      const naikPerTgl = new Map(ig.followerHarian.map(f => [f.tanggal, f.naik]))

      // Tayangan & interaksi hanya ada sebagai agregat, jadi ditarik satu hari per
      // panggilan. Tujuh panggilan tambahan per malam — murah, dan menjadikan
      // kolom yang selama ini kosong terisi angka yang benar-benar terjadi.
      const totalHarian = await tarikTotalHarianIg(
        meta.ig_business_id!, meta.insights_token || meta.access_token || '', periode,
      )

      for (const h of ig.harian) {
        const t = totalHarian.get(h.tanggal)
        await simpanHarian('IG', h.tanggal, {
          jangkauan:      h.jangkauan,
          tayangan:       t?.tayangan  ?? 0,
          interaksi:      t?.interaksi ?? 0,
          suka:           t?.suka      ?? 0,
          disimpan:       t?.disimpan  ?? 0,
          follower_baru:  naikPerTgl.get(h.tanggal) ?? 0,
          follower_total: followerTotal,
        })
      }

      // Total periode (tayangan/interaksi/suka/disimpan) hanya tersedia agregat,
      // bukan per hari, jadi TIDAK dibagi rata ke tiap tanggal — membagi rata akan
      // menciptakan angka harian yang tidak pernah ada.
      const jumlahKonten = await simpanKonten(db, slug, 'IG', ig.teratas, sekarang)

      hasil.push({ kanal: 'Instagram', status: 'ok',
        pesan: `${ig.harian.length} hari, ${jumlahKonten} konten.` })
    } catch (e: any) {
      hasil.push({ kanal: 'Instagram', status: 'gagal', pesan: String(e?.message ?? e) })
    }
  } else {
    hasil.push({ kanal: 'Instagram', status: 'lewati', pesan: 'Belum dikonfigurasi.' })
  }

  // ── Facebook ───────────────────────────────────────────────
  if (meta?.page_id && (meta.insights_token || meta.access_token)) {
    try {
      const fb = await ringkasFacebook(meta, periode, null)
      if (fb.galat) throw new Error(fb.galat)

      const naikPerTgl = new Map(fb.followerHarian.map(f => [f.tanggal, f.naik]))
      // `jangkauan` SENGAJA dibiarkan nol untuk Facebook: Meta menghapus seluruh
      // metric jangkauan tingkat Page maupun postingan. Bukan data yang belum
      // diambil — memang tidak ada lagi yang bisa diambil.
      for (const h of fb.harian) {
        await simpanHarian('FB', h.tanggal, {
          interaksi:        h.interaksi,
          tayangan:         fb.tayanganVideoHarian?.[h.tanggal] ?? 0,
          kunjungan_profil: fb.kunjunganHarian?.[h.tanggal] ?? 0,
          follower_baru:    naikPerTgl.get(h.tanggal) ?? 0,
          follower_total:   fb.page?.follower ?? 0,
        })
      }

      const konten = fb.teratas.map(p => ({
        id: p.id, jenis: 'Postingan', tanggal: p.tanggal, teks: p.teks,
        permalink: p.permalink, gambar: p.gambar || '',
        jangkauan: 0, suka: p.reaksi, komentar: p.komentar, dibagikan: p.dibagikan,
        disimpan: 0, interaksi: p.reaksi + p.komentar + p.dibagikan, tayangan: p.klik,
      }))
      const jumlahKonten = await simpanKonten(db, slug, 'FB', konten, sekarang)

      hasil.push({ kanal: 'Facebook', status: 'ok',
        pesan: `${fb.harian.length} hari, ${jumlahKonten} postingan.` })
    } catch (e: any) {
      hasil.push({ kanal: 'Facebook', status: 'gagal', pesan: String(e?.message ?? e) })
    }
  } else {
    hasil.push({ kanal: 'Facebook', status: 'lewati', pesan: 'Belum dikonfigurasi.' })
  }

  // ── YouTube & GA4 ──────────────────────────────────────────
  // Hanya tingkat akun. Konten YouTube sengaja TIDAK disimpan: Analytics API bisa
  // ditanya per rentang tanggal untuk satu video, jadi umur berapa pun bisa
  // dihitung ulang kapan saja tanpa perlu salinan lokal.
  if (google?.aktif && google.refresh_token) {
    const kredensial = {
      client_id:          google.client_id,
      client_secret:      google.client_secret,
      refresh_token:      google.refresh_token,
      ga4_property_id:    google.ga4_property_id,
      youtube_channel_id: google.youtube_channel_id,
    }

    try {
      const yt = await ringkasYouTube(slug, kredensial, periode, null)
      if (yt.galat) throw new Error(yt.galat)
      const subPerTgl = new Map(yt.subscriberHarian.map(s => [s.tanggal, s.naik]))
      for (const h of yt.harian) {
        await simpanHarian('YOUTUBE', h.tanggal, {
          tayangan:       h.tayangan,
          follower_baru:  subPerTgl.get(h.tanggal) ?? 0,
          follower_total: yt.channel?.subscriber ?? 0,
        })
      }
      hasil.push({ kanal: 'YouTube', status: 'ok', pesan: `${yt.harian.length} hari.` })
    } catch (e: any) {
      hasil.push({ kanal: 'YouTube', status: 'gagal', pesan: String(e?.message ?? e) })
    }

    if (google.ga4_property_id) {
      try {
        const ga4 = await ringkasGa4(slug, kredensial, periode, null)
        if (ga4.galat) throw new Error(ga4.galat)
        for (const h of ga4.harian) {
          // GA4 memakai format YYYYMMDD pada dimensi `date`.
          const tgl = h.tanggal.length === 8
            ? `${h.tanggal.slice(0, 4)}-${h.tanggal.slice(4, 6)}-${h.tanggal.slice(6, 8)}`
            : h.tanggal
          await simpanHarian('GA4', tgl, { jangkauan: h.pengguna, tayangan: h.sesi })
        }
        hasil.push({ kanal: 'Website (GA4)', status: 'ok', pesan: `${ga4.harian.length} hari.` })
      } catch (e: any) {
        hasil.push({ kanal: 'Website (GA4)', status: 'gagal', pesan: String(e?.message ?? e) })
      }
    }
  } else {
    hasil.push({ kanal: 'Google', status: 'lewati', pesan: 'Belum tersambung.' })
  }

  return hasil
}

interface KontenMasuk {
  id: string; jenis: string; tanggal: string; teks: string; permalink: string; gambar: string
  jangkauan: number; suka: number; komentar: number; dibagikan: number
  disimpan: number; interaksi: number; tayangan: number
}

/**
 * Simpan induk konten + snapshot metriknya.
 *
 * Snapshot berumur tetap (H+1/H+7/H+30) HANYA ditulis kalau konten benar-benar
 * berusia segitu hari ini. Konten yang terbit sebelum snapshot dinyalakan tidak
 * akan pernah punya baris H+1 — dan itu memang jawaban yang benar. Mengisinya
 * dengan angka hari ini akan membuat perbandingan antar konten menipu, karena
 * konten lama sudah punya berbulan-bulan untuk mengumpulkan angka.
 */
async function simpanKonten(
  db: any, slug: string, kanal: 'IG' | 'FB', daftar: KontenMasuk[], sekarang: Date,
): Promise<number> {
  let jumlah = 0

  for (const k of daftar) {
    if (!k.id || !k.tanggal) continue

    const induk = await db.socialContent.upsert({
      where:  { tenant_slug_kanal_konten_id: { tenant_slug: slug, kanal, konten_id: k.id } },
      create: {
        tenant_slug: slug, kanal, konten_id: k.id, jenis: k.jenis,
        terbit_pada: new Date(k.tanggal), teks: k.teks || null,
        permalink: k.permalink || null, sampul_url: k.gambar || null,
      },
      // Sifat sengaja TIDAK disentuh — itu milik manusia, bukan kolektor.
      update: {
        jenis: k.jenis, teks: k.teks || null,
        permalink: k.permalink || null, sampul_url: k.gambar || null,
      },
    })

    const metrik = {
      jangkauan: k.jangkauan, tayangan: k.tayangan, suka: k.suka,
      komentar: k.komentar, dibagikan: k.dibagikan, disimpan: k.disimpan,
      interaksi: k.interaksi,
    }

    const umur  = umurHari(new Date(k.tanggal), sekarang)
    // Baris berjalan + baris umur hari ini. Umur masa lalu tidak pernah ikut
    // tersentuh karena umur hari ini selalu berbeda dari umur kemarin.
    const umurTulis = umur >= 0 ? [UMUR_TERAKHIR, umur] : [UMUR_TERAKHIR]

    for (const u of umurTulis) {
      await db.socialContentSnapshot.upsert({
        where:  { content_id_umur_hari: { content_id: induk.id, umur_hari: u } },
        create: { content_id: induk.id, umur_hari: u, ...metrik },
        update: { ...metrik, diambil_pada: new Date() },
      })
    }
    jumlah++
  }

  return jumlah
}

/**
 * Backfill DAFTAR KONTEN ke belakang.
 *
 * Berbeda tegas dari metrik harian, yang sudah hilang dari API dan tidak bisa
 * dipulihkan. Konten justru bisa: postingan Instagram dan Facebook bersifat
 * permanen, dan insight per konten selalu berupa TOTAL SEPANJANG MASA — bukan
 * nilai per rentang. Artinya menarik konten tiga bulan lalu tetap memberi angka
 * yang benar dan terkini.
 *
 * Karena itu backfill ini layak dijalankan sekali di awal: ia mengisi seluruh
 * bahan konten satu triwulan sekaligus, sehingga penandaan sifat dan tabel
 * silang laporan langsung punya isi.
 *
 * Yang TETAP tidak bisa dipulihkan: snapshot berumur tetap (H+1, H+7, H+30)
 * untuk konten lama. Umur itu hanya bisa diukur pada harinya, dan hari itu sudah
 * lewat — jadi konten hasil backfill hanya punya baris berjalan.
 */
export async function backfillKonten(slug: string, hari = 90): Promise<HasilSnapshot[]> {
  const db    = await getTenantDb(slug)
  const hasil: HasilSnapshot[] = []

  const sekarang = new Date()
  const periode: Rentang = {
    mulai:   iso(sekarang.getTime() - hari * HARI_MS),
    selesai: iso(sekarang.getTime()),
  }

  const meta  = await db.metaConfig.findUnique({ where: { tenant_slug: slug } })
  const token = meta?.insights_token || meta?.access_token || ''

  if (!token) {
    return [{ kanal: 'Meta', status: 'lewati', pesan: 'Token belum dikonfigurasi.' }]
  }

  // 10 halaman × 50 = maksimal 500 konten per kanal. Cukup jauh melampaui satu
  // triwulan, dan tetap berbatas supaya akun besar tidak menarik tanpa henti.
  const MAKS_HALAMAN = 10

  if (meta?.ig_business_id) {
    try {
      const r = await ambilMediaIg(meta.ig_business_id, token, periode, MAKS_HALAMAN)
      const n = await simpanKonten(db, slug, 'IG', r.semua, sekarang)
      hasil.push({ kanal: 'Instagram', status: 'ok', pesan: `${n} konten sejak ${periode.mulai}.` })
    } catch (e: any) {
      hasil.push({ kanal: 'Instagram', status: 'gagal', pesan: String(e?.message ?? e) })
    }
  }

  if (meta?.page_id) {
    try {
      const r = await ambilPostFb(meta.page_id, token, periode, MAKS_HALAMAN)
      const konten = r.items.map((p: any) => ({
        id: p.id, jenis: 'Postingan', tanggal: p.tanggal, teks: p.teks,
        permalink: p.permalink, gambar: p.gambar || '',
        jangkauan: 0, suka: p.reaksi, komentar: p.komentar, dibagikan: p.dibagikan,
        disimpan: 0, interaksi: p.reaksi + p.komentar + p.dibagikan, tayangan: p.klik,
      }))
      const n = await simpanKonten(db, slug, 'FB', konten, sekarang)
      hasil.push({ kanal: 'Facebook', status: 'ok', pesan: `${n} postingan sejak ${periode.mulai}.` })
    } catch (e: any) {
      hasil.push({ kanal: 'Facebook', status: 'gagal', pesan: String(e?.message ?? e) })
    }
  }

  return hasil
}
