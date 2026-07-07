import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
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
    if (campaign.status === 'DONE')    return NextResponse.json({ error: 'Campaign sudah selesai' }, { status: 409 })
    if (!campaign.segment_id)          return NextResponse.json({ error: 'Segmen belum dipilih' }, { status: 400 })
    if (!campaign.template_id)         return NextResponse.json({ error: 'Template belum dipilih' }, { status: 400 })

    // Ambil konfigurasi Wappin tenant
    const wappinCfg = await db.wappinConfig.findUnique({ where: { tenant_slug: params.slug } })
    if (!wappinCfg || !wappinCfg.aktif) {
      return NextResponse.json({ error: 'Konfigurasi Wappin belum diatur. Buka Pengaturan > Integrasi Wappin.' }, { status: 400 })
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
    sendBatchAsync(params.slug, params.id, wappinCfg, campaign.template!, campaign.template_params as any)
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
  cfg: any,
  template: any,
  templateParams: Record<string, string>,
) {
  const db = await getTenantDb(slug)

  // Ambil token Wappin
  const token = await getWappinToken(cfg)
  if (!token) {
    await db.campaign.update({ where: { id: campaignId }, data: { status: 'FAILED' } })
    return
  }

  // Ambil semua PENDING recipients
  const recipients = await db.campaignRecipient.findMany({
    where: { campaign_id: campaignId, status: 'PENDING' },
  })

  let terkirim = 0, gagal = 0
  const errorSummary: Record<string, number> = {}

  // Kirim per batch
  for (let i = 0; i < recipients.length; i += BROADCAST_BATCH_SIZE) {
    const batch = recipients.slice(i, i + BROADCAST_BATCH_SIZE)

    await Promise.all(batch.map(async (r) => {
      try {
        const payload = buildWappinPayload(cfg, template, r, templateParams)
        const resp    = await fetch(`${cfg.base_url}${cfg.messages_url}`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body:    JSON.stringify(payload),
        })
        const json = await resp.json().catch(() => ({}))

        if (resp.ok && json.messages?.[0]?.id) {
          // Sukses — simpan wappin_message_id, status SENT
          await db.campaignRecipient.update({
            where: { id: r.id },
            data:  { status: 'SENT', sent_at: new Date(), wappin_message_id: json.messages[0].id },
          })
          terkirim++
        } else {
          // Gagal dari Wappin
          const errCode = String(json.errors?.[0]?.code || 'unknown')
          errorSummary[errCode] = (errorSummary[errCode] || 0) + 1
          await db.campaignRecipient.update({
            where: { id: r.id },
            data:  {
              status:       'FAILED',
              error_code:   errCode,
              error_detail: json.errors?.[0]?.title || 'Unknown error',
            },
          })
          gagal++
        }
      } catch (err) {
        await db.campaignRecipient.update({
          where: { id: r.id },
          data:  { status: 'FAILED', error_code: 'network', error_detail: String(err) },
        })
        errorSummary['network'] = (errorSummary['network'] || 0) + 1
        gagal++
      }
    }))

    // Update counter campaign setelah tiap batch
    await db.campaign.update({
      where: { id: campaignId },
      data:  { total_terkirim: terkirim, total_gagal: gagal },
    })

    // Delay antar batch (rate limiting)
    if (i + BROADCAST_BATCH_SIZE < recipients.length) {
      await new Promise(res => setTimeout(res, BROADCAST_DELAY_MS))
    }
  }

  // Selesai
  await db.campaign.update({
    where: { id: campaignId },
    data:  {
      status:        'DONE',
      finished_at:   new Date(),
      total_terkirim: terkirim,
      total_gagal:   gagal,
      error_summary: errorSummary,
    },
  })
}

async function getWappinToken(cfg: any): Promise<string | null> {
  try {
    const resp = await fetch(`${cfg.base_url}${cfg.login_url}`, {
      method:  'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64'),
        'Content-Type':  'application/json',
      },
    })
    const json = await resp.json()
    return json.users?.[0]?.token || null
  } catch {
    return null
  }
}

function buildWappinPayload(cfg: any, template: any, recipient: any, params: Record<string, string>) {
  // V2 format
  const components = (template.components_schema || []).map((comp: any) => {
    if (comp.type === 'body' && comp.parameters) {
      return {
        ...comp,
        parameters: comp.parameters.map((p: any) => {
          if (p.type === 'text' && p.param_key) {
            return { type: 'text', text: params[p.param_key] || p.text || '' }
          }
          return p
        }),
      }
    }
    return comp
  })

  // Substitusi variabel khusus pasien
  const processedComponents = components.map((comp: any) => ({
    ...comp,
    parameters: comp.parameters?.map((p: any) => ({
      ...p,
      text: typeof p.text === 'string'
        ? p.text.replace('{{nama}}', recipient.nama).replace('{{no_hp}}', recipient.no_hp)
        : p.text,
    })),
  }))

  return {
    to:             recipient.no_hp,
    type:           'template',
    recipient_type: 'individual',
    template: {
      name:       template.template_name,
      namespace:  cfg.namespace || template.template_namespace || '',
      language:   { policy: 'deterministic', code: template.template_language || 'id' },
      components: processedComponents,
    },
  }
}
