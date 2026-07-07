/**
 * Scheduler — daftarkan cron jobs BullMQ untuk semua tenant aktif.
 * Dipanggil sekali saat worker boot.
 *
 * Cron schedule (WIB = UTC+7):
 *  - ULTAH:            setiap hari pukul jam_kirim dari SapaanConfig
 *  - KONTROL_REMINDER: setiap hari pukul jam_kirim (H-3 dan H-1)
 *  - HARI_RAYA:        hanya via trigger manual dari admin
 *
 * Karena jam_kirim berbeda per tenant, kita gunakan pendekatan:
 * - Satu "scanner" job setiap jam (cron "0 * * * *")
 * - Scanner cek SapaanConfig tiap tenant → tambah job jika sudah waktunya
 * - Lebih sederhana dari membuat cron per-tenant dinamis
 */

import { Job } from 'bullmq'
import { getSapaanQueue, getRedis } from '@/lib/queue'
import { masterDb } from '@/lib/tenant'

const SCANNER_JOB_ID = 'sapaan-scanner-hourly'

export async function setupScheduler() {
  const queue = getSapaanQueue()

  // Hapus scanner lama jika ada, lalu buat baru dengan cron terbaru
  await queue.removeRepeatableByKey(`${SCANNER_JOB_ID}:::0 * * * *`)

  // Scanner cron: tiap jam tepat (UTC), akan dieksekusi setiap jam
  await queue.add(
    'scanner',
    { type: 'SCANNER', tenantSlug: '__all__' },
    {
      jobId:  SCANNER_JOB_ID,
      repeat: { pattern: '0 * * * *' },  // tiap jam tepat
      removeOnComplete: 5,
      removeOnFail:     10,
    },
  )

  console.log('[scheduler] Sapaan hourly scanner terdaftar')
}

/**
 * Dieksekusi setiap jam oleh worker.
 * Cek semua tenant: jika jam sekarang = jam_kirim dari config → enqueue job.
 */
export async function runScanner(job: Job) {
  const nowUtc  = new Date()
  const nowWib  = new Date(nowUtc.getTime() + 7 * 3600_000)  // UTC+7
  const hourWib = nowWib.getUTCHours()

  job.log(`[scanner] Jam WIB: ${hourWib}:00`)

  const queue   = getSapaanQueue()
  const tenants = await masterDb.tenant.findMany({
    where:  { aktif: true },
    select: { slug: true },
  })

  let enqueued = 0

  for (const tenant of tenants) {
    try {
      const { getTenantDb } = await import('@/lib/tenant')
      const db  = await getTenantDb(tenant.slug)
      const cfgs = await db.sapaanConfig.findMany({
        where: { tenant_slug: tenant.slug, aktif: true },
      })

      for (const cfg of cfgs) {
        if (cfg.jam_kirim !== hourWib) continue

        // ULTAH: satu job per tenant per hari
        if (cfg.jenis === 'ULTAH') {
          const jobId = `ultah-${tenant.slug}-${nowWib.toISOString().slice(0, 10)}`
          await queue.add('sapaan', {
            type:       'ULTAH',
            tenantSlug: tenant.slug,
          }, {
            jobId,
            removeOnComplete: 30,
            removeOnFail:     50,
          })
          enqueued++
          job.log(`[scanner] Enqueue ULTAH untuk ${tenant.slug}`)
        }

        // KONTROL_REMINDER: PENDING — menunggu integrasi SIMRS.
        // Tidak di-enqueue sampai field jadwal_kontrol tersedia dari SIMRS.
        // if (cfg.jenis === 'KONTROL_REMINDER') { ... }
      }
    } catch (e: any) {
      job.log(`[scanner] Error tenant ${tenant.slug}: ${e.message}`)
    }
  }

  job.log(`[scanner] Selesai — ${enqueued} job di-enqueue`)
  return { enqueued }
}
