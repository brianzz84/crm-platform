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
      `${pct.id}/messages?fields=id,created_time,from{id,name},message&limit=${MAKS_PESAN}`,
      token, 30_000,
    )
    if (!rMsg.ok) continue

    const percakapanDb = await db.conversation.upsert({
      where:  { tenant_slug_channel_channel_user_id: {
        tenant_slug: slug, channel: 'FB', channel_user_id: String(lawan.id) } },
      create: {
        tenant_slug: slug, channel: 'FB', channel_user_id: String(lawan.id),
        channel_user_name: lawan.name ? String(lawan.name) : null,
        last_message_at: new Date(pct.updated_time ?? Date.now()),
      },
      // Nama ikut disegarkan: pengguna bisa mengubah nama profilnya, dan Inbox
      // yang menampilkan nama usang lebih membingungkan daripada menampilkan ID.
      update: {
        channel_user_name: lawan.name ? String(lawan.name) : undefined,
        last_message_at: new Date(pct.updated_time ?? Date.now()),
      },
    })
    percakapan++

    // Graph mengembalikan pesan terbaru lebih dulu; dibalik supaya urutan simpan
    // mengikuti urutan percakapan sebenarnya.
    for (const m of [...(rMsg.json?.data ?? [])].reverse()) {
      if (!m?.id) continue

      // `from` WAJIB diminta dengan subfield eksplisit — tanpa `from{id,name}`,
      // Graph tidak selalu menyertakan id-nya dan seluruh pesan jatuh ke "masuk".
      // Akibatnya fatal dan senyap: response time akan melaporkan setiap
      // percakapan tidak terjawab, padahal balasannya ada.
      const fromId = m.from?.id ?? null
      if (!fromId) continue      // arah tak terbaca — lebih baik dilewat daripada disalahartikan
      const dariHalaman = String(fromId) === String(pageId)
      const isi = String(m.message ?? '').trim()
      // Pesan tanpa teks (stiker, lampiran) tetap dicatat: ia tetap menghentikan
      // hitungan waktu tunggu, dan mengabaikannya membuat response time keliru.
      const konten = isi || '(lampiran tanpa teks)'

      // PERBARUI bila sudah ada, jangan lewati.
      //
      // Melewati duplikat terdengar hemat, tapi berarti kekeliruan pada penarikan
      // pertama menetap selamanya — persis yang terjadi pada arah pesan, yang
      // sempat tersimpan terbalik dan tidak akan pernah membaik sendiri. Dengan
      // memperbarui, koreksi mengalir pada penarikan berikutnya tanpa siapa pun
      // perlu menghapus apa pun, dan kolom yang ditambahkan kelak ikut terisi
      // untuk pesan lama.
      const adaSebelumnya = await db.message.findFirst({
        where:  { conversation_id: percakapanDb.id, external_id: String(m.id) },
        select: { id: true },
      })

      const isiPesan = {
        direction: (dariHalaman ? 'outgoing' : 'incoming') as 'outgoing' | 'incoming',
        content: konten,
        status: 'SENT' as const,
        sent_at: m.created_time ? new Date(m.created_time) : null,
      }

      if (adaSebelumnya) {
        await db.message.update({ where: { id: adaSebelumnya.id }, data: isiPesan })
      } else {
        await db.message.create({
          data: {
            conversation_id: percakapanDb.id,
            external_id: String(m.id),
            created_at: m.created_time ? new Date(m.created_time) : undefined,
            ...isiPesan,
          },
        })
        pesanBaru++
      }
    }
  }

  return { percakapan, pesanBaru }
}

/**
 * Kirim balasan ke percakapan Messenger.
 *
 * Aturan jendela Meta yang wajib disadari: balasan biasa hanya boleh dikirim
 * dalam 24 JAM sejak pesan terakhir pengguna. Lewat dari itu Meta menolak,
 * kecuali memakai tag. Karena RKZ memakai fitur Human Agent, tag itulah yang
 * dipakai sebagai cadangan — ia memperpanjang jendela menjadi 7 hari untuk
 * balasan yang benar-benar ditulis manusia.
 *
 * Dicoba tanpa tag lebih dulu: tag HUMAN_AGENT hanya sah untuk balasan manusia,
 * dan memakainya di luar keperluan adalah pelanggaran kebijakan Meta yang bisa
 * berujung pencabutan izin. Jadi ia cadangan, bukan bawaan.
 */
export async function kirimPesanMessenger(
  pageId: string, token: string, psid: string, teks: string,
): Promise<{ ok: boolean; messageId?: string; galat?: string }> {
  const kirim = async (tag?: string) => {
    const badan: Record<string, unknown> = {
      recipient: { id: psid },
      message:   { text: teks },
      messaging_type: tag ? 'MESSAGE_TAG' : 'RESPONSE',
      ...(tag ? { tag } : {}),
    }
    const res = await fetch(
      `https://graph.facebook.com/v22.0/${pageId}/messages?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(badan),
        signal: AbortSignal.timeout(20_000),
      },
    )
    const json = await res.json().catch(() => ({}))
    return { ok: res.ok, json }
  }

  let r = await kirim()
  // Kode 10 / subkode 2018278 = di luar jendela 24 jam. Hanya itu yang layak
  // dicoba ulang dengan tag; galat lain tidak akan berubah karenanya.
  const diLuarJendela = r.json?.error?.code === 10 || r.json?.error?.error_subcode === 2018278
  if (!r.ok && diLuarJendela) r = await kirim('HUMAN_AGENT')

  if (!r.ok) {
    const e = r.json?.error
    return { ok: false, galat: [e?.message, e?.code ? `(code ${e.code})` : ''].filter(Boolean).join(' ') }
  }
  return { ok: true, messageId: String(r.json?.message_id ?? '') }
}
