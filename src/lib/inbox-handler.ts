/**
 * Shared handler untuk pesan masuk ke inbox — dipakai oleh webhook Wappin & Meta.
 */
import { sendPushToTenant } from './push'
import { cariPersonByNomor } from './person-identity'

interface IncomingMessage {
  senderNumber: string
  content:      string
  externalId?:  string
  timestamp?:   Date
  mediaUrl?:    string
  mediaType?:   string   // image | document | video | audio
}

export async function handleIncomingMessage(
  db:   any,
  slug: string,
  msg:  IncomingMessage,
) {
  const { senderNumber, content, externalId, timestamp, mediaUrl, mediaType } = msg

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
