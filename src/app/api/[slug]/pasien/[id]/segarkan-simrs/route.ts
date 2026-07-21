import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb, masterDb } from '@/lib/tenant'
import { getSimrsConfig } from '@/lib/simrs-client'
import { segarkanPersonDariSimrs } from '@/lib/simrs-sync'

type Ctx = { params: { slug: string; id: string } }

// POST /api/[slug]/pasien/[id]/segarkan-simrs — ambil ulang demografi pasien ini dari
// SIMRS (endpoint Pasien by no_rm) secara manual. Pelengkap sinkron berkala 30-hari:
// menangani kasus mendesak / pasien yang belum muncul lagi di feed kunjungan.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewPatients')
  if (error) return error

  try {
    const db = await getTenantDb(params.slug)
    const person = await db.person.findFirst({
      where:  { id: params.id, tenant_slug: params.slug },
      select: { id: true, no_rm: true, digabung_ke_person_id: true },
    })
    if (!person) return NextResponse.json({ success: false, error: 'Pasien tidak ditemukan' }, { status: 404 })
    if (person.digabung_ke_person_id) {
      return NextResponse.json({ success: false, error: 'Pasien ini sudah digabungkan ke pasien lain — segarkan pasien penyintasnya.' }, { status: 400 })
    }
    if (!person.no_rm) {
      return NextResponse.json({ success: false, error: 'Pasien ini belum punya No. RM SIMRS, jadi tidak bisa disegarkan dari SIMRS.' }, { status: 400 })
    }

    const cfg = await getSimrsConfig(masterDb, params.slug)
    if (!cfg) return NextResponse.json({ success: false, error: 'Konfigurasi SIMRS belum diisi.' }, { status: 400 })

    const ok = await segarkanPersonDariSimrs(db, cfg, person.id, person.no_rm)
    if (!ok) return NextResponse.json({ success: false, error: 'SIMRS tidak mengembalikan data untuk No. RM ini.' }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[POST /api/[slug]/pasien/[id]/segarkan-simrs]', e)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
