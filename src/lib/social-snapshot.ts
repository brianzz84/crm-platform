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
import { ringkasFacebook, ringkasInstagram, type Rentang } from './meta-kanal'
import { ringkasGa4, ringkasYouTube } from './google-kanal'

/** Hari ke belakang yang ditarik ulang tiap malam. */
const HARI_TARIK_ULANG = 7

/** Umur (hari) tempat performa konten dibekukan untuk perbandingan yang adil. */
const UMUR_SNAPSHOT = [1, 7, 30]

/** Baris berjalan yang ditimpa tiap malam — bukan umur tetap. */
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

      for (const h of ig.harian) {
        await simpanHarian('IG', h.tanggal, {
          jangkauan:      h.jangkauan,
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
      for (const h of fb.harian) {
        await simpanHarian('FB', h.tanggal, {
          interaksi:        h.interaksi,
          follower_baru:    naikPerTgl.get(h.tanggal) ?? 0,
          follower_total:   fb.page?.follower ?? 0,
        })
      }

      const konten = fb.teratas.map(p => ({
        id: p.id, jenis: 'Postingan', tanggal: p.tanggal, teks: p.teks,
        permalink: p.permalink, gambar: '',
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
    const umurTulis = [UMUR_TERAKHIR, ...(UMUR_SNAPSHOT.includes(umur) ? [umur] : [])]

    for (const u of umurTulis) {
      await db.socialContentSnapshot.upsert({
        where:  { content_id_umur_hari: { content_id: induk.id, umur_hari: u } },
        create: { content_id: induk.id, umur_hari: u, ...metrik },
        // Snapshot berumur tetap tidak ditimpa setelah terisi — itulah gunanya
        // dibekukan. Hanya baris berjalan yang disegarkan.
        update: u === UMUR_TERAKHIR ? { ...metrik, diambil_pada: new Date() } : {},
      })
    }
    jumlah++
  }

  return jumlah
}
