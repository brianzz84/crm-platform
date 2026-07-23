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
import { sendMetaTemplateMessage } from '@/lib/meta-client'
import { buildTemplateComponents, type PersonForTemplate } from '@/lib/template-fields'
import { BUKAN_PERSON_UJI } from '@/lib/test-data-guard'

const DRY_RUN = process.env.SAPAAN_DRY_RUN === 'true'

export interface SapaanJobData {
  type:       'ULTAH' | 'HARI_RAYA' | 'KONTROL_REMINDER' | 'VAKSIN_REMINDER'
  tenantSlug: string
  // Untuk HARI_RAYA: nama hari raya (contoh: 'Idul Fitri 1447 H')
  hariRaya?:  string
  // Untuk KONTROL_REMINDER / VAKSIN_REMINDER: horizon pengingat
  horizon?:   'H-7' | 'H-3' | 'H-1'
}

export interface SapaanJobResult {
  sent:   number
  failed: number
  skipped: number
}

// Person row → data minimal untuk variabel {{field}} template.
function personForTemplate(p: any): PersonForTemplate {
  return {
    name:    p.name,
    no_rm:   p.no_rm ?? null,
    no_hp:   p.no_hp ?? null,
    agama:   p.agama ?? null,
    no_bpjs: p.no_bpjs ?? null,
  }
}

function fmtTglKontrol(d: Date): string {
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// ──────────────────────────────────────────────
// Job processor
// ──────────────────────────────────────────────
async function processSapaanJob(job: Job<SapaanJobData>): Promise<SapaanJobResult> {
  const { type, tenantSlug, hariRaya, horizon } = job.data
  // Kolom stempel per-rencana untuk KONTROL_REMINDER — sekaligus sumber idempotency
  // (jadi H-3 dan H-1 dilacak terpisah, tidak saling menutup seperti kalau pakai SapaanLog).
  const kolomReminder = horizon === 'H-1' ? 'reminder_h1_at' as const
    : horizon === 'H-7' ? 'reminder_h7_at' as const
    : 'reminder_h3_at' as const

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

  // Sapaan proaktif (di luar 24 jam) HARUS pakai template approved Meta.
  if (!cfg.template_id) {
    job.log(`[${type}] Belum ada template approved dipilih — skip`)
    return { sent: 0, failed: 0, skipped: 0 }
  }
  const template = await db.broadcastTemplate.findFirst({
    where: { id: cfg.template_id, tenant_slug: tenantSlug, meta_status: 'APPROVED', aktif: true },
  })
  if (!template) {
    job.log(`[${type}] Template belum approved / tidak ditemukan — skip`)
    return { sent: 0, failed: 0, skipped: 0 }
  }
  const templateParams = (cfg.template_params ?? {}) as Record<string, string>

  // Channel kirim = Meta (template message). Skip jika dry-run.
  let metaCfg: any = null
  if (!DRY_RUN) {
    metaCfg = await db.metaConfig.findUnique({ where: { tenant_slug: tenantSlug } })
    if (!metaCfg?.aktif) {
      job.log(`[${type}] Meta config tidak aktif — skip`)
      return { sent: 0, failed: 0, skipped: 0 }
    }
  } else {
    job.log(`[${type}] DRY-RUN — pesan tidak dikirim ke Meta`)
  }

  // Tiap target bawa data pasien (untuk variabel {{field}}) + extra konteks non-person.
  let targets: { id: string; no_hp: string; person: PersonForTemplate; extra?: Record<string, string>; rencanaId?: string }[] = []

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
      .map(p => ({ id: p.id, no_hp: p.no_hp!, person: personForTemplate(p) }))

    job.log(`[ULTAH] Ditemukan ${targets.length} pasien berulang tahun hari ini`)

  } else if (type === 'HARI_RAYA') {
    // Semua pasien aktif yang punya kontak WA aktif
    const persons = await db.person.findMany({
      where: { tenant_slug: tenantSlug, aktif: true, AND: [BUKAN_PERSON_UJI] },
    })
    targets = persons
      .filter(p => !!p.no_hp)
      .map(p => ({
        id:     p.id,
        no_hp:  p.no_hp!,
        person: personForTemplate(p),
        extra:  { hari_raya: hariRaya || 'Hari Raya' },
      }))
    job.log(`[HARI_RAYA] Kirim ke ${targets.length} pasien`)

  } else if (type === 'KONTROL_REMINDER' || type === 'VAKSIN_REMINDER') {
    // Kontrol & vaksin sama-sama dari tabel SimrsRencanaKontrol (jadwal SIMRS), dipisah
    // lewat kolom `sumber`: baris vaksin ber-sumber='vaksin', kontrol selain itu.
    const isVaksin = type === 'VAKSIN_REMINDER'
    const hMundur  = horizon === 'H-1' ? 1 : horizon === 'H-7' ? 7 : 3
    const target   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + hMundur)
    const targetAkhir = new Date(target.getTime() + 86_400_000)

    const rencanas = await db.simrsRencanaKontrol.findMany({
      where: {
        tenant_slug:     tenantSlug,
        status:          'terjadwal',
        tanggal_rencana: { gte: target, lt: targetAkhir },
        sumber:          isVaksin ? 'vaksin' : { not: 'vaksin' },
        [kolomReminder]: null,   // hanya yang belum diingatkan untuk horizon ini
        person: { aktif: true, AND: [BUKAN_PERSON_UJI] },
      },
      select: {
        id: true, tanggal_rencana: true, poli: true, unit: true, jenis_vaksin: true, keterangan: true,
        person: { select: { id: true, name: true, no_hp: true, no_rm: true, agama: true, no_bpjs: true } },
      },
    })
    targets = rencanas
      .filter(r => !!r.person.no_hp)
      .map(r => ({
        id:        r.person.id,
        no_hp:     r.person.no_hp!,
        person:    personForTemplate(r.person),
        rencanaId: r.id,
        extra: {
          tanggal_kontrol: fmtTglKontrol(r.tanggal_rencana),
          poli_kontrol:    r.poli || r.unit || '',
          ...(isVaksin ? { jenis_vaksin: r.jenis_vaksin || '', catatan_dokter: r.keterangan || '' } : {}),
        },
      }))
    job.log(`[${type}] ${horizon}: ${targets.length} pasien punya jadwal ${hMundur} hari lagi`)
  }

  if (targets.length === 0) {
    return { sent: 0, failed: 0, skipped: 0 }
  }

  // ── Kirim ke semua target ──
  let sent = 0, failed = 0, skipped = 0

  for (const target of targets) {
    // Idempotency. KONTROL/VAKSIN dilacak per-rencana lewat kolom reminder_hX_at
    // (sudah difilter null di query, jadi tidak perlu cek lagi di sini). Jenis lain
    // dilacak per-person-per-hari lewat SapaanLog.
    if (type !== 'KONTROL_REMINDER' && type !== 'VAKSIN_REMINDER') {
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

    // Bangun komponen template Meta (variabel {{field}} dari person + extra konteks).
    const components = buildTemplateComponents(template, target.person, templateParams, target.extra)

    // Kirim via Meta template message (atau dry-run).
    let result: { ok: boolean; message_id?: string; error?: string }
    if (DRY_RUN) {
      job.log(`[DRY-RUN] → ${target.no_hp}: template ${template.template_name}`)
      result = { ok: true, message_id: `dry-${Date.now()}` }
    } else {
      try {
        const msgId = await sendMetaTemplateMessage(
          { phone_number_id: metaCfg.phone_number_id, access_token: metaCfg.access_token },
          target.no_hp,
          template.template_name,
          template.template_language || 'id',
          components,
        )
        result = { ok: true, message_id: msgId ?? undefined }
      } catch (e: any) {
        result = { ok: false, error: (e?.message || 'gagal kirim').slice(0, 200) }
      }
    }

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
      if ((type === 'KONTROL_REMINDER' || type === 'VAKSIN_REMINDER') && target.rencanaId) {
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
