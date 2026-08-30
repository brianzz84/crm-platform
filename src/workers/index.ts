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

/**
 * Alamat Redis TANPA kredensial, untuk dicetak ke log.
 *
 * Versi sebelumnya mencetak REDIS_URL apa adanya — lengkap dengan sandinya.
 * Log Railway bisa dibaca siapa pun yang punya akses project, dan gampang
 * tersalin ke tiket, tangkapan layar, atau percakapan dukungan. Yang berguna
 * dari baris log itu cuma satu: worker menyambung ke host mana. Sandinya tidak
 * pernah menambah informasi apa pun di sana.
 */
function alamatRedisAman(): string {
  const mentah = process.env.REDIS_URL || 'redis://localhost:6379'
  try {
    const u = new URL(mentah)
    return `${u.protocol}//${u.hostname}:${u.port || '6379'}`
  } catch {
    // URL tak terbaca — jangan pernah jatuh kembali ke mencetak nilai aslinya.
    return '(REDIS_URL tidak valid)'
  }
}

/**
 * Server kesehatan mini.
 *
 * Ada dua alasan, dan yang kedua yang sebenarnya penting:
 *  1. Railway butuh port terbuka untuk healthcheck sebuah service.
 *  2. Selama berbulan-bulan worker ini TIDAK BERJALAN di produksi dan tidak ada
 *     satu pun cara untuk menyadarinya — seluruh pekerjaan terjadwal diam tanpa
 *     ada yang bertanya. Endpoint ini membuat "hidup atau mati" bisa ditanya,
 *     bukan diasumsikan.
 */
function mulaiServerKesehatan(mulaiPada: Date) {
  const port = Number(process.env.PORT || 0)
  if (!port) return

  import('node:http').then(({ createServer }) => {
    createServer((req, res) => {
      const naikDetik = Math.round((Date.now() - mulaiPada.getTime()) / 1000)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        ok: true,
        peran: 'worker',
        mulai_pada: mulaiPada.toISOString(),
        naik_detik: naikDetik,
      }))
    }).listen(port, () => console.log(`[worker] Health server di :${port}`))
  })
}

async function main() {
  const mulaiPada = new Date()
  console.log('[worker] Starting CRM worker process...')
  mulaiServerKesehatan(mulaiPada)
  console.log(`[worker] Redis: ${alamatRedisAman()}`)

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
        const { syncWithCatchup, syncRencanaKontrol } = await import('@/lib/simrs-sync')
        const results = await syncWithCatchup(job.data.tenantSlug, job.data.mode ?? 'cron')
        const total_baru   = results.reduce((s, r) => s + r.jumlah_baru, 0)
        const total_update = results.reduce((s, r) => s + r.jumlah_update, 0)
        // Sync rencana kontrol menyusul (endpoint & pola sync berbeda dari kunjungan).
        const rk = await syncRencanaKontrol(job.data.tenantSlug, job.data.mode ?? 'cron')
        job.log(`[SIMRS_SYNC] ${results.length} tanggal, ${total_baru} baru, ${total_update} update | rencana: ${rk.jumlah_upsert} upsert, ${rk.jumlah_batal} batal${rk.error ? ' ERR: ' + rk.error : ''}`)
        return { dates: results.length, total_baru, total_update, rencana: rk }
      }
      if (job.name === 'simrs-backfill') {
        const { syncTanggal } = await import('@/lib/simrs-sync')
        const { getRedis }    = await import('@/lib/queue')
        const result = await syncTanggal(job.data.tenantSlug, job.data.tanggal, 'backfill')
        job.log(`[SIMRS_BACKFILL] ${job.data.tanggal}: +${result.jumlah_baru} baru, ${result.jumlah_update} update${result.error ? ' ERROR: ' + result.error : ''}`)

        // Update progress counter di Redis
        const redis    = getRedis()
        const stateKey = `crm:backfill:${job.data.tenantSlug}:state`
        const raw      = await redis.get(stateKey)
        if (raw) {
          const state = JSON.parse(raw)
          if (result.error) state.failed++
          else state.done++
          const selesai = state.done + state.failed >= state.total
          if (selesai) {
            state.status     = state.failed > 0 && state.done === 0 ? 'failed' : state.failed > 0 ? 'partial' : 'done'
            state.finishedAt = new Date().toISOString()
          }
          await redis.set(stateKey, JSON.stringify(state), 'EX', 60 * 60 * 24 * 7)
        }

        return result
      }
      if (job.name === 'medsos-dm') {
        const { tarikDmFacebook } = await import('@/lib/meta-dm')
        const hasil = await tarikDmFacebook(job.data.tenantSlug, job.data.sejakHari ?? 7)
        job.log(`[MEDSOS_DM] ${hasil.percakapan} percakapan, ${hasil.pesanBaru} pesan baru${hasil.galat ? ' — ' + hasil.galat : ''}`)
        return hasil
      }

      if (job.name === 'medsos-story') {
        const { tangkapStory } = await import('@/lib/social-snapshot')
        const hasil = await tangkapStory(job.data.tenantSlug)
        job.log(`[MEDSOS_STORY] ${hasil.jumlah} story aktif${hasil.galat ? ' — ' + hasil.galat : ''}`)
        return hasil
      }

      if (job.name === 'medsos-snapshot') {
        const { jalankanSnapshot } = await import('@/lib/social-snapshot')
        const { getTenantDb }      = await import('@/lib/tenant')
        const { catatSnapshotRun } = await import('@/lib/snapshot-run')

        const mulai = Date.now()
        const hasil = await jalankanSnapshot(job.data.tenantSlug)
        const gagal = hasil.filter(h => h.status === 'gagal')
        const ok    = hasil.filter(h => h.status === 'ok')

        // Status disimpan supaya hari yang terlewat terlihat di Pengaturan.
        // Sebagian data medsos tidak bisa ditarik ulang belakangan, jadi celah
        // harus ketahuan hari itu juga — bukan saat menyusun laporan triwulanan.
        const status = gagal.length === 0 ? 'ok' : ok.length > 0 ? 'sebagian' : 'gagal'
        const db = await getTenantDb(job.data.tenantSlug)
        await db.socialSnapshotConfig.update({
          where: { tenant_slug: job.data.tenantSlug },
          data:  {
            last_run_at: new Date(),
            last_status: status,
            last_pesan:  hasil.map(h => `${h.kanal}: ${h.pesan}`).join(' | ').slice(0, 500),
          },
        })

        // Ditulis SEBAGAI TAMBAHAN, bukan pengganti: `SocialSnapshotConfig` di atas
        // masih dipakai panel lama dan tidak diubah perilakunya.
        await catatSnapshotRun(
          job.data.tenantSlug, 'META', status as 'ok' | 'sebagian' | 'gagal',
          hasil.map(h => `${h.kanal}: ${h.pesan}`).join(' | '),
          Date.now() - mulai,
        )

        job.log(`[MEDSOS_SNAPSHOT] ${status} — ${hasil.map(h => `${h.kanal}=${h.status}`).join(', ')}`)
        if (gagal.length && ok.length === 0) throw new Error(gagal.map(g => g.pesan).join('; '))
        return { status, hasil }
      }

      if (job.name === 'instagram-dm') {
        const { tarikDmInstagram } = await import('@/lib/instagram-dm')
        const hasil = await tarikDmInstagram(job.data.tenantSlug, job.data.sejakHari ?? 7)
        job.log(`[INSTAGRAM_DM] ${hasil.percakapan} percakapan, ${hasil.pesanBaru} pesan baru${hasil.galat ? ' — ' + hasil.galat : ''}`)
        return hasil
      }

      if (job.name === 'instagram-token-refresh') {
        const { segarkanTokenTenant } = await import('@/lib/instagram-messaging')
        const hasil = await segarkanTokenTenant(job.data.tenantSlug)
        job.log(`[IG_TOKEN_REFRESH] ${hasil.status} — ${hasil.pesan}`)
        // Hanya kegagalan sungguhan yang dilempar. "belum-waktunya" dan
        // "tidak-ada" adalah keadaan normal, bukan galat yang perlu dicoba ulang.
        if (hasil.status === 'gagal') throw new Error(hasil.pesan)
        return hasil
      }

      if (job.name === 'google-snapshot') {
        const { jalankanSnapshotGoogle } = await import('@/lib/google-snapshot')
        const { catatSnapshotRun }       = await import('@/lib/snapshot-run')

        const mulai = Date.now()
        const hasil = await jalankanSnapshotGoogle(job.data.tenantSlug)
        const gagal = hasil.filter(h => h.status === 'gagal')
        const ok    = hasil.filter(h => h.status === 'ok')
        const status = gagal.length === 0 ? 'ok' : ok.length > 0 ? 'sebagian' : 'gagal'

        // Dicatat sebelum kemungkinan throw di bawah: kegagalan pun harus terlihat
        // di Pengaturan → Penarikan Data, bukan hanya di log BullMQ.
        await catatSnapshotRun(
          job.data.tenantSlug, 'GOOGLE', status,
          hasil.map(h => `${h.lokasi}: ${h.pesan}`).join(' | '),
          Date.now() - mulai,
        )

        job.log(`[GOOGLE_SNAPSHOT] ${status} — ${hasil.map(h => `${h.lokasi}: ${h.pesan}`).join(' | ')}`)

        // Dilempar hanya bila SELURUH lokasi gagal. Satu lokasi bermasalah tidak
        // boleh membuat enam lokasi lain ditarik ulang percuma saat retry.
        if (gagal.length && ok.length === 0) throw new Error(gagal.map(g => g.pesan).join('; '))
        return { status, hasil }
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
