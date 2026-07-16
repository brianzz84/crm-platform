import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { sendMetaTemplateMessage } from '@/lib/meta-client'
import { recomputeCampaignCounters } from '@/lib/campaign'
import { resolveTemplateField, type PersonForTemplate } from '@/lib/template-fields'
import { BROADCAST_BATCH_SIZE, BROADCAST_DELAY_MS } from '@/constants'

type Ctx = { params: { slug: string; id: string } }

// POST /api/[slug]/broadcast/[id]/send — mulai kirim campaign
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error, session } = await requireTenantPermission(req, params.slug, 'manageBroadcast')
  if (error) return error

  try {
    const db       = await getTenantDb(params.slug)
    const campaign = await db.campaign.findFirst({
      where:   { id: params.id, tenant_slug: params.slug },
      include: { template: true, segment: true },
    })
    if (!campaign) return NextResponse.json({ error: 'Campaign tidak ditemukan' }, { status: 404 })
    if (campaign.status === 'RUNNING') return NextResponse.json({ error: 'Campaign sedang berjalan' }, { status: 409 })
    if (!campaign.segment_id)          return NextResponse.json({ error: 'Segmen belum dipilih' }, { status: 400 })
    if (!campaign.template_id)         return NextResponse.json({ error: 'Template belum dipilih' }, { status: 400 })

    // Mode kirim ulang: campaign DONE/FAILED → reset recipient yang GAGAL ke PENDING
    const isResend = campaign.status === 'DONE' || campaign.status === 'FAILED'
    if (isResend) {
      await db.campaignRecipient.updateMany({
        where: { campaign_id: params.id, status: 'FAILED' },
        data:  { status: 'PENDING', error_code: null, error_detail: null, sent_at: null, wappin_message_id: null },
      })
    }

    // Ambil konfigurasi Meta Cloud API tenant
    const metaCfg = await db.metaConfig.findUnique({ where: { tenant_slug: params.slug } })
    if (!metaCfg || !metaCfg.aktif) {
      return NextResponse.json({ error: 'Konfigurasi Meta WhatsApp belum diatur. Buka Pengaturan > Integrasi Meta.' }, { status: 400 })
    }

    // Set status RUNNING
    await db.campaign.update({
      where: { id: params.id },
      data:  { status: 'RUNNING', started_at: new Date() },
    })

    // Ambil semua anggota segmen yang belum dijadikan recipient
    const segmentPersons = await db.segmentPerson.findMany({
      where:   { segment_id: campaign.segment_id! },
      include: { segment: false },
    })

    // Buat CampaignRecipient rows (bulk, skip duplikat)
    const existingIds = new Set(
      (await db.campaignRecipient.findMany({
        where:  { campaign_id: params.id },
        select: { person_id: true },
      })).map(r => r.person_id)
    )

    const personIds = segmentPersons.map(sp => sp.person_id).filter(id => !existingIds.has(id))
    if (personIds.length > 0) {
      const persons = await db.person.findMany({
        where:  { id: { in: personIds } },
        select: {
          id: true, no_hp: true, name: true,
          contacts: { where: { is_primary: true, is_wa_aktif: true }, take: 1 },
        },
      })
      await db.campaignRecipient.createMany({
        data: persons
          .map(p => ({
            campaign_id: params.id,
            person_id:   p.id,
            no_hp:       p.no_hp ?? p.contacts[0]?.nilai ?? '',
            nama:        p.name,
            status:      'PENDING' as const,
          }))
          .filter(r => r.no_hp),  // skip person tanpa nomor WA
        skipDuplicates: true,
      })
    }

    // Update total_penerima
    const totalPenerima = await db.campaignRecipient.count({ where: { campaign_id: params.id } })
    await db.campaign.update({ where: { id: params.id }, data: { total_penerima: totalPenerima } })

    // Mulai kirim async (fire-and-forget, jangan await)
    sendBatchAsync(params.slug, params.id, metaCfg, campaign.template!, campaign.template_params as any)
      .catch(err => console.error('[broadcast/send] async error:', err))

    return NextResponse.json({ success: true, message: `Campaign dimulai untuk ${totalPenerima} penerima` })
  } catch (e) {
    console.error('[POST /api/[slug]/broadcast/[id]/send]', e)
    // Rollback ke DRAFT jika ada error sebelum kirim
    const db = await getTenantDb(params.slug)
    await db.campaign.update({ where: { id: params.id }, data: { status: 'DRAFT' } }).catch(() => null)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

async function sendBatchAsync(
  slug: string,
  campaignId: string,
  metaCfg: { phone_number_id: string; access_token: string },
  template: any,
  templateParams: Record<string, string>,
) {
  const db = await getTenantDb(slug)

  const recipients = await db.campaignRecipient.findMany({
    where: { campaign_id: campaignId, status: 'PENDING' },
  })

  let terkirim = 0, gagal = 0
  const errorSummary: Record<string, number> = {}

  for (let i = 0; i < recipients.length; i += BROADCAST_BATCH_SIZE) {
    const batch = recipients.slice(i, i + BROADCAST_BATCH_SIZE)

    // Ambil data pasien (+ kunjungan terakhir) untuk variabel dinamis
    const persons = await db.person.findMany({
      where:  { id: { in: batch.map(r => r.person_id) } },
      select: {
        id: true, name: true, no_rm: true, no_hp: true, agama: true, no_bpjs: true,
        // Penjamin diambil dari kunjungan TERAKHIR (bukan cache person) — lebih akurat.
        visits: { where: { aktif: true }, orderBy: { tanggal: 'desc' }, take: 1,
          select: { poli: true, dokter: true, diagnosa_nama: true, tanggal: true,
            jenis_pembayaran: true, nama_instansi: true } },
      },
    })
    const personMap = new Map<string, any>(persons.map(p => [p.id, p]))

    await Promise.all(batch.map(async (r) => {
      try {
        const pRow = personMap.get(r.person_id)
        const lv   = pRow?.visits?.[0] ?? null
        const person: PersonForTemplate = {
          name: r.nama ?? pRow?.name, no_rm: pRow?.no_rm, no_hp: r.no_hp ?? pRow?.no_hp,
          agama: pRow?.agama, no_bpjs: pRow?.no_bpjs,
          jenis_pembayaran: lv?.jenis_pembayaran ?? null,
          nama_instansi: lv?.nama_instansi ?? null,
          lastVisit: lv,
        }
        const components = buildMetaComponents(template, person, templateParams)
        const msgId = await sendMetaTemplateMessage(
          { phone_number_id: metaCfg.phone_number_id, access_token: metaCfg.access_token },
          r.no_hp,
          template.template_name,
          template.template_language || 'id',
          components,
        )
        await db.campaignRecipient.update({
          where: { id: r.id },
          data:  { status: 'SENT', sent_at: new Date(), wappin_message_id: msgId ?? undefined },
        })
        terkirim++
      } catch (err: any) {
        const errCode = err?.message?.slice(0, 80) || 'unknown'
        errorSummary[errCode] = (errorSummary[errCode] || 0) + 1
        await db.campaignRecipient.update({
          where: { id: r.id },
          data:  { status: 'FAILED', error_code: 'meta_error', error_detail: errCode },
        })
        gagal++
      }
    }))

    await recomputeCampaignCounters(db, campaignId)

    if (i + BROADCAST_BATCH_SIZE < recipients.length) {
      await new Promise(res => setTimeout(res, BROADCAST_DELAY_MS))
    }
  }

  await recomputeCampaignCounters(db, campaignId)
  await db.campaign.update({
    where: { id: campaignId },
    data:  { status: 'DONE', finished_at: new Date(), error_summary: errorSummary },
  })
}

function buildMetaComponents(template: any, person: PersonForTemplate, params: Record<string, string>) {
  return (template.components_schema || []).map((comp: any) => ({
    type:       comp.type,
    sub_type:   comp.sub_type,
    index:      comp.index,
    parameters: (comp.parameters || []).map((p: any) => {
      let text: string
      if (p.source === 'field' && p.field) {
        // Variabel dinamis — ambil dari data pasien
        text = resolveTemplateField(person, p.field) || p.example || ''
      } else {
        // Variabel statis — nilai dari campaign, fallback ke contoh
        text = params[p.param_key] ?? p.example ?? ''
      }
      // Kompat lama: template yang masih pakai token literal {{nama}}/{{no_hp}}
      text = text
        .replace(/\{\{nama\}\}/g, person.name ?? '')
        .replace(/\{\{no_hp\}\}/g, person.no_hp ?? '')
      return { type: 'text', text }
    }),
  }))
}
