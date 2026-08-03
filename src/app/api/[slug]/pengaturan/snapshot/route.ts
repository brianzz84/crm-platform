/**
 * Pengaturan Snapshot Kanal Publik.
 *
 *   GET   — baca konfigurasi + status jalan terakhir + ringkasan isi tabel
 *   PATCH — nyalakan/matikan dan atur jamnya
 *   POST  — jalankan sekarang juga (tanpa menunggu jadwal)
 *
 * POST sengaja dieksekusi LANGSUNG, bukan dititipkan ke antrean: admin yang baru
 * menyalakan fitur ini perlu bukti seketika bahwa datanya masuk. Menitipkannya ke
 * worker membuat kegagalan konfigurasi baru ketahuan esok hari.
 *
 * Guard: configSystem — sama seperti pengaturan integrasi lainnya.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { jalankanSnapshot } from '@/lib/social-snapshot'

type Ctx = { params: { slug: string } }

async function ambilConfig(slug: string) {
  const db = await getTenantDb(slug)
  const cfg = await db.socialSnapshotConfig.upsert({
    where:  { tenant_slug: slug },
    create: { tenant_slug: slug },
    update: {},
  })

  const [barisHarian, jumlahKonten, terlama] = await Promise.all([
    db.socialAccountDaily.count({ where: { tenant_slug: slug } }),
    db.socialContent.count({ where: { tenant_slug: slug } }),
    db.socialAccountDaily.findFirst({
      where: { tenant_slug: slug }, orderBy: { tanggal: 'asc' }, select: { tanggal: true },
    }),
  ])

  return {
    aktif:        cfg.aktif,
    jam_snapshot: cfg.jam_snapshot,
    last_run_at:  cfg.last_run_at,
    last_status:  cfg.last_status,
    last_pesan:   cfg.last_pesan,
    barisHarian,
    jumlahKonten,
    // Sejak kapan riwayat tersimpan — menjawab "laporan triwulan mana yang sudah
    // bisa dibuat otomatis" tanpa admin harus menebak.
    terekamSejak: terlama?.tanggal ?? null,
  }
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error
  try {
    return NextResponse.json({ success: true, data: await ambilConfig(params.slug) })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const body  = await req.json()
    const data: { aktif?: boolean; jam_snapshot?: number } = {}

    if (typeof body.aktif === 'boolean') data.aktif = body.aktif
    if (body.jam_snapshot !== undefined) {
      const jam = Number(body.jam_snapshot)
      if (!Number.isInteger(jam) || jam < 0 || jam > 23) {
        return NextResponse.json({ success: false, error: 'Jam harus 0–23.' }, { status: 400 })
      }
      data.jam_snapshot = jam
    }

    const db = await getTenantDb(params.slug)
    await db.socialSnapshotConfig.upsert({
      where:  { tenant_slug: params.slug },
      create: { tenant_slug: params.slug, ...data },
      update: data,
    })

    return NextResponse.json({ success: true, data: await ambilConfig(params.slug) })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const db = await getTenantDb(params.slug)
    await db.socialSnapshotConfig.upsert({
      where: { tenant_slug: params.slug }, create: { tenant_slug: params.slug }, update: {},
    })

    const hasil = await jalankanSnapshot(params.slug)
    const gagal = hasil.filter(h => h.status === 'gagal')
    const ok    = hasil.filter(h => h.status === 'ok')
    const status = gagal.length === 0 ? 'ok' : ok.length > 0 ? 'sebagian' : 'gagal'

    await db.socialSnapshotConfig.update({
      where: { tenant_slug: params.slug },
      data:  {
        last_run_at: new Date(),
        last_status: status,
        last_pesan:  hasil.map(h => `${h.kanal}: ${h.pesan}`).join(' | ').slice(0, 500),
      },
    })

    return NextResponse.json({ success: true, status, hasil, data: await ambilConfig(params.slug) })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
