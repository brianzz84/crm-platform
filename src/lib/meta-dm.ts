/**
 * Penarik percakapan Messenger (Facebook Page) ke dalam Inbox CRM.
 *
 * Jalur endpoint yang dipakai BUKAN pilihan sembarang: lima bentuk diuji lewat
 * probe dan hanya `{page-id}/conversations` serta bentuk bersarangnya yang
 * dilayani. Instagram memakai jalur yang sama tapi menuntut Advanced Access lewat
 * App Review, jadi belum disertakan di sini.
 *
 * DUA ARAH, bukan hanya pesan masuk. Balasan admin dari Business Suite ikut
 * ditarik karena tanpanya response time tidak bisa dihitung — dan lebih buruk,
 * seluruh percakapan akan tampak "tidak terjawab" padahal sudah dijawab di tempat
 * lain. Angka yang salah arah begitu lebih berbahaya daripada tidak ada angka.
 */
import { getTenantDb } from './tenant'
import { graphGet, pesanErrorGraph } from './meta-social-client'

/** Percakapan per penarikan. Riwayat lama cukup ditarik sekali; sesudahnya hanya yang berubah. */
const MAKS_PERCAKAPAN = 25
const MAKS_PESAN      = 50

export interface HasilTarikDm {
  percakapan: number
  pesanBaru: number
  galat?: string
}

/**
 * Tarik percakapan Page beserta pesannya.
 *
 * `sejakHari` membatasi seberapa jauh ke belakang. Penarikan pertama boleh jauh
 * (riwayat Page RKZ terbaca sampai ~4 bulan); penarikan rutin cukup beberapa hari
 * supaya murah — percakapan yang tidak berubah tidak perlu dibaca ulang.
 */
export async function tarikDmFacebook(slug: string, sejakHari = 7): Promise<HasilTarikDm> {
  const db   = await getTenantDb(slug)
  const meta = await db.metaConfig.findUnique({ where: { tenant_slug: slug } })
  const token  = meta?.insights_token || meta?.access_token
  const pageId = meta?.page_id

  if (!pageId || !token) return { percakapan: 0, pesanBaru: 0, galat: 'Facebook Page belum dikonfigurasi.' }

  const batas = new Date(Date.now() - sejakHari * 86_400_000)

  const rPct = await graphGet(
    `${pageId}/conversations?fields=id,updated_time,participants&limit=${MAKS_PERCAKAPAN}`,
    token, 30_000,
  )
  if (!rPct.ok) return { percakapan: 0, pesanBaru: 0, galat: pesanErrorGraph(rPct) }

  let percakapan = 0, pesanBaru = 0

  for (const pct of rPct.json?.data ?? []) {
    if (pct.updated_time && new Date(pct.updated_time) < batas) continue

    // Lawan bicara = peserta yang BUKAN Halaman. Tanpa penyaringan ini, percakapan
    // akan tersimpan atas nama Halaman sendiri dan seluruhnya menumpuk jadi satu.
    const lawan = (pct.participants?.data ?? []).find((p: any) => String(p.id) !== String(pageId))
    if (!lawan) continue

    const rMsg = await graphGet(
      `${pct.id}/messages?fields=id,created_time,from,message&limit=${MAKS_PESAN}`,
      token, 30_000,
    )
    if (!rMsg.ok) continue

    const percakapanDb = await db.conversation.upsert({
      where:  { tenant_slug_channel_channel_user_id: {
        tenant_slug: slug, channel: 'FB', channel_user_id: String(lawan.id) } },
      create: {
        tenant_slug: slug, channel: 'FB', channel_user_id: String(lawan.id),
        last_message_at: new Date(pct.updated_time ?? Date.now()),
      },
      update: { last_message_at: new Date(pct.updated_time ?? Date.now()) },
    })
    percakapan++

    // Graph mengembalikan pesan terbaru lebih dulu; dibalik supaya urutan simpan
    // mengikuti urutan percakapan sebenarnya.
    for (const m of [...(rMsg.json?.data ?? [])].reverse()) {
      if (!m?.id) continue

      const dariHalaman = String(m.from?.id ?? '') === String(pageId)
      const isi = String(m.message ?? '').trim()
      // Pesan tanpa teks (stiker, lampiran) tetap dicatat: ia tetap menghentikan
      // hitungan waktu tunggu, dan mengabaikannya membuat response time keliru.
      const konten = isi || '(lampiran tanpa teks)'

      try {
        await db.message.create({
          data: {
            conversation_id: percakapanDb.id,
            direction: dariHalaman ? 'outgoing' : 'incoming',
            content: konten,
            external_id: String(m.id),
            status: 'SENT',
            sent_at: m.created_time ? new Date(m.created_time) : null,
            created_at: m.created_time ? new Date(m.created_time) : undefined,
          },
        })
        pesanBaru++
      } catch (e: any) {
        // P2002 = sudah pernah ditarik. Itu keadaan NORMAL pada penarikan berulang,
        // bukan kegagalan — hanya galat lain yang layak dinaikkan.
        if (e?.code !== 'P2002') throw e
      }
    }
  }

  return { percakapan, pesanBaru }
}
