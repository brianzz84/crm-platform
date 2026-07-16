import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'

type Ctx = { params: { slug: string } }

/**
 * Endpoint KONSUMSI unit library — untuk mengisi dropdown/filter di halaman
 * yang bukan halaman kelola library (Data Pasien, Buat Segmen).
 *
 * Beda peran dengan GET /api/[slug]/library?tab=unit:
 *   - Sana: view KELOLA (guard icdLibrary/ADMIN_IT), termasuk unit nonaktif,
 *     lengkap dengan warna & urutan untuk diedit.
 *   - Sini: view PAKAI (guard viewPatients/ADMIN_OPS juga), hanya yang aktif.
 * Pemisahan ini disengaja: ADMIN_OPS boleh memfilter pakai unit, tapi tidak
 * boleh mengelola masternya.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewPatients')
  if (error) return error

  try {
    const db = await getTenantDb(params.slug)
    const units = await db.simrsUnitLibrary.findMany({
      where:   { tenant_slug: params.slug, aktif: true },
      select:  { nama: true, kelompok: true, warna: true },
      orderBy: [{ kelompok: 'asc' }, { urutan: 'asc' }, { nama: 'asc' }],
    })

    // Daftar kelompok unik, urut sesuai kemunculan pertama di library
    const kelompok: { nama: string; warna: string }[] = []
    for (const u of units) {
      if (!kelompok.some(k => k.nama === u.kelompok)) {
        kelompok.push({ nama: u.kelompok, warna: u.warna })
      }
    }

    return NextResponse.json({ units, kelompok })
  } catch (e) {
    console.error('[GET /api/[slug]/unit-library]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
