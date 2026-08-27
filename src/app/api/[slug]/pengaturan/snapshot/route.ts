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
import { backfillKonten, jalankanSnapshot } from '@/lib/social-snapshot'
import { tarikDmFacebook } from '@/lib/meta-dm'
import { ringkasRiwayat } from '@/lib/snapshot-run'

type Ctx = { params: { slug: string } }

async function ambilConfig(slug: string) {
  const db = await getTenantDb(slug)
  const cfg = await db.socialSnapshotConfig.upsert({
    where:  { tenant_slug: slug },
    create: { tenant_slug: slug },
    update: {},
  })

  const [barisHarian, jumlahKonten, terlama, sumber, gcfg, barisGbp, ulasanGbp] = await Promise.all([
    db.socialAccountDaily.count({ where: { tenant_slug: slug } }),
    db.socialContent.count({ where: { tenant_slug: slug } }),
    db.socialAccountDaily.findFirst({
      where: { tenant_slug: slug }, orderBy: { tanggal: 'asc' }, select: { tanggal: true },
    }),
    ringkasRiwayat(slug, 30),
    db.googleConfig.findUnique({
      where: { tenant_slug: slug }, select: { aktif: true, refresh_token: true },
    }),
    db.gbpLocationDaily.count({ where: { tenant_slug: slug } }),
    db.gbpReview.count({ where: { tenant_slug: slug } }),
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

    // Per sumber: status terakhir dan hari yang bolong. `last_status` di atas
    // TIDAK dihapus — panel lama masih memakainya — tetapi ia hanya mewakili Meta.
    sumber,
    googleTersambung: !!(gcfg?.aktif && gcfg.refresh_token),
    barisGbp,
    ulasanGbp,
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

    // `mode: 'backfill'` menarik DAFTAR KONTEN jauh ke belakang. Dipisah dari
    // jalan harian karena sifatnya sekali-jalan dan jauh lebih berat.
    const body = await req.json().catch(() => ({}))
    if (body?.mode === 'backfill') {
      const hari = Math.min(400, Math.max(7, Number(body.hari) || 90))
      const hasilBackfill = await backfillKonten(params.slug, hari)
      return NextResponse.json({
        success: true, status: 'ok', hasil: hasilBackfill, data: await ambilConfig(params.slug),
      })
    }

    // Penarikan DM dipisah: sifatnya berbeda dari snapshot angka, dan penarikan
    // riwayat pertama jauh lebih panjang daripada penarikan rutin.
    if (body?.mode === 'dm') {
      const hari = Math.min(400, Math.max(1, Number(body.hari) || 7))
      const dm = await tarikDmFacebook(params.slug, hari)
      return NextResponse.json({ success: !dm.galat, status: dm.galat ? 'gagal' : 'ok', hasil: dm,
        error: dm.galat, data: await ambilConfig(params.slug) })
    }

    // Snapshot Google dipisah dari snapshot Meta, sejalan dengan pemisahannya di
    // scheduler: keduanya integrasi berbeda, dan menjalankan Google tidak boleh
    // menuntut Meta ikut sehat. Jalan PERTAMA jauh lebih berat karena menarik
    // seluruh riwayat ulasan (~33 halaman untuk listing terbesar RKZ).
    // Menarik metrik jauh ke belakang, sekali jalan. Dipisah dari jalan harian
    // karena mendesak dan sekali-pakai: jendela ~18 bulan Google bergeser tiap
    // hari, dan hari yang jatuh keluar hilang untuk selamanya.
    //
    // TIDAK mencatat SnapshotRun: backfill mengisi tanggal LAMA, sementara
    // riwayat itu menjawab "apakah penarikan hari X berjalan". Mencatatnya akan
    // membuat hari ini tampak berhasil padahal tarikan hariannya belum jalan.
    if (body?.mode === 'google-backfill') {
      const { backfillMetrikGoogle } = await import('@/lib/google-snapshot')
      const hari = Math.min(600, Math.max(30, Number(body.hari) || 545))
      const g = await backfillMetrikGoogle(params.slug, hari)
      const gOk = g.filter(h => h.status === 'ok')
      return NextResponse.json({
        success: gOk.length > 0,
        status:  gOk.length === g.length ? 'ok' : gOk.length > 0 ? 'sebagian' : 'gagal',
        hasil:   g,
        data:    await ambilConfig(params.slug),
      })
    }

    if (body?.mode === 'google') {
      const { jalankanSnapshotGoogle } = await import('@/lib/google-snapshot')
      const { catatSnapshotRun }       = await import('@/lib/snapshot-run')

      const mulai  = Date.now()
      const g      = await jalankanSnapshotGoogle(params.slug)
      const gGagal = g.filter(h => h.status === 'gagal')
      const gOk    = g.filter(h => h.status === 'ok')
      const gStatus = gGagal.length === 0 ? 'ok' : gOk.length > 0 ? 'sebagian' : 'gagal'

      // Penarikan manual ikut tercatat: kalau tidak, menjalankannya di hari yang
      // penarikan terjadwalnya gagal akan tetap terlihat sebagai hari bolong.
      await catatSnapshotRun(params.slug, 'GOOGLE', gStatus,
        g.map(h => `${h.lokasi}: ${h.pesan}`).join(' | '), Date.now() - mulai)

      return NextResponse.json({
        success: gOk.length > 0,
        status:  gStatus,
        hasil:   g,
        data:    await ambilConfig(params.slug),
      })
    }

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

    const { catatSnapshotRun } = await import('@/lib/snapshot-run')
    await catatSnapshotRun(params.slug, 'META', status,
      hasil.map(h => `${h.kanal}: ${h.pesan}`).join(' | '))

    return NextResponse.json({ success: true, status, hasil, data: await ambilConfig(params.slug) })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
