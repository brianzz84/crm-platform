import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { gabungkanPerson } from '@/lib/person-merge'
import { z } from 'zod'

type Ctx = { params: { slug: string } }

const Skema = z.object({
  sumber_id: z.string().uuid(),   // dilebur, jadi baris nisan
  tujuan_id: z.string().uuid(),   // bertahan
  alasan:    z.string().min(3),   // wajib — penggabungan harus bisa dipertanggungjawabkan
})

// POST /api/[slug]/pasien/duplikat/gabung — gabungkan dua pasien.
// Selalu dipicu manusia. Bisa dibatalkan lewat /batal.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error, session } = await requireTenantPermission(req, params.slug, 'mergePatients')
  if (error) return error

  try {
    const parsed = Skema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.message }, { status: 400 })
    }

    const db    = await getTenantDb(params.slug)
    const hasil = await gabungkanPerson(db, {
      tenantSlug: params.slug,
      sumberId:   parsed.data.sumber_id,
      tujuanId:   parsed.data.tujuan_id,
      alasan:     parsed.data.alasan,
      olehUserId: session!.userId,
    })

    return NextResponse.json({ success: true, data: hasil })
  } catch (e) {
    // Pesan dari gabungkanPerson() memang ditujukan untuk dibaca petugas
    // (mis. "Person sumber sudah pernah digabungkan"), jadi diteruskan apa adanya.
    const pesan = e instanceof Error ? e.message : 'Server error'
    console.error('[POST /api/[slug]/pasien/duplikat/gabung]', e)
    return NextResponse.json({ success: false, error: pesan }, { status: 400 })
  }
}
