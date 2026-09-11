/**
 * Penarik sebutan Instagram — konten orang lain yang MENANDAI akun RKZ.
 *
 * Memakai jalur Instagram Login (`graph.instagram.com`) dengan token yang sudah
 * dipegang untuk DM. Dijalankan tuntas 10 Sep 2026: endpoint `/tags`
 * mengembalikan **608 konten dari 267 akun berbeda**, tertua 3 Desember 2015 —
 * tanpa App Review, tanpa izin tambahan, tanpa biaya. (Pengujian pertama 4 Sep
 * melaporkan 252/102 sejak Mei 2023; itu penelusuran yang terpotong di halaman
 * ke-15, bukan jumlah sebenarnya. Lihat catatan pada PER_HALAMAN di bawah.)
 *
 * Endpoint yang sama DITOLAK lewat token Halaman di graph.facebook.com
 * ("(#10) Application does not have permission"). Jadi jalur Instagram Login
 * bukan sekadar alternatif yang setara — ia satu-satunya yang bekerja.
 *
 * BATAS YANG HARUS DIPATUHI: `/tags` mendaftar SELURUH tandaan, jadi ketiadaan
 * sebuah konten pada penelusuran yang TUNTAS memang berarti ia sudah hilang.
 * Tetapi bila penelusuran berhenti di batas halaman, ketiadaan tidak
 * membuktikan apa pun — dan menandainya "hilang" akan melahirkan angka yang
 * naik-turun tanpa ada yang benar-benar terjadi. Karena itu penandaan hanya
 * dilakukan saat `tuntas`.
 */

import { getTenantDb } from './tenant'
import { pesanGalatIg } from './instagram-messaging'
import { catatSnapshotRun } from './snapshot-run'

const GRAPH = 'https://graph.instagram.com'
const VERSI = 'v21.0'
const FIELDS = 'id,caption,username,timestamp,media_type,permalink,like_count,comments_count'

/**
 * Batas ini SUDAH SALAH SEKALI dan diukur ulang 10 Sep 2026.
 *
 * Versi pertama memakai 50 per halaman dengan batas 20 halaman, atas dugaan
 * bahwa 252 konten sudah mendekati seluruhnya. Dijalankan sungguhan, akun RKZ
 * ternyata punya **608 sebutan dari 267 akun, tertua Desember 2015** — batas itu
 * hanya menangkap 332, dan `tuntas` tidak pernah tercapai sehingga penandaan
 * hilang tidak akan pernah berjalan.
 *
 * 100 per halaman diterima Instagram dan menuntaskan 608 dalam 42 halaman.
 * Batas 60 memberi ruang tumbuh sekitar 40% sebelum perlu ditinjau lagi.
 */
const PER_HALAMAN  = 100
const MAKS_HALAMAN = 60

export interface HasilTarikSebutan {
  ditemukan:  number
  baru:       number
  diperbarui: number
  /** Ditandai hilang di sumber. Hanya diisi bila penelusuran tuntas. */
  hilang:     number
  /** Muncul kembali setelah sempat ditandai hilang. */
  kembali:    number
  /** Dilewati karena unggahan milik akun RKZ sendiri. */
  milikSendiri: number
  /** Seluruh halaman berhasil ditelusuri sampai habis. */
  tuntas:     boolean
  galat?:     string
}

interface Tandaan {
  id?: string; caption?: string; username?: string; timestamp?: string
  media_type?: string; permalink?: string
}

export async function tarikSebutanInstagram(slug: string): Promise<HasilTarikSebutan> {
  const kosong: HasilTarikSebutan = {
    ditemukan: 0, baru: 0, diperbarui: 0, hilang: 0, kembali: 0,
    milikSendiri: 0, tuntas: false,
  }

  const db  = await getTenantDb(slug)
  const cfg = await db.metaConfig.findUnique({ where: { tenant_slug: slug } })

  if (!cfg?.ig_msg_token || !cfg.ig_business_id) {
    const galat = 'Instagram Messaging belum tersambung — token jalur ini yang dipakai.'
    // Dicatat sebagai GAGAL, bukan dilewati diam-diam. Kolektor yang tidak
    // pernah bisa berjalan menghasilkan layar sepi yang sama persis dengan
    // kolektor sehat yang tidak menemukan apa-apa.
    await catatSnapshotRun(slug, 'SEBUTAN_IG', 'gagal', galat)
    return { ...kosong, galat }
  }

  const mulai = Date.now()

  let url: string | null =
    `${GRAPH}/${VERSI}/${cfg.ig_business_id}/tags` +
    `?fields=${FIELDS}&limit=${PER_HALAMAN}&access_token=${encodeURIComponent(cfg.ig_msg_token)}`

  // SATU kueri untuk seluruh yang sudah tersimpan, bukan findUnique per item.
  // Pada 608 sebutan, cara lama berarti 1.216 perjalanan ke basis data tiap
  // malam — dan `kembali` tetap bisa dihitung karena `hilang_pada` ikut dibaca
  // di sini.
  const tersimpan = new Map<string, { id: string; hilang_pada: Date | null }>(
    (await db.sebutan.findMany({
      where:  { tenant_slug: slug, sumber: 'IG_TAG' },
      select: { id: true, sumber_id: true, hilang_pada: true },
    })).map((r: { id: string; sumber_id: string; hilang_pada: Date | null }) =>
      [r.sumber_id, { id: r.id, hilang_pada: r.hilang_pada }]),
  )

  /**
   * Akun RKZ sendiri — dikeluarkan dari hasil.
   *
   * `/tags` mendaftar tandaan dari siapa pun, termasuk dari akun RKZ sendiri bila
   * ia menandai dirinya di unggahannya. Konten sendiri hampir selalu dilabeli
   * POSITIF, jadi membiarkannya masuk berarti RKZ menaikkan sentimennya sendiri
   * dengan kata-katanya sendiri — merusak justru angka yang paling dipercaya.
   *
   * Dibandingkan pada username karena `/tags` mengembalikan username, bukan id.
   */
  const akunSendiri = (cfg.ig_msg_username ?? '').trim().toLowerCase()

  const terlihat = new Set<string>()
  let ditemukan = 0, baru = 0, diperbarui = 0, kembali = 0, milikSendiri = 0
  let halaman = 0, tuntas = false, galat: string | undefined

  while (url && halaman < MAKS_HALAMAN) {
    let json: Record<string, unknown>
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
      json = await res.json().catch(() => ({}))
      if (!res.ok) { galat = pesanGalatIg({ ok: false, status: res.status, json }); break }
    } catch (e) {
      galat = e instanceof Error ? e.message : 'network error'
      break
    }

    const data = (json.data ?? []) as Tandaan[]
    for (const m of data) {
      if (!m.id) continue

      if (akunSendiri && (m.username ?? '').trim().toLowerCase() === akunSendiri) {
        // TETAP ditandai terlihat. Kalau tidak, ia akan dianggap "hilang di
        // sumber" pada penelusuran tuntas berikutnya — padahal ia ada, hanya
        // sengaja tidak disimpan.
        terlihat.add(m.id)
        milikSendiri++
        continue
      }

      ditemukan++
      terlihat.add(m.id)

      const isi = {
        penulis:  m.username ?? null,
        username: m.username ?? null,
        // Caption dipotong: sebagian unggahan memuat ratusan tagar yang tidak
        // menambah makna tetapi membengkakkan baris dan biaya token AI.
        teks:     (m.caption ?? '').replace(/\s+/g, ' ').slice(0, 2000) || null,
        tautan:   m.permalink ?? null,
        mentah:   m as unknown as object,
      }

      const ada = tersimpan.get(m.id)

      if (!ada) {
        await db.sebutan.create({
          data: {
            tenant_slug: slug, sumber: 'IG_TAG', sumber_id: m.id,
            terbit_pada: m.timestamp ? new Date(m.timestamp) : new Date(),
            ...isi,
          },
        })
        baru++
      } else {
        // Diperbarui, bukan dilewati: caption bisa disunting pemiliknya, dan
        // baris yang menampilkan versi lama akan menyesatkan peninjau.
        await db.sebutan.update({
          where: { id: ada.id },
          data:  { ...isi, hilang_pada: null },
        })
        diperbarui++
        if (ada.hilang_pada) kembali++
      }
    }

    const berikut = (json.paging as { next?: string } | undefined)?.next
    url = berikut ?? null
    halaman++
    if (!berikut) tuntas = true
  }

  // ── Penandaan hilang ───────────────────────────────────────────────
  // HANYA bila penelusuran tuntas. Lihat catatan di kepala berkas: pada
  // penelusuran yang terpotong, ketiadaan bukan bukti apa pun.
  let hilang = 0
  if (tuntas && terlihat.size > 0) {
    const r = await db.sebutan.updateMany({
      where: {
        tenant_slug: slug, sumber: 'IG_TAG',
        hilang_pada: null,
        sumber_id: { notIn: [...terlihat] },
      },
      data: { hilang_pada: new Date() },
    })
    hilang = r.count
  }

  // `tuntas` menentukan status: penelusuran yang terpotong bukan kegagalan,
  // tetapi juga bukan keberhasilan penuh — penandaan hilang dilewati di sana.
  await catatSnapshotRun(
    slug, 'SEBUTAN_IG',
    galat ? 'gagal' : tuntas ? 'ok' : 'sebagian',
    galat ?? `${ditemukan} dibaca, ${baru} baru, ${hilang} hilang, tuntas=${tuntas}`,
    Date.now() - mulai,
  )

  return { ditemukan, baru, diperbarui, hilang, kembali, milikSendiri, tuntas, galat }
}
