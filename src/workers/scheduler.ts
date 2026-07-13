/**
 * Scheduler — daftarkan cron jobs BullMQ untuk semua tenant aktif.
 * Dipanggil sekali saat worker boot.
 *
 * Cron schedule (WIB = UTC+7):
 *  - ULTAH:            setiap hari pukul jam_kirim dari SapaanConfig
 *  - KONTROL_REMINDER: setiap hari pukul jam_kirim (H-3 dan H-1)
 *  - HARI_RAYA:        hanya via trigger manual dari admin
 *  - SIMRS_SYNC:       setiap hari pukul simrs_jam_sync dari TenantConfig
 *
 * Karena jam berbeda per tenant, kita gunakan pendekatan:
 * - Satu "scanner" job setiap jam (cron "0 * * * *")
 * - Scanner cek config tiap tenant → tambah job jika sudah waktunya
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

  // Ambil config SIMRS per tenant dari master DB untuk cek jam_sync
  const tenantsWithConfig = await masterDb.tenant.findMany({
    where:  { aktif: true },
    select: { slug: true, config: { select: { simrs_jam_sync: true, simrs_base_url: true } } },
  })

  const simrsJamBySlug = new Map(
    tenantsWithConfig.map(t => [t.slug, t.config?.simrs_jam_sync ?? 0])
  )

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

        // KONTROL_REMINDER: aktif jika data SIMRS sudah tersinkron (jadwal_kontrol tersedia)
        // TODO: aktifkan setelah modul SIMRS live
      }

      // SIMRS SYNC: cek jam sinkronisasi per tenant
      const simrsJam = simrsJamBySlug.get(tenant.slug) ?? 0
      if (hourWib === simrsJam) {
        const today    = nowWib.toISOString().slice(0, 10)
        const syncJobId = `simrs-sync-${tenant.slug}-${today}`
        await queue.add(
          'simrs-sync',
          { type: 'SIMRS_SYNC', tenantSlug: tenant.slug, mode: 'cron' },
          { jobId: syncJobId, removeOnComplete: 20, removeOnFail: 30 },
        )
        enqueued++
        job.log(`[scanner] Enqueue SIMRS_SYNC untuk ${tenant.slug} (jam ${simrsJam}:00 WIB)`)
      }

    } catch (e: any) {
      job.log(`[scanner] Error tenant ${tenant.slug}: ${e.message}`)
    }
  }

  job.log(`[scanner] Selesai — ${enqueued} job di-enqueue`)
  return { enqueued }
}
