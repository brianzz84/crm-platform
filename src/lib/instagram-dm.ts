/**
 * Menarik DM Instagram ke Inbox — jalur Instagram Login.
 *
 * Sepadan dengan `meta-dm.ts` untuk Facebook, tetapi lewat `graph.instagram.com`.
 * Berkas itu menulis di kepalanya bahwa "Instagram menuntut Advanced Access lewat
 * App Review, jadi belum disertakan". Kalimat itu sudah terbantah 30 Agu 2026:
 * jalur Instagram Login melayani percakapan yang sama pada Standard Access.
 *
 * DUA ARAH, bukan hanya pesan masuk. Balasan yang dikirim dari aplikasi Instagram
 * ikut ditarik — tanpa itu percakapan yang sudah dijawab di tempat lain akan
 * tampak menggantung di Inbox, dan angka responsivitas jadi menuduh orang yang
 * salah.
 *
 * Penarikan ini tetap dibutuhkan meski webhook sudah jalan: webhook bisa gagal,
 * dan riwayat sebelum webhook dipasang tidak akan pernah dikirim ulang oleh Meta.
 */

import { getTenantDb } from './tenant'
import { daftarPercakapan, isiPercakapan } from './instagram-messaging'

/** Sepadan dengan batas di meta-dm.ts — riwayat lama cukup ditarik sekali. */
const MAKS_PERCAKAPAN = 25
const MAKS_PESAN      = 50

export interface HasilTarikDmIg {
  percakapan: number
  pesanBaru:  number
  galat?:     string
}

export async function tarikDmInstagram(
  slug: string, sejakHari = 7,
): Promise<HasilTarikDmIg> {
  const db  = await getTenantDb(slug)
  const cfg = await db.metaConfig.findUnique({ where: { tenant_slug: slug } })

  if (!cfg?.ig_msg_token || !cfg.ig_msg_user_id) {
    return { percakapan: 0, pesanBaru: 0, galat: 'Instagram Messaging belum tersambung.' }
  }
  // Saklar sendiri: jalur ini masih baru, dan harus bisa dimatikan tanpa
  // menyentuh WhatsApp, Facebook, Insight, maupun Ads.
  if (!cfg.ig_msg_aktif) {
    return { percakapan: 0, pesanBaru: 0, galat: 'Penarikan Instagram belum diaktifkan.' }
  }

  const akun  = String(cfg.ig_msg_user_id)
  const batas = new Date(Date.now() - sejakHari * 86_400_000)

  const daftar = await daftarPercakapan(cfg.ig_msg_token, MAKS_PERCAKAPAN, true)
  if (!daftar.ok) return { percakapan: 0, pesanBaru: 0, galat: daftar.pesan }

  let percakapan = 0, pesanBaru = 0

  for (const pct of daftar.data) {
    if (pct.diperbaruiPada && new Date(pct.diperbaruiPada) < batas) continue

    // Lawan bicara = peserta yang BUKAN akun kita. Tanpa penyaringan ini seluruh
    // percakapan tersimpan atas nama akun sendiri dan menumpuk jadi satu baris.
    const lawan = (pct.peserta ?? []).find(p => p.id !== akun)
    if (!lawan) continue

    const isi = await isiPercakapan(cfg.ig_msg_token, pct.id)
    if (!isi.ok) continue

    const percakapanDb = await db.conversation.upsert({
      where: { tenant_slug_channel_channel_user_id: {
        tenant_slug: slug, channel: 'IG', channel_user_id: lawan.id } },
      create: {
        tenant_slug: slug, channel: 'IG', channel_user_id: lawan.id,
        channel_user_name: lawan.username,
        last_message_at: new Date(pct.diperbaruiPada ?? Date.now()),
      },
      // Nama ikut disegarkan: orang bisa mengganti username, dan Inbox yang
      // menampilkan nama usang lebih membingungkan daripada menampilkan ID.
      update: {
        channel_user_name: lawan.username ?? undefined,
        last_message_at: new Date(pct.diperbaruiPada ?? Date.now()),
      },
    })
    percakapan++

    for (const m of isi.data.slice(0, MAKS_PESAN)) {
      if (!m.id) continue
      const masuk = m.dari !== akun

      // `external_id` mencegah pesan yang sama tersimpan dua kali ketika webhook
      // dan penarikan terjadwal sama-sama membawanya — dan keduanya memang akan
      // bertemu pada pesan yang sama secara rutin.
      const adaSebelumnya = await db.message.findFirst({
        where:  { external_id: m.id, conversation: { tenant_slug: slug } },
        select: { id: true },
      })

      const isiPesan = {
        direction: (masuk ? 'incoming' : 'outgoing') as 'incoming' | 'outgoing',
        content:   m.teks || '',
        status:    'SENT' as const,
        sent_at:   m.dibuatPada ? new Date(m.dibuatPada) : null,
      }

      if (adaSebelumnya) {
        // Diperbarui, bukan dilewati: teks pesan bisa berubah bila pengirim
        // menyuntingnya, dan Inbox yang menampilkan versi lama menyesatkan.
        await db.message.update({ where: { id: adaSebelumnya.id }, data: isiPesan })
      } else {
        await db.message.create({
          data: {
            conversation_id: percakapanDb.id,
            external_id:     m.id,
            created_at:      m.dibuatPada ? new Date(m.dibuatPada) : undefined,
            ...isiPesan,
          },
        })
        pesanBaru++
      }
    }
  }

  return { percakapan, pesanBaru }
}
