import type { PrismaClient } from '../generated/prisma/client'

/**
 * Hitung ulang counter campaign dari status recipient sebenarnya.
 * Menjamin total_terkirim/diterima/dibaca/gagal selalu konsisten
 * (tidak double-count saat webhook mengubah SENT → FAILED, dll).
 *
 * Konvensi stage WhatsApp:
 *   terkirim = pesan diterima Meta & tidak gagal → SENT + DELIVERED + READ
 *   diterima = sampai HP → DELIVERED + READ
 *   dibaca   = READ
 *   gagal    = FAILED
 */
export async function recomputeCampaignCounters(db: PrismaClient, campaignId: string) {
  const grouped = await db.campaignRecipient.groupBy({
    by:     ['status'],
    where:  { campaign_id: campaignId },
    _count: { _all: true },
  })
  const m: Record<string, number> = {}
  for (const g of grouped) m[g.status] = g._count._all

  const sent      = m.SENT      || 0
  const delivered = m.DELIVERED || 0
  const read      = m.READ      || 0
  const failed    = m.FAILED    || 0

  await db.campaign.update({
    where: { id: campaignId },
    data: {
      total_terkirim: sent + delivered + read,
      total_diterima: delivered + read,
      total_dibaca:   read,
      total_gagal:    failed,
    },
  })
}
