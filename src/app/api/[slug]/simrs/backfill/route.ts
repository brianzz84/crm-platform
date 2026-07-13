import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { getSapaanQueue, getRedis } from '@/lib/queue'
import { z } from 'zod'
import { randomUUID } from 'crypto'

type Ctx = { params: { slug: string } }

const BACKFILL_STATE_TTL = 60 * 60 * 24 * 7  // 7 hari
const MAX_DAYS           = 366
const JOB_DELAY_MS       = 1500  // jeda antar job agar tidak flood SIMRS API

function stateKey(slug: string) {
  return `crm:backfill:${slug}:state`
}

// GET — progress backfill yang sedang/sudah berjalan
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  const redis = getRedis()
  const raw   = await redis.get(stateKey(params.slug))
  if (!raw) return NextResponse.json({ success: true, data: null })

  return NextResponse.json({ success: true, data: JSON.parse(raw) })
}

const BackfillSchema = z.object({
  dari:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal: YYYY-MM-DD'),
  sampai: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal: YYYY-MM-DD'),
})

// POST — mulai backfill range tanggal
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = BackfillSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Input tidak valid' }, { status: 400 })
    }

    const { dari, sampai } = parsed.data
    const dariDate   = new Date(dari)
    const sampaiDate = new Date(sampai)
    const kemarin    = new Date(); kemarin.setDate(kemarin.getDate() - 1); kemarin.setHours(23, 59, 59)

    if (dariDate > sampaiDate) {
      return NextResponse.json({ error: 'Tanggal "dari" harus sebelum "sampai"' }, { status: 400 })
    }
    if (sampaiDate > kemarin) {
      return NextResponse.json({ error: 'Tanggal "sampai" tidak boleh melebihi kemarin' }, { status: 400 })
    }

    // Hitung list tanggal
    const dates: string[] = []
    const cursor = new Date(dariDate)
    while (cursor <= sampaiDate) {
      dates.push(cursor.toISOString().slice(0, 10))
      cursor.setDate(cursor.getDate() + 1)
    }

    if (dates.length > MAX_DAYS) {
      return NextResponse.json({ error: `Maksimal ${MAX_DAYS} hari per backfill` }, { status: 400 })
    }

    // Cek apakah backfill sedang berjalan
    const redis = getRedis()
    const existing = await redis.get(stateKey(params.slug))
    if (existing) {
      const state = JSON.parse(existing)
      if (state.status === 'running') {
        return NextResponse.json({ error: 'Backfill sedang berjalan, tunggu hingga selesai sebelum memulai yang baru' }, { status: 409 })
      }
    }

    // Skip tanggal yang sudah berhasil di-sync
    const db        = await getTenantDb(params.slug)
    const doneLogs  = await db.simrsSyncLog.findMany({
      where:  { tenant_slug: params.slug, status: 'DONE', tanggal_data: { gte: dariDate, lte: sampaiDate } },
      select: { tanggal_data: true },
    })
    const doneSet = new Set(doneLogs.map(l => l.tanggal_data.toISOString().slice(0, 10)))

    const toSync  = dates.filter(d => !doneSet.has(d))
    const skipped = dates.length - toSync.length

    if (toSync.length === 0) {
      return NextResponse.json({
        success: true,
        message: `Semua ${dates.length} tanggal sudah pernah di-sync. Tidak ada yang perlu diulang.`,
        data: { total: 0, skipped },
      })
    }

    // Buat batch ID dan simpan state ke Redis
    const batchId = randomUUID()
    const state = {
      batchId,
      slug:      params.slug,
      dari,
      sampai,
      total:     toSync.length,
      done:      0,
      failed:    0,
      skipped,
      status:    'running',
      startedAt: new Date().toISOString(),
      finishedAt: null as string | null,
    }
    await redis.set(stateKey(params.slug), JSON.stringify(state), 'EX', BACKFILL_STATE_TTL)

    // Enqueue jobs — satu per tanggal dengan delay bertahap
    const queue = getSapaanQueue()
    for (let i = 0; i < toSync.length; i++) {
      const tanggal = toSync[i]
      await queue.add(
        'simrs-backfill',
        { type: 'SIMRS_BACKFILL', tenantSlug: params.slug, tanggal, batchId, mode: 'backfill' },
        {
          jobId:            `simrs-backfill-${params.slug}-${tanggal}`,
          delay:            i * JOB_DELAY_MS,
          removeOnComplete: 50,
          removeOnFail:     50,
        },
      )
    }

    const estimasiMenit = Math.ceil((toSync.length * JOB_DELAY_MS) / 60000)

    return NextResponse.json({
      success: true,
      message: `Backfill dimulai: ${toSync.length} tanggal akan diproses (~${estimasiMenit} menit)`,
      data: { batchId, total: toSync.length, skipped, estimasiMenit },
    })

  } catch (e: any) {
    console.error('[POST /api/[slug]/simrs/backfill]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE — batalkan backfill yang sedang berjalan
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const redis = getRedis()
    const raw   = await redis.get(stateKey(params.slug))
    if (!raw) return NextResponse.json({ error: 'Tidak ada backfill aktif' }, { status: 404 })

    const state = JSON.parse(raw)
    if (state.status !== 'running') {
      return NextResponse.json({ error: 'Backfill sudah selesai' }, { status: 400 })
    }

    // Hapus semua job pending dari queue yang belum dimulai
    const queue  = getSapaanQueue()
    const jobs   = await queue.getJobs(['delayed', 'waiting'])
    const prefix = `simrs-backfill-${params.slug}-`
    let cancelled = 0
    for (const job of jobs) {
      if (job.id?.startsWith(prefix)) {
        await job.remove()
        cancelled++
      }
    }

    // Update state Redis
    state.status     = 'cancelled'
    state.finishedAt = new Date().toISOString()
    await redis.set(stateKey(params.slug), JSON.stringify(state), 'EX', BACKFILL_STATE_TTL)

    return NextResponse.json({ success: true, message: `${cancelled} job dibatalkan` })
  } catch (e: any) {
    console.error('[DELETE /api/[slug]/simrs/backfill]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
