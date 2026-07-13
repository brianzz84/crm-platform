/**
 * Worker entry point — jalankan dengan:
 *   npx tsx src/workers/index.ts
 * atau via PM2:
 *   pm2 start ecosystem.config.js
 *
 * Proses ini berjalan terpisah dari Next.js server.
 * Harus ada Redis aktif di REDIS_URL.
 */

import { Worker, Job } from 'bullmq'
import { getRedis, QUEUE_SAPAAN } from '@/lib/queue'
import type { SapaanJobData } from './sapaan.worker'
import { setupScheduler }                    from './scheduler'

async function main() {
  console.log('[worker] Starting CRM worker process...')
  console.log(`[worker] Redis: ${process.env.REDIS_URL || 'redis://localhost:6379'}`)

  // Test Redis connection
  const redis = getRedis()
  await redis.ping()
  console.log('[worker] Redis connected ✓')

  // Daftarkan cron scanner
  await setupScheduler()

  // Buat sapaan worker — handle job biasa + scanner + simrs-sync
  const worker = new Worker<SapaanJobData & { type: string }>(
    QUEUE_SAPAAN,
    async (job: Job) => {
      if (job.name === 'scanner') {
        const { runScanner } = await import('./scheduler')
        return runScanner(job)
      }
      if (job.name === 'simrs-sync') {
        const { syncWithCatchup } = await import('@/lib/simrs-sync')
        const results = await syncWithCatchup(job.data.tenantSlug, job.data.mode ?? 'cron')
        const total_baru   = results.reduce((s, r) => s + r.jumlah_baru, 0)
        const total_update = results.reduce((s, r) => s + r.jumlah_update, 0)
        job.log(`[SIMRS_SYNC] ${results.length} tanggal, ${total_baru} baru, ${total_update} update`)
        return { dates: results.length, total_baru, total_update }
      }
      const { processSapaanJob } = await import('./sapaan.worker') as any
      return processSapaanJob(job)
    },
    {
      connection:  { url: process.env.REDIS_URL || 'redis://localhost:6379' },
      concurrency: 2,
    },
  )

  worker.on('active',    job => console.log(`[worker] Active:    ${job.name} (${job.data.type}) tenant=${job.data.tenantSlug}`))
  worker.on('completed', (job, result) => console.log(`[worker] Completed: ${job.name} (${job.data.type})`, result))
  worker.on('failed',    (job, err)    => console.error(`[worker] Failed:    ${job?.name}`, err.message))
  worker.on('error',     err           => console.error('[worker] Error:', err))

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[worker] SIGTERM received — closing...')
    await worker.close()
    await redis.quit()
    process.exit(0)
  })
  process.on('SIGINT', async () => {
    console.log('[worker] SIGINT received — closing...')
    await worker.close()
    await redis.quit()
    process.exit(0)
  })

  console.log('[worker] Ready — listening for jobs...')
}

main().catch(err => {
  console.error('[worker] Fatal error:', err)
  process.exit(1)
})
