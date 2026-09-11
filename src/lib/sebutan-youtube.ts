/**
 * Penarik sebutan YouTube — video orang lain yang MENYEBUT RKZ.
 *
 * Sumber kedua modul Sebutan Publik, setelah Instagram `/tags`. Memakai OAuth
 * Google yang SUDAH ada (`youtube.readonly`, satu consent untuk Business Profile
 * + YouTube + GA4), jadi tidak ada kredensial baru yang perlu diminta.
 *
 * ══ PERBEDAAN MENDASAR DARI PENARIK INSTAGRAM ══
 *
 * `/tags` Instagram MENDAFTAR SELURUH tandaan. Karena itu, pada penelusuran yang
 * tuntas, ketiadaan sebuah konten benar-benar berarti ia sudah hilang — dan
 * `hilang_pada` boleh diisi.
 *
 * Pencarian YouTube BUKAN pendaftaran. Ia peringkat, dan hasilnya berubah antar
 * panggilan tanpa ada yang terhapus. Video yang tidak muncul hari ini bisa saja
 * masih ada, hanya kalah peringkat. Karena itu penarik ini TIDAK PERNAH mengisi
 * `hilang_pada`. Mengisinya akan melahirkan angka yang naik-turun tanpa satu pun
 * peristiwa nyata di baliknya.
 *
 * ══ PENYARINGAN ADALAH PEKERJAAN UTAMA DI SINI, BUKAN PEMANGGILAN API ══
 *
 * YouTube mencocokkan kata secara TERPISAH dan longgar. Probe 4 Sep 2026 dengan
 * kata kunci RKZ mengembalikan 5.293 hasil — dan itu bukan 5.293 video tentang
 * RKZ. Menyimpan mentah-mentah berarti mengubur peninjau di bawah derau, lalu
 * modul ini ditinggalkan.
 *
 * Maka: frasa kata kunci harus muncul UTUH di judul atau deskripsi sebelum
 * sebuah video disimpan. Yang tidak lolos dibuang tanpa pernah menyentuh basis
 * data — bukan disimpan dengan penanda, karena baris yang tidak akan pernah
 * dibaca siapa pun tetap saja biaya.
 */

import { getTenantDb } from './tenant'
import { ambilAccessToken, googleGet, YT_DATA } from './google-client'
import { semaiKataKunci } from './sebutan-kata-kunci'
import { catatSnapshotRun } from './snapshot-run'

/** Scope yang wajib ada pada consent. Tanpa ini panggilan akan ditolak 403. */
const SCOPE_YT = 'https://www.googleapis.com/auth/youtube.readonly'

/** 50 = maksimum yang diterima `search.list` dalam satu panggilan. */
const PER_HALAMAN = 50
/**
 * Halaman per kata kunci. Satu pencarian memakan 100 unit dari kuota harian
 * 10.000, jadi 4 halaman x 2 kata kunci = 800 unit — lega. Batasnya ada bukan
 * demi kuota melainkan demi mutu: `order=date` membuat halaman kelima dan
 * seterusnya berisi video makin lama dan makin jarang relevan.
 */
const MAKS_HALAMAN = 4

/**
 * Tumpang tindih waktu saat penarikan lanjutan, dalam hari.
 *
 * Penarikan kedua dan seterusnya hanya meminta video yang terbit setelah
 * penarikan terakhir. Tanpa tumpang tindih, video yang terbit beberapa jam
 * sebelum penarikan berjalan tetapi baru terindeks Google sesudahnya akan
 * terlewat selamanya.
 */
const TUMPANG_TINDIH_HARI = 2

export interface HasilTarikYoutube {
  /** Hasil pencarian yang dibaca, sebelum disaring. */
  dibaca:     number
  /** Lolos penyaringan frasa. */
  cocok:      number
  baru:       number
  diperbarui: number
  /** Dibuang karena frasanya tidak muncul utuh — angka ini SENGAJA dilaporkan:
   *  bila ia mendekati `dibaca`, kata kuncinya terlalu longgar. */
  dibuang:    number
  /** Dibuang karena video milik channel RKZ sendiri. Dilaporkan terpisah dari
   *  `dibuang` supaya tidak tertukar: yang ini bukan soal kata kunci. */
  milikSendiri: number
  kataKunci:  number
  galat?:     string
}

interface HasilCari {
  id?: { videoId?: string }
  snippet?: {
    title?: string; description?: string; channelTitle?: string
    channelId?: string; publishedAt?: string
  }
}

/**
 * Normalisasi untuk pencocokan frasa.
 *
 * Tanda baca diubah jadi spasi, bukan dibuang: "St.Vincentius" dan
 * "St. Vincentius" harus dianggap sama, sementara membuang titiknya begitu saja
 * akan menyatukan kata yang memang terpisah.
 */
const normalkan = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()

export async function tarikSebutanYoutube(slug: string): Promise<HasilTarikYoutube> {
  const kosong: HasilTarikYoutube = {
    dibaca: 0, cocok: 0, baru: 0, diperbarui: 0, dibuang: 0, milikSendiri: 0, kataKunci: 0,
  }

  const mulai = Date.now()
  /** Mencatat lari lalu mengembalikan hasilnya — dipakai di SETIAP jalan keluar,
   *  termasuk yang berhenti sebelum satu panggilan pun dibuat. Jalan keluar yang
   *  tidak tercatat adalah persis lubang yang membuat kolektor rusak tak
   *  terlihat. */
  const selesai = async (h: HasilTarikYoutube): Promise<HasilTarikYoutube> => {
    await catatSnapshotRun(
      slug, 'SEBUTAN_YT',
      h.galat ? 'gagal' : 'ok',
      h.galat ?? `${h.dibaca} dibaca, ${h.cocok} cocok, ${h.baru} baru, ${h.dibuang} dibuang`,
      Date.now() - mulai,
    )
    return h
  }

  const db  = await getTenantDb(slug)
  const cfg = await db.googleConfig.findUnique({ where: { tenant_slug: slug } })

  if (!cfg?.refresh_token) {
    return selesai({ ...kosong, galat: 'Google belum tersambung — hubungkan lebih dulu di Pengaturan.' })
  }
  // Diperiksa di depan, bukan dibiarkan gagal 403 di tengah: pesan "scope kurang"
  // menunjuk ke tindakan yang jelas, sedangkan 403 mentah dari Google tidak.
  if (cfg.scopes?.length && !cfg.scopes.includes(SCOPE_YT)) {
    return selesai({ ...kosong, galat: 'Izin YouTube belum disetujui — sambungkan ulang Google dan setujui akses YouTube.' })
  }

  await semaiKataKunci(db, slug)
  const kunci = await db.sebutanKataKunci.findMany({
    where:   { tenant_slug: slug, sumber: 'YOUTUBE', aktif: true },
    orderBy: { urutan: 'asc' },
  })
  if (!kunci.length) {
    return selesai({ ...kosong, galat: 'Belum ada kata kunci YouTube yang aktif.' })
  }

  let token: string
  try {
    token = await ambilAccessToken(slug, {
      client_id:     cfg.client_id,
      client_secret: cfg.client_secret,
      refresh_token: cfg.refresh_token,
    })
  } catch (e) {
    return selesai({ ...kosong, galat: e instanceof Error ? e.message : 'Gagal menukar token Google.' })
  }

  /**
   * Channel RKZ sendiri — WAJIB dikeluarkan dari hasil.
   *
   * Pencarian "RKZ Surabaya" tentu saja menemukan video yang diunggah RKZ
   * sendiri, dan tanpa penyaring ini konten kita masuk sebagai "sebutan publik
   * tentang RKZ". Akibatnya bukan sekadar baris berlebih: konten sendiri hampir
   * selalu dilabeli POSITIF, sehingga RKZ menaikkan sentimennya sendiri dengan
   * kata-katanya sendiri. Itu merusak angka yang justru paling dipercaya orang.
   *
   * Kalau id channel belum tersimpan di konfigurasi, ditanyakan sekali — satu
   * unit kuota, dibanding seluruh laporan sentimen yang salah.
   */
  let milikSendiri = cfg.youtube_channel_id?.trim() || ''
  if (!milikSendiri) {
    const rCh = await googleGet(`${YT_DATA}/channels?part=id&mine=true`, token)
    if (rCh.ok) milikSendiri = String(rCh.json?.items?.[0]?.id ?? '')
  }

  // SATU kueri untuk seluruh yang sudah tersimpan — bukan findUnique per video.
  const tersimpan = new Map<string, string>(
    (await db.sebutan.findMany({
      where:  { tenant_slug: slug, sumber: 'YOUTUBE' },
      select: { id: true, sumber_id: true },
    })).map((r: { id: string; sumber_id: string }) => [r.sumber_id, r.id]),
  )

  const hasil = { ...kosong, kataKunci: kunci.length }
  let galat: string | undefined

  for (const k of kunci as { id: string; kata: string; ditarik_pada: Date | null }[]) {
    const frasa = normalkan(k.kata)
    if (!frasa) continue

    // Penarikan lanjutan hanya meminta yang terbit sejak terakhir kali, dengan
    // tumpang tindih. Penarikan pertama (`ditarik_pada` kosong) mengambil
    // riwayat sejauh yang diizinkan MAKS_HALAMAN.
    const sejak = k.ditarik_pada
      ? new Date(k.ditarik_pada.getTime() - TUMPANG_TINDIH_HARI * 86_400_000)
      : null

    let halaman = 0
    let pageToken: string | undefined

    while (halaman < MAKS_HALAMAN) {
      const q = new URLSearchParams({
        part:       'snippet',
        q:          k.kata,
        type:       'video',
        order:      'date',
        maxResults: String(PER_HALAMAN),
      })
      if (sejak)     q.set('publishedAfter', sejak.toISOString())
      if (pageToken) q.set('pageToken', pageToken)

      const r = await googleGet(`${YT_DATA}/search?${q}`, token)
      if (!r.ok) {
        // Kegagalan satu kata kunci TIDAK menggugurkan yang lain — pola yang
        // sama dipakai google-kanal.ts, dan alasannya sama: satu kueri yang
        // ditolak tidak boleh mengosongkan seluruh penarikan.
        galat = r.json?.error?.message ?? `HTTP ${r.status}`
        break
      }

      const data = (r.json?.items ?? []) as HasilCari[]
      for (const it of data) {
        const videoId = it.id?.videoId
        const sn      = it.snippet
        if (!videoId || !sn) continue
        hasil.dibaca++

        // Penyaring milik sendiri didahulukan sebelum saringan frasa: video RKZ
        // hampir pasti memuat frasanya utuh, jadi kalau urutannya dibalik ia
        // akan lolos dan tersimpan.
        if (milikSendiri && sn.channelId === milikSendiri) { hasil.milikSendiri++; continue }

        const judul = (sn.title ?? '').trim()
        const isi   = (sn.description ?? '').trim()

        // ── Penyaringan frasa utuh. Lihat catatan di kepala berkas. ──
        if (!normalkan(`${judul} ${isi}`).includes(frasa)) { hasil.dibuang++; continue }
        hasil.cocok++

        const teks = [judul, isi].filter(Boolean).join('\n').replace(/\s+/g, ' ').slice(0, 2000) || null
        const data_ = {
          penulis:  sn.channelTitle ?? null,
          username: sn.channelTitle ?? null,
          teks,
          tautan:   `https://www.youtube.com/watch?v=${videoId}`,
          mentah:   it as unknown as object,
        }

        const ada = tersimpan.get(videoId)
        if (!ada) {
          await db.sebutan.create({
            data: {
              tenant_slug: slug, sumber: 'YOUTUBE', sumber_id: videoId,
              terbit_pada: sn.publishedAt ? new Date(sn.publishedAt) : new Date(),
              ...data_,
            },
          })
          tersimpan.set(videoId, 'baru')
          hasil.baru++
        } else {
          // Judul dan deskripsi bisa disunting pemiliknya. `hilang_pada` TIDAK
          // disentuh di sini — lihat catatan di kepala berkas.
          await db.sebutan.update({ where: { id: ada }, data: data_ })
          hasil.diperbarui++
        }
      }

      pageToken = r.json?.nextPageToken
      halaman++
      if (!pageToken) break
    }

    // Ditandai walaupun ada galat di tengah: yang sudah tersimpan tetap
    // tersimpan, dan mengulang dari awal besok hanya membakar kuota untuk
    // membaca ulang hal yang sama.
    await db.sebutanKataKunci.update({
      where: { id: k.id }, data: { ditarik_pada: new Date() },
    })
  }

  return selesai({ ...hasil, galat })
}
