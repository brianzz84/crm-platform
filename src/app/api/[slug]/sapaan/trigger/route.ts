/**
 * POST /api/[slug]/sapaan/trigger
 * Trigger manual pengiriman sapaan — untuk HARI_RAYA atau test ULTAH.
 * Hanya ADMIN_IT yang bisa trigger.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getSapaanQueue } from '@/lib/queue'
import { z } from 'zod'

type Ctx = { params: { slug: string } }

const TriggerSchema = z.object({
  jenis:     z.enum(['ULTAH', 'HARI_RAYA', 'KONTROL_REMINDER', 'VAKSIN_REMINDER']),
  hari_raya: z.string().optional(),  // wajib jika jenis = HARI_RAYA
  horizon:   z.enum(['H-3', 'H-1']).optional(),  // untuk KONTROL_REMINDER
})

export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  const body   = await req.json()
  const parsed = TriggerSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })

  const { jenis, hari_raya, horizon } = parsed.data

  if (jenis === 'HARI_RAYA' && !hari_raya) {
    return NextResponse.json({ error: 'hari_raya wajib diisi untuk jenis HARI_RAYA' }, { status: 400 })
  }

  const queue = getSapaanQueue()
  const jobId = `manual-${jenis}-${params.slug}-${Date.now()}`

  const job = await queue.add('sapaan', {
    type:       jenis,
    tenantSlug: params.slug,
    ...(hari_raya ? { hariRaya: hari_raya } : {}),
    ...(horizon   ? { horizon }             : {}),
  }, {
    jobId,
    removeOnComplete: 10,
    removeOnFail:     10,
  })

  return NextResponse.json({
    success: true,
    jobId:   job.id,
    message: `Job ${jenis} ditambahkan ke antrian`,
  })
}

/**
 * GET /api/[slug]/sapaan/trigger/:jobId — cek status job
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  const jobId = req.nextUrl.searchParams.get('jobId')
  if (!jobId) return NextResponse.json({ error: 'jobId diperlukan' }, { status: 400 })

  const queue = getSapaanQueue()
  const job   = await queue.getJob(jobId)

  if (!job) return NextResponse.json({ error: 'Job tidak ditemukan' }, { status: 404 })

  const state    = await job.getState()
  const progress = job.progress
  const result   = job.returnvalue
  const failedReason = job.failedReason

  return NextResponse.json({
    success: true,
    data: { id: job.id, state, progress, result, failedReason },
  })
}
