/**
 * Sapaan Worker — proses job pengiriman sapaan otomatis via BullMQ.
 *
 * Job types:
 *  - ULTAH:            kirim ucapan ulang tahun ke pasien yang berulang tahun hari ini
 *  - KONTROL_REMINDER: kirim pengingat kontrol H-3 dan H-1 (butuh data jadwal dari SIMRS)
 *  - HARI_RAYA:        kirim ucapan hari raya ke semua pasien aktif (trigger manual admin)
 */

import { Job } from 'bullmq'
import { QUEUE_SAPAAN } from '@/lib/queue'
import { getTenantDb, masterDb } from '@/lib/tenant'
import { getWappinToken, sendWaMessage } from '@/lib/wappin-client'
import { BUKAN_PERSON_UJI } from '@/lib/test-data-guard'

const DRY_RUN = process.env.SAPAAN_DRY_RUN === 'true'

export interface SapaanJobData {
  type:       'ULTAH' | 'HARI_RAYA' | 'KONTROL_REMINDER'
  tenantSlug: string
  // Untuk HARI_RAYA: nama hari raya (contoh: 'Idul Fitri 1447 H')
  hariRaya?:  string
  // Untuk KONTROL_REMINDER: 'H-3' atau 'H-1'
  horizon?:   'H-3' | 'H-1'
}

export interface SapaanJobResult {
  sent:   number
  failed: number
  skipped: number
}

// ──────────────────────────────────────────────
// Template renderer — substitusi variabel ke teks
// ──────────────────────────────────────────────
function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, val] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, val)
  }
  return result
}

function today(): string {
  return new Date().toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

// ──────────────────────────────────────────────
// Job processor
// ──────────────────────────────────────────────
async function processSapaanJob(job: Job<SapaanJobData>): Promise<SapaanJobResult> {
  const { type, tenantSlug, hariRaya, horizon } = job.data
  // Kolom stempel per-rencana untuk KONTROL_REMINDER — sekaligus sumber idempotency
  // (jadi H-3 dan H-1 dilacak terpisah, tidak saling menutup seperti kalau pakai SapaanLog).
  const kolomReminder = horizon === 'H-1' ? 'reminder_h1_at' as const : 'reminder_h3_at' as const

  const db  = await getTenantDb(tenantSlug)
  const now = new Date()

  // Ambil konfigurasi sapaan jenis ini
  const cfg = await db.sapaanConfig.findUnique({
    where: { tenant_slug_jenis: { tenant_slug: tenantSlug, jenis: type } },
  })

  if (!cfg || !cfg.aktif) {
    job.log(`[${type}] Config tidak aktif atau tidak ditemukan — skip`)
    return { sent: 0, failed: 0, skipped: 0 }
  }

  // Ambil config Wappin (skip jika dry-run)
  let wappinCfg: any = null
  let token: string | null = null

  if (!DRY_RUN) {
    wappinCfg = await db.wappinConfig.findUnique({ where: { tenant_slug: tenantSlug } })
    if (!wappinCfg?.aktif) {
      job.log(`[${type}] Wappin tidak aktif — skip`)
      return { sent: 0, failed: 0, skipped: 0 }
    }
    token = await getWappinToken(wappinCfg as any)
    if (!token) {
      job.log(`[${type}] Gagal login ke Wappin — abort`)
      throw new Error('Gagal mendapatkan token Wappin')
    }
  } else {
    job.log(`[${type}] DRY-RUN mode aktif — pesan tidak dikirim ke Wappin`)
  }

  // Ambil profil klinik untuk variabel {{nama_rs}}
  const profile = await db.tenantProfile.findUnique({ where: { tenant_slug: tenantSlug } })
  const namaRs  = profile?.nama_rs ?? tenantSlug

  let targets: { id: string; name: string; no_hp: string; rencanaId?: string; meta?: Record<string, string> }[] = []

  // ── Kumpulkan target berdasarkan jenis ──
  if (type === 'ULTAH') {
    const todayMd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    // Cari pasien yang tanggal lahirnya bulan-tanggal hari ini
    const persons = await db.person.findMany({
      where: {
        tenant_slug:   tenantSlug,
        aktif:         true,
        tanggal_lahir: { not: null },
        // Pasien dummy punya tanggal lahir juga — tanpa ini cron ultah akan
        // mengirimi mereka. Lihat src/lib/test-data-guard.ts.
        AND: [BUKAN_PERSON_UJI],
      },
    })
    targets = persons
      .filter(p => {
        if (!p.tanggal_lahir) return false
        if (!p.no_hp) return false
        const d  = new Date(p.tanggal_lahir)
        const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        return md === todayMd
      })
      .map(p => ({ id: p.id, name: p.name, no_hp: p.no_hp! }))

    job.log(`[ULTAH] Ditemukan ${targets.length} pasien berulang tahun hari ini`)

  } else if (type === 'HARI_RAYA') {
    // Semua pasien aktif yang punya kontak WA aktif
    const persons = await db.person.findMany({
      where: { tenant_slug: tenantSlug, aktif: true, AND: [BUKAN_PERSON_UJI] },
    })
    targets = persons
      .filter(p => !!p.no_hp)
      .map(p => ({
        id:    p.id,
        name:  p.name,
        no_hp: p.no_hp!,
        meta:  { hari_raya: hariRaya || 'Hari Raya' },
      }))
    job.log(`[HARI_RAYA] Kirim ke ${targets.length} pasien`)

  } else if (type === 'KONTROL_REMINDER') {
    // Rencana kontrol kini dari tabel SimrsRencanaKontrol (jadwal SIMRS, bukan tanggal
    // kunjungan lalu). Kirim pengingat untuk kontrol yang jatuh H-3 atau H-1 dari hari ini.
    const hMundur = horizon === 'H-1' ? 1 : 3
    const target  = new Date(now.getFullYear(), now.getMonth(), now.getDate() + hMundur)
    const targetAkhir = new Date(target.getTime() + 86_400_000)

    const rencanas = await db.simrsRencanaKontrol.findMany({
      where: {
        tenant_slug:     tenantSlug,
        status:          'terjadwal',
        tanggal_rencana: { gte: target, lt: targetAkhir },
        [kolomReminder]: null,   // hanya yang belum diingatkan untuk horizon ini
        person: { aktif: true, AND: [BUKAN_PERSON_UJI] },
      },
      select: { id: true, tanggal_rencana: true, poli: true, unit: true, person: { select: { id: true, name: true, no_hp: true } } },
    })
    targets = rencanas
      .filter(r => !!r.person.no_hp)
      .map(r => ({
        id:        r.person.id,
        name:      r.person.name,
        no_hp:     r.person.no_hp!,
        rencanaId: r.id,
        meta:  {
          horizon:     horizon || 'H-3',
          tgl_kontrol: r.tanggal_rencana.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
          poli:        r.poli || r.unit || '',
        },
      }))
    job.log(`[KONTROL_REMINDER] ${horizon}: ${targets.length} pasien punya kontrol ${hMundur} hari lagi`)
  }

  if (targets.length === 0) {
    return { sent: 0, failed: 0, skipped: 0 }
  }

  // ── Kirim ke semua target ──
  let sent = 0, failed = 0, skipped = 0

  for (const target of targets) {
    // Idempotency. KONTROL_REMINDER dilacak per-rencana lewat kolom reminder_hX_at
    // (sudah difilter null di query, jadi tidak perlu cek lagi di sini). Jenis lain
    // dilacak per-person-per-hari lewat SapaanLog.
    if (type !== 'KONTROL_REMINDER') {
      const alreadySent = await db.sapaanLog.findFirst({
        where: {
          tenant_slug: tenantSlug,
          person_id:   target.id,
          jenis:       type,
          sent_at:     { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
        },
      })
      if (alreadySent) { skipped++; continue }
    }

    // Render template
    const vars: Record<string, string> = {
      nama:     target.name,
      nama_rs:  namaRs,
      hari_ini: today(),
      ...target.meta,
    }
    const pesan = renderTemplate(cfg.template, vars)

    // Kirim via Wappin atau dry-run
    const result = DRY_RUN
      ? (() => { job.log(`[DRY-RUN] → ${target.no_hp}: ${pesan.slice(0, 80)}…`); return { ok: true, message_id: `dry-${Date.now()}` } })()
      : await sendWaMessage(wappinCfg!, token!, target.no_hp, pesan)

    // Log hasil
    await db.sapaanLog.create({
      data: {
        tenant_slug: tenantSlug,
        person_id:   target.id,
        jenis:       type,
        status:      result.ok ? 'SENT' : 'FAILED',
        message_id:  result.message_id,
        error_msg:   result.error ?? null,
        sent_at:     now,
      },
    })

    if (result.ok) {
      sent++
      // Stempel rencana ini sebagai sudah-diingatkan untuk horizon ini. Hanya saat
      // sukses, supaya yang gagal ikut ditarik lagi di run berikutnya.
      if (type === 'KONTROL_REMINDER' && target.rencanaId) {
        await db.simrsRencanaKontrol.update({
          where: { id: target.rencanaId },
          data:  { [kolomReminder]: now },
        })
      }
    } else { failed++ }

    // Rate limit: jeda kecil antar pesan
    await new Promise(r => setTimeout(r, 200))

    // Report progress ke BullMQ
    await job.updateProgress(Math.round(((sent + failed + skipped) / targets.length) * 100))
  }

  job.log(`[${type}] Selesai: ${sent} terkirim, ${failed} gagal, ${skipped} dilewati`)
  return { sent, failed, skipped }
}

// Export processor untuk dipakai oleh worker index
export { processSapaanJob }
