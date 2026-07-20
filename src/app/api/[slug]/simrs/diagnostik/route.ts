import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb, masterDb } from '@/lib/tenant'
import { jalankanDiagnostikSimrs } from '@/lib/simrs-diagnostik'
import { z } from 'zod'

type Ctx = { params: { slug: string } }

const Skema = z.discriminatedUnion('jenis', [
  z.object({ jenis: z.literal('kunjungan'), tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD') }),
  z.object({ jenis: z.literal('pasien'), no_rm: z.string().min(1, 'No. RM wajib diisi') }),
])

// POST /api/[slug]/simrs/diagnostik — jalankan satu uji koneksi ke API SIMRS.
// Hanya endpoint yang SUDAH DIKONFIGURASI tenant yang dipanggil (bukan URL bebas) —
// lihat catatan keamanan di src/lib/simrs-diagnostik.ts.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error, session } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const parsed = Skema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 })
    }

    const db = await getTenantDb(params.slug)
    const parameter = parsed.data.jenis === 'kunjungan'
      ? { tanggal: parsed.data.tanggal }
      : { no_rm: parsed.data.no_rm }

    const hasil = await jalankanDiagnostikSimrs(db, masterDb, params.slug, parsed.data.jenis, parameter, session!.userId)
    return NextResponse.json({ success: true, data: hasil })
  } catch (e) {
    // Pesan dari jalankanDiagnostikSimrs (batas laju, config belum diisi) memang
    // ditujukan dibaca admin apa adanya.
    const pesan = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ success: false, error: pesan }, { status: 400 })
  }
}

// GET /api/[slug]/simrs/diagnostik — riwayat 20 uji terakhir (metadata saja, tidak
// pernah ada data pasien mentah di sini — lihat catatan privasi di modul diagnostik).
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  try {
    const db  = await getTenantDb(params.slug)
    const log = await db.simrsDiagnostikLog.findMany({
      where:   { tenant_slug: params.slug },
      orderBy: { created_at: 'desc' },
      take:    20,
    })

    const idPetugas = Array.from(new Set(log.map(l => l.dilakukan_oleh)))
    const petugas   = await db.appUser.findMany({ where: { id: { in: idPetugas } }, select: { id: true, name: true } })
    const namaById  = new Map(petugas.map(p => [p.id, p.name]))

    return NextResponse.json({
      success: true,
      data: log.map(l => ({ ...l, dilakukan_oleh_nama: namaById.get(l.dilakukan_oleh) ?? '(tidak diketahui)' })),
    })
  } catch (e) {
    console.error('[GET /api/[slug]/simrs/diagnostik]', e)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
