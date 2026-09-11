/**
 * Penarik komentar di unggahan RKZ SENDIRI — Instagram & Facebook.
 *
 * Sumber keempat modul Sebutan Publik. Inilah yang paling mendekati harapan
 * "polisi merek": keluhan yang ditulis orang di kolom komentar kanal resmi, yang
 * selama ini hanya terbaca kalau ada admin yang kebetulan membukanya.
 *
 * ══ BATAS YANG WAJIB DIINGAT SAAT MEMBACA HASILNYA ══
 *
 * Yang tertangkap di sini HANYA komentar di unggahan MILIK RKZ. Komentar di
 * unggahan orang lain tidak terjangkau — Meta tidak punya endpoint pencarian
 * komentar, di tingkat akses mana pun, dengan biaya berapa pun. Jangan pernah
 * menyajikan angka dari berkas ini sebagai "seluruh komentar tentang RKZ".
 *
 * ══ BALASAN AKUN SENDIRI DISARING — INI BUKAN KERAPIAN, INI KEBENARAN ══
 *
 * Kolom komentar memuat balasan admin RKZ sendiri. Tanpa penyaring, balasan
 * customer service masuk sebagai "sebutan publik tentang RKZ", hampir selalu
 * dilabeli POSITIF, dan rumah sakit menaikkan sentimennya sendiri dengan
 * kata-katanya sendiri. Itu merusak justru angka yang paling dipercaya orang.
 *
 * Disaring pada ID, bukan nama: `from.id` untuk Facebook (dibandingkan dengan
 * `page_id`) dan `username` untuk Instagram — jalur IG tidak selalu memberi
 * `from`, sementara username akun sendiri sudah tersimpan.
 *
 * ══ MENGAPA MENYAPU DARI SocialContent, BUKAN MENDAFTAR ULANG MEDIA ══
 *
 * Unggahan RKZ sudah ditarik tiap malam dan tersimpan lengkap dengan
 * `permalink`. Mendaftar ulang lewat API berarti membayar panggilan untuk data
 * yang sudah dipegang, dan membuat dua daftar unggahan yang bisa menyimpang.
 */

import { getTenantDb } from './tenant'
import { graphGet, pesanErrorGraph } from './meta-social-client'
import { catatSnapshotRun, type SumberSnapshot } from './snapshot-run'

/**
 * Unggahan terbaru yang disapu tiap lari.
 *
 * Bukan seluruh riwayat: komentar hampir selalu datang dalam beberapa hari
 * pertama, dan menyapu ratusan unggahan lama tiap malam menghabiskan kuota untuk
 * membaca ulang hal yang sama. Penarikan PERTAMA tetap menyapu lebih dalam lewat
 * `unggahanAwal`.
 */
const UNGGAHAN_RUTIN = 25
const UNGGAHAN_AWAL  = 120

/** Komentar per unggahan. 50 = batas nyaman Graph; lebih dari ini jarang ada. */
const PER_HALAMAN  = 50
/** Halaman per unggahan — 250 komentar sudah jauh di atas unggahan teramai RKZ. */
const MAKS_HALAMAN = 5

export interface HasilTarikKomentar {
  unggahan:   number
  dibaca:     number
  baru:       number
  diperbarui: number
  /** Dilewati karena ditulis akun RKZ sendiri. */
  milikSendiri: number
  /** Ditandai hilang. Hanya untuk unggahan yang tersapu TUNTAS — lihat catatan. */
  hilang:     number
  galat?:     string
}

interface Komentar {
  id?: string
  text?: string        // Instagram
  message?: string     // Facebook
  username?: string    // Instagram
  from?: { id?: string; name?: string }
  timestamp?: string   // Instagram
  created_time?: string// Facebook
}

/**
 * Satu kanal. Dipanggil dua kali oleh `tarikSebutanKomentar`.
 *
 * `sumberSebutan` dan `sumberLari` sengaja terpisah: yang pertama menandai ASAL
 * BARIS di tabel sebutan, yang kedua menamai PEKERJAAN di riwayat lari.
 */
async function tarikSatuKanal(
  slug: string,
  kanal: 'IG' | 'FB',
  token: string,
  akunSendiri: { id: string; username: string },
): Promise<HasilTarikKomentar> {
  const hasil: HasilTarikKomentar = {
    unggahan: 0, dibaca: 0, baru: 0, diperbarui: 0, milikSendiri: 0, hilang: 0,
  }
  const db = await getTenantDb(slug)
  const sumberSebutan = kanal === 'IG' ? 'KOMENTAR_IG' : 'KOMENTAR_FB'

  // Penarikan pertama menyapu lebih dalam. Sesudahnya cukup unggahan terbaru,
  // karena komentar baru pada unggahan lama sangat jarang.
  const sudahAda = await db.sebutan.count({
    where: { tenant_slug: slug, sumber: sumberSebutan } })
  const batasUnggahan = sudahAda === 0 ? UNGGAHAN_AWAL : UNGGAHAN_RUTIN

  const unggahan = await db.socialContent.findMany({
    where:   { tenant_slug: slug, kanal },
    orderBy: { terbit_pada: 'desc' },
    take:    batasUnggahan,
    select:  { konten_id: true, permalink: true },
  })
  if (!unggahan.length) {
    return { ...hasil, galat: `Belum ada unggahan ${kanal} tersimpan — jalankan snapshot medsos lebih dulu.` }
  }

  // SATU kueri untuk seluruh yang sudah tersimpan pada kanal ini.
  const tersimpan = new Map<string, { id: string; teks: string | null }>(
    (await db.sebutan.findMany({
      where:  { tenant_slug: slug, sumber: sumberSebutan },
      select: { id: true, sumber_id: true, teks: true },
    })).map((r: { id: string; sumber_id: string; teks: string | null }) =>
      [r.sumber_id, { id: r.id, teks: r.teks }]),
  )

  const medan = kanal === 'IG'
    ? 'id,text,username,timestamp'
    : 'id,message,created_time,from{id,name}'

  let galat: string | undefined

  for (const u of unggahan as { konten_id: string; permalink: string | null }[]) {
    hasil.unggahan++

    const terlihat = new Set<string>()
    let jalur: string | null =
      `${u.konten_id}/comments?fields=${medan}&limit=${PER_HALAMAN}`
    let halaman = 0
    let tuntas  = false

    while (jalur && halaman < MAKS_HALAMAN) {
      const r = await graphGet(jalur, token)
      if (!r.ok) {
        // Kegagalan satu unggahan TIDAK menggugurkan sisanya — unggahan bisa
        // dihapus, atau komentarnya dimatikan. Tetapi galat pertama disimpan,
        // karena bila sebabnya izin, seluruh lari akan gagal dengan cara yang
        // sama dan itu harus terlihat di pita cakupan.
        if (!galat) galat = pesanErrorGraph(r)
        break
      }

      const data = (r.json?.data ?? []) as Komentar[]
      for (const k of data) {
        if (!k.id) continue

        const teksAsli = (kanal === 'IG' ? k.text : k.message) ?? ''
        const penulis  = (kanal === 'IG' ? k.username : k.from?.name) ?? null

        // ── Penyaring akun sendiri. Lihat catatan di kepala berkas. ──
        const sendiri = kanal === 'IG'
          ? (k.username ?? '').trim().toLowerCase() === akunSendiri.username
          : (k.from?.id ?? '') === akunSendiri.id
        // Kunci gabungan media:komentar. Dipakai agar penandaan hilang bisa
        // dibatasi pada unggahan yang benar-benar tersapu tuntas, tanpa perlu
        // kolom baru di skema.
        const kunci = `${u.konten_id}:${k.id}`

        if (sendiri) {
          // Tetap ditandai terlihat, supaya tidak dianggap hilang nanti.
          terlihat.add(kunci)
          hasil.milikSendiri++
          continue
        }

        hasil.dibaca++
        terlihat.add(kunci)

        const teks = teksAsli.replace(/\s+/g, ' ').trim().slice(0, 2000) || null
        const isi = {
          penulis, username: penulis, teks,
          // Tautan mengarah ke UNGGAHAN INDUK, bukan ke komentarnya: Instagram
          // tidak memberi permalink per komentar, dan tautan yang mati saat
          // diklik lebih buruk daripada tautan yang mendarat satu tingkat di atas.
          tautan: u.permalink ?? null,
          mentah: { ...k, konten_id: u.konten_id } as unknown as object,
        }

        const ada = tersimpan.get(kunci)
        if (!ada) {
          await db.sebutan.create({
            data: {
              tenant_slug: slug, sumber: sumberSebutan, sumber_id: kunci,
              terbit_pada: new Date(k.timestamp ?? k.created_time ?? Date.now()),
              ...isi,
            },
          })
          tersimpan.set(kunci, { id: 'baru', teks })
          hasil.baru++
        } else if (ada.teks !== teks) {
          await db.sebutan.update({ where: { id: ada.id }, data: { ...isi, hilang_pada: null } })
          hasil.diperbarui++
        }
      }

      const berikut = r.json?.paging?.next as string | undefined
      // `paging.next` berupa URL penuh; graphGet menerima path relatif, jadi
      // cukup dipakai penandanya dan kursornya diambil.
      const kursor = r.json?.paging?.cursors?.after as string | undefined
      jalur = berikut && kursor
        ? `${u.konten_id}/comments?fields=${medan}&limit=${PER_HALAMAN}&after=${kursor}`
        : null
      halaman++
      if (!berikut) tuntas = true
    }

    // ── Penandaan hilang, DIBATASI pada unggahan ini saja ──
    // Sah di sini — berbeda dari YouTube dan ulasan — karena komentar pada media
    // milik sendiri benar-benar didaftar utuh. Tetapi hanya bila sapuan unggahan
    // ini tuntas: pada sapuan yang terpotong, ketiadaan tidak membuktikan apa pun.
    if (tuntas && terlihat.size > 0) {
      const r = await db.sebutan.updateMany({
        where: {
          tenant_slug: slug, sumber: sumberSebutan,
          hilang_pada: null,
          sumber_id: { startsWith: `${u.konten_id}:`, notIn: [...terlihat] },
        },
        data: { hilang_pada: new Date() },
      })
      hasil.hilang += r.count
    }
  }

  return { ...hasil, galat }
}

export async function tarikSebutanKomentar(slug: string): Promise<{
  ig: HasilTarikKomentar; fb: HasilTarikKomentar
}> {
  const kosong: HasilTarikKomentar = {
    unggahan: 0, dibaca: 0, baru: 0, diperbarui: 0, milikSendiri: 0, hilang: 0,
  }

  const db  = await getTenantDb(slug)
  const cfg = await db.metaConfig.findUnique({ where: { tenant_slug: slug } })
  const token = cfg?.insights_token || cfg?.access_token || ''

  const catat = async (
    sumber: SumberSnapshot, mulai: number, h: HasilTarikKomentar,
  ) => {
    await catatSnapshotRun(
      slug, sumber,
      h.galat ? (h.dibaca ? 'sebagian' : 'gagal') : 'ok',
      h.galat ?? `${h.unggahan} unggahan, ${h.dibaca} komentar, ${h.baru} baru, `
               + `${h.milikSendiri} milik sendiri, ${h.hilang} hilang`,
      Date.now() - mulai,
    )
  }

  if (!token) {
    const galat = 'Token Meta belum diisi — komentar tidak bisa ditarik.'
    const h = { ...kosong, galat }
    await catat('SEBUTAN_KOMENTAR_IG', Date.now(), h)
    await catat('SEBUTAN_KOMENTAR_FB', Date.now(), h)
    return { ig: h, fb: h }
  }

  const akun = {
    id:       cfg?.page_id ?? '',
    username: (cfg?.ig_msg_username ?? '').trim().toLowerCase(),
  }

  const mulaiIg = Date.now()
  const ig = await tarikSatuKanal(slug, 'IG', token, akun)
  await catat('SEBUTAN_KOMENTAR_IG', mulaiIg, ig)

  const mulaiFb = Date.now()
  const fb = await tarikSatuKanal(slug, 'FB', token, akun)
  await catat('SEBUTAN_KOMENTAR_FB', mulaiFb, fb)

  return { ig, fb }
}
