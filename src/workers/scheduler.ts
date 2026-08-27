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

        // KONTROL_REMINDER: satu job per horizon (H-3 & H-1) per tenant per hari.
        // Handler membaca tabel SimrsRencanaKontrol; kalau belum ada data yang jatuh
        // di H-3/H-1, job selesai tanpa mengirim apa pun (aman untuk dijalankan rutin).
        if (cfg.jenis === 'KONTROL_REMINDER') {
          const tgl = nowWib.toISOString().slice(0, 10)
          for (const h of ['H-3', 'H-1'] as const) {
            await queue.add('sapaan', {
              type:       'KONTROL_REMINDER',
              tenantSlug: tenant.slug,
              horizon:    h,
            }, {
              jobId: `kontrol-${tenant.slug}-${tgl}-${h}`,
              removeOnComplete: 30,
              removeOnFail:     50,
            })
            enqueued++
          }
          job.log(`[scanner] Enqueue KONTROL_REMINDER (H-3 & H-1) untuk ${tenant.slug}`)
        }

        // VAKSIN_REMINDER: jadwal vaksin (sumber='vaksin'), horizon H-7, H-3, H-1.
        if (cfg.jenis === 'VAKSIN_REMINDER') {
          const tgl = nowWib.toISOString().slice(0, 10)
          for (const h of ['H-7', 'H-3', 'H-1'] as const) {
            await queue.add('sapaan', {
              type:       'VAKSIN_REMINDER',
              tenantSlug: tenant.slug,
              horizon:    h,
            }, {
              jobId: `vaksin-${tenant.slug}-${tgl}-${h}`,
              removeOnComplete: 30,
              removeOnFail:     50,
            })
            enqueued++
          }
          job.log(`[scanner] Enqueue VAKSIN_REMINDER (H-7, H-3 & H-1) untuk ${tenant.slug}`)
        }
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

      // SNAPSHOT KANAL PUBLIK: hanya tenant yang mengaktifkannya sendiri —
      // menarik data Meta/Google untuk tenant yang tidak memakainya hanya
      // menghabiskan kuota API mereka.
      const snap = await db.socialSnapshotConfig.findUnique({
        where: { tenant_slug: tenant.slug },
      })
      // STORY: tiap jam, TIDAK menunggu jam snapshot. Insight story hilang setelah
      // 24 jam dan tidak punya arsip — sekali terlewat, hilang selamanya. Sekali
      // sehari secara teori cukup, tapi umur saat ditangkap jadi acak 1–24 jam
      // sehingga story yang terbit menjelang jadwal selalu tampak paling buruk.
      if (snap?.aktif) {
        await queue.add(
          'medsos-story',
          { type: 'MEDSOS_STORY', tenantSlug: tenant.slug },
          {
            jobId: `medsos-story-${tenant.slug}-${nowWib.toISOString().slice(0, 13)}`,
            attempts: 2,
            backoff: { type: 'fixed', delay: 30_000 },
            removeOnComplete: 5,
            removeOnFail: 10,
          },
        )
        enqueued++
      }

      // DM FACEBOOK: tiap jam. Berbeda dari story, riwayatnya TIDAK hilang — Meta
      // menyimpannya berbulan-bulan. Yang dikejar di sini kesegaran Inbox, bukan
      // penyelamatan data, jadi kegagalan sesaat tidak berakibat permanen.
      if (snap?.aktif) {
        await queue.add(
          'medsos-dm',
          { type: 'MEDSOS_DM', tenantSlug: tenant.slug },
          {
            jobId: `medsos-dm-${tenant.slug}-${nowWib.toISOString().slice(0, 13)}`,
            attempts: 2,
            removeOnComplete: 5,
            removeOnFail: 10,
          },
        )
        enqueued++
      }

      if (snap?.aktif && snap.jam_snapshot === hourWib) {
        const today = nowWib.toISOString().slice(0, 10)
        await queue.add(
          'medsos-snapshot',
          { type: 'MEDSOS_SNAPSHOT', tenantSlug: tenant.slug },
          {
            jobId: `medsos-snapshot-${tenant.slug}-${today}`,
            // Sebagian data hanya ada di jendela sempit dan tidak bisa ditarik
            // ulang besok, jadi kegagalan sesaat wajib dicoba lagi — bukan
            // dibiarkan sampai jadwal berikutnya.
            attempts: 3,
            backoff:  { type: 'exponential', delay: 60_000 },
            removeOnComplete: 20,
            removeOnFail:     30,
          },
        )
        enqueued++
        job.log(`[scanner] Enqueue MEDSOS_SNAPSHOT untuk ${tenant.slug} (jam ${snap.jam_snapshot}:00 WIB)`)

        // Google menumpang jadwal yang sama, tapi berdiri sebagai job TERPISAH:
        // Meta dan Google adalah dua integrasi yang bisa hidup sendiri-sendiri,
        // dan menyatukannya membuat kegagalan Meta ikut menahan Google.
        // Dijalankan hanya bila tenant memang tersambung ke Google.
        const gcfg = await db.googleConfig.findUnique({
          where:  { tenant_slug: tenant.slug },
          select: { aktif: true, refresh_token: true },
        })
        if (gcfg?.aktif && gcfg.refresh_token) {
          await queue.add(
            'google-snapshot',
            { type: 'GOOGLE_SNAPSHOT', tenantSlug: tenant.slug },
            {
              jobId: `google-snapshot-${tenant.slug}-${today}`,
              attempts: 3,
              backoff:  { type: 'exponential', delay: 60_000 },
              removeOnComplete: 20,
              removeOnFail:     30,
            },
          )
          enqueued++
          job.log(`[scanner] Enqueue GOOGLE_SNAPSHOT untuk ${tenant.slug}`)
        }
      }

    } catch (e: any) {
      job.log(`[scanner] Error tenant ${tenant.slug}: ${e.message}`)
    }
  }

  job.log(`[scanner] Selesai — ${enqueued} job di-enqueue`)
  return { enqueued }
}
