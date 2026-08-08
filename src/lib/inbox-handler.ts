/**
 * Shared handler untuk pesan masuk ke inbox — dipakai oleh webhook Wappin & Meta.
 */
import { sendPushToTenant } from './push'
import { cariPersonByNomor } from './person-identity'

/**
 * Payload `referral` dari Meta — hanya ada pada pesan PERTAMA sesudah seseorang
 * mengklik iklan Click-to-WhatsApp. Bentuknya sengaja longgar: Meta menambah
 * field tanpa pengumuman, dan seluruh objeknya disimpan mentah.
 */
export interface ReferralMasuk {
  ctwa_clid?:   string
  source_id?:   string
  source_type?: string
  source_url?:  string
  headline?:    string
  body?:        string
  media_type?:  string
  [k: string]: unknown
}

interface IncomingMessage {
  senderNumber: string
  content:      string
  externalId?:  string
  timestamp?:   Date
  mediaUrl?:    string
  mediaType?:   string   // image | document | video | audio
  referral?:    ReferralMasuk | null
}

export async function handleIncomingMessage(
  db:   any,
  slug: string,
  msg:  IncomingMessage,
) {
  const { senderNumber, content, externalId, timestamp, mediaUrl, mediaType, referral } = msg

  // Pengirim bisa jadi kontak alternatif (mis. orang tua/wali pasien), dan nomornya
  // bisa menempel di baris yang sudah digabungkan ke orang lain. cariPersonByNomor()
  // menangani keduanya: cocokkan ke no_hp ATAU no_hp_2, lalu ikuti rantai penggabungan
  // sampai baris yang bertahan.
  const person = await cariPersonByNomor(db, slug, senderNumber)

  let conversation = await db.conversation.findUnique({
    where: {
      tenant_slug_channel_channel_user_id: {
        tenant_slug:     slug,
        channel:         'WA',
        channel_user_id: senderNumber,
      },
    },
  })

  if (!conversation) {
    conversation = await db.conversation.create({
      data: {
        tenant_slug:     slug,
        person_id:       person?.id ?? null,
        channel:         'WA',
        channel_user_id: senderNumber,
        status:          'OPEN',
        last_message_at: new Date(),
        unread_count:    1,
      },
    })
  } else {
    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        status:          'OPEN',
        last_message_at: new Date(),
        unread_count:    { increment: 1 },
        ...(person && !conversation.person_id ? { person_id: person.id } : {}),
      },
    })
  }

  await db.message.create({
    data: {
      conversation_id:   conversation.id,
      direction:         'incoming',
      content:           content || '',
      media_url:         mediaUrl ?? null,
      media_type:        mediaType ?? null,
      status:            'DELIVERED',
      wappin_message_id: externalId ?? null,
      sent_at:           timestamp ?? new Date(),
    },
  })

  // ── Jejak iklan ────────────────────────────────────────────────────────────
  //
  // Disimpan SEBELUM apa pun yang bisa gagal setelahnya, dan kegagalannya tidak
  // boleh menjatuhkan pemrosesan pesan: percakapan yang tersimpan tanpa jejak
  // iklan masih berguna, sedangkan pesan yang hilang tidak bisa diminta ulang.
  //
  // `externalId` wajib ada — itulah yang menjaga webhook yang dikirim ulang Meta
  // tidak mencatat satu klik berkali-kali lalu melipatgandakan angka konversi.
  if (referral && externalId) {
    try {
      await db.adReferral.upsert({
        where:  { tenant_slug_message_external_id: { tenant_slug: slug, message_external_id: externalId } },
        create: {
          tenant_slug:         slug,
          conversation_id:     conversation.id,
          message_external_id: externalId,
          channel:             'WA',
          ctwa_clid:           referral.ctwa_clid   ?? null,
          source_id:           referral.source_id   ?? null,
          source_type:         referral.source_type ?? null,
          source_url:          referral.source_url  ?? null,
          headline:            referral.headline    ?? null,
          body:                referral.body        ?? null,
          media_type:          referral.media_type  ?? null,
          raw:                 referral as any,
          occurred_at:         timestamp ?? new Date(),
        },
        // Sengaja kosong: baris jejak iklan tidak pernah berubah. Upsert dipakai
        // hanya sebagai penolak duplikat, bukan untuk memutakhirkan apa pun.
        update: {},
      })
      console.log(`[inbox] referral iklan tercatat — clid=${referral.ctwa_clid ? 'ada' : 'kosong'} source=${referral.source_id ?? '-'}`)
    } catch (e) {
      console.error('[inbox] gagal menyimpan referral iklan:', e)
    }
  }

  // Tandai balasan campaign jika ada
  if (externalId) {
    const recipient = await db.campaignRecipient.findFirst({
      where:   { no_hp: senderNumber, status: { in: ['SENT', 'DELIVERED', 'READ'] } },
      orderBy: { sent_at: 'desc' },
    })
    if (recipient) {
      await db.campaignRecipient.update({
        where: { id: recipient.id },
        data:  { replied_at: new Date() },
      })
      await db.campaign.update({
        where: { id: recipient.campaign_id },
        data:  { total_dibalas: { increment: 1 } },
      })
    }
  }

  // Push notification — fire and forget
  const senderName = person?.name || senderNumber
  sendPushToTenant(slug, {
    title: `💬 Pesan dari ${senderName}`,
    body:  content.slice(0, 100),
    url:   `/${slug}/inbox`,
    tag:   `inbox-${conversation.id}-${Date.now()}`,
  }).catch(() => null)
}
