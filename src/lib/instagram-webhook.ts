/**
 * Menangani webhook Instagram Messaging.
 *
 * BENTUK PAYLOADNYA BERBEDA dari WhatsApp, dan itulah alasan modul ini ada
 * terpisah alih-alih melonggarkan satu syarat di route webhook:
 *
 *   WhatsApp  → entry[].changes[].value.messages[]
 *   Instagram → entry[].messaging[]  { sender, recipient, message }
 *
 * Menyatukan keduanya di satu perulangan akan menghasilkan kode yang harus
 * menebak bentuk data sebelum membacanya — dan menebak salah berarti pesan
 * pasien hilang tanpa jejak.
 *
 * Yang TIDAK dikerjakan di sini: mengambil nama pengirim. Webhook hanya membawa
 * ID, dan memanggil Graph untuk tiap pesan masuk akan memperlambat jalur yang
 * justru harus cepat. Nama disegarkan oleh penarikan terjadwal di
 * `instagram-dm.ts`, yang memang sudah membaca peserta percakapan.
 */

import { getTenantDb } from './tenant'

interface PesanWebhookIg {
  mid?: string
  text?: string
  is_echo?: boolean
  is_deleted?: boolean
}

interface PeristiwaIg {
  sender?:    { id?: string }
  recipient?: { id?: string }
  timestamp?: number
  message?:   PesanWebhookIg
}

export interface HasilWebhookIg {
  pesanBaru: number
  dilewati:  number
}

export async function tanganiWebhookInstagram(
  slug: string, body: Record<string, unknown>,
): Promise<HasilWebhookIg> {
  const db  = await getTenantDb(slug)
  const cfg = await db.metaConfig.findUnique({ where: { tenant_slug: slug } })

  // Tanpa sambungan atau saat saklarnya mati, peristiwa dibuang diam-diam.
  // Mengembalikan galat hanya akan membuat Meta mencoba ulang tanpa henti.
  if (!cfg?.ig_msg_user_id || !cfg.ig_msg_aktif) return { pesanBaru: 0, dilewati: 0 }

  const akun = String(cfg.ig_msg_user_id)
  let pesanBaru = 0, dilewati = 0

  const entries = (body.entry ?? []) as { messaging?: PeristiwaIg[] }[]

  for (const entry of entries) {
    for (const ev of entry.messaging ?? []) {
      const mid = ev.message?.mid
      if (!mid) { dilewati++; continue }

      // `is_echo` menandai pesan yang KITA kirim, dipantulkan balik oleh Meta.
      // Tetap disimpan — tanpa itu balasan yang dikirim dari aplikasi Instagram
      // tidak akan pernah muncul di Inbox, dan percakapan yang sudah dijawab
      // tampak menggantung.
      const dariKita = ev.message?.is_echo === true || ev.sender?.id === akun

      // Lawan bicara: pada pesan masuk ia pengirim, pada echo ia penerima.
      const lawan = dariKita ? ev.recipient?.id : ev.sender?.id
      if (!lawan || String(lawan) === akun) { dilewati++; continue }

      const teks = ev.message?.text ?? ''
      // Pesan tanpa teks (stiker, foto, reaksi) sengaja tetap dicatat sebagai
      // baris kosong: percakapan yang kehilangan gilirannya lebih menyesatkan
      // daripada baris yang isinya tidak bisa ditampilkan.
      const waktu = ev.timestamp ? new Date(ev.timestamp) : new Date()

      const percakapan = await db.conversation.upsert({
        where: { tenant_slug_channel_channel_user_id: {
          tenant_slug: slug, channel: 'IG', channel_user_id: String(lawan) } },
        create: {
          tenant_slug: slug, channel: 'IG', channel_user_id: String(lawan),
          last_message_at: waktu,
        },
        update: { last_message_at: waktu },
      })

      // Idempotensi lewat `external_id`: webhook dan penarikan terjadwal akan
      // rutin membawa pesan yang sama, dan Meta sendiri mengirim ulang bila
      // belum menerima 200.
      const ada = await db.message.findFirst({
        where:  { external_id: mid, conversation: { tenant_slug: slug } },
        select: { id: true },
      })
      if (ada) { dilewati++; continue }

      await db.message.create({
        data: {
          conversation_id: percakapan.id,
          external_id:     mid,
          direction:       dariKita ? 'outgoing' : 'incoming',
          content:         teks,
          status:          'SENT',
          sent_at:         waktu,
          created_at:      waktu,
        },
      })
      pesanBaru++

      // Penanda belum dibaca hanya untuk pesan MASUK. Menaikkannya pada echo
      // berarti balasan petugas sendiri membuat percakapan tampak perlu dijawab.
      if (!dariKita) {
        await db.conversation.update({
          where: { id: percakapan.id },
          data:  { unread_count: { increment: 1 } },
        })
      }
    }
  }

  return { pesanBaru, dilewati }
}
