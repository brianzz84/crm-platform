/**
 * Penarik sebutan Instagram — konten orang lain yang MENANDAI akun RKZ.
 *
 * Memakai jalur Instagram Login (`graph.instagram.com`) dengan token yang sudah
 * dipegang untuk DM. Diuji 4 Sep 2026: endpoint `/tags` mengembalikan **252
 * konten dari 102 akun berbeda**, tertua Mei 2023 — tanpa App Review, tanpa
 * izin tambahan, tanpa biaya.
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

const GRAPH = 'https://graph.instagram.com'
const VERSI = 'v21.0'
const FIELDS = 'id,caption,username,timestamp,media_type,permalink,like_count,comments_count'

/** 50 per halaman × 20 = 1.000 konten. Jauh di atas 252 yang ada sekarang,
 *  cukup longgar untuk pertumbuhan bertahun-tahun. */
const PER_HALAMAN  = 50
const MAKS_HALAMAN = 20

export interface HasilTarikSebutan {
  ditemukan:  number
  baru:       number
  diperbarui: number
  /** Ditandai hilang di sumber. Hanya diisi bila penelusuran tuntas. */
  hilang:     number
  /** Muncul kembali setelah sempat ditandai hilang. */
  kembali:    number
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
    ditemukan: 0, baru: 0, diperbarui: 0, hilang: 0, kembali: 0, tuntas: false,
  }

  const db  = await getTenantDb(slug)
  const cfg = await db.metaConfig.findUnique({ where: { tenant_slug: slug } })

  if (!cfg?.ig_msg_token || !cfg.ig_business_id) {
    return { ...kosong, galat: 'Instagram Messaging belum tersambung — token jalur ini yang dipakai.' }
  }

  let url: string | null =
    `${GRAPH}/${VERSI}/${cfg.ig_business_id}/tags` +
    `?fields=${FIELDS}&limit=${PER_HALAMAN}&access_token=${encodeURIComponent(cfg.ig_msg_token)}`

  const terlihat = new Set<string>()
  let ditemukan = 0, baru = 0, diperbarui = 0, kembali = 0
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

      const ada = await db.sebutan.findUnique({
        where: { tenant_slug_sumber_sumber_id: {
          tenant_slug: slug, sumber: 'IG_TAG', sumber_id: m.id } },
        select: { id: true, hilang_pada: true },
      })

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

  return { ditemukan, baru, diperbarui, hilang, kembali, tuntas, galat }
}
