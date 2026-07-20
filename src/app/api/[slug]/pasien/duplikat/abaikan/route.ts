import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { urutkanPasangan } from '@/lib/person-merge'
import { z } from 'zod'

type Ctx = { params: { slug: string } }

const Skema = z.object({
  person_a_id: z.string().uuid(),
  person_b_id: z.string().uuid(),
  alasan:      z.string().optional(),
})

// POST /api/[slug]/pasien/duplikat/abaikan — tandai pasangan ini BUKAN orang yang sama.
// Contoh yang lazim: ibu dan anak yang memakai satu nomor HP.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error, session } = await requireTenantPermission(req, params.slug, 'mergePatients')
  if (error) return error

  try {
    const parsed = Skema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.message }, { status: 400 })
    }
    if (parsed.data.person_a_id === parsed.data.person_b_id) {
      return NextResponse.json({ success: false, error: 'Dua id yang sama' }, { status: 400 })
    }

    // Urutkan supaya (A,B) dan (B,A) tidak tersimpan sebagai dua baris berbeda
    const [a, b] = urutkanPasangan(parsed.data.person_a_id, parsed.data.person_b_id)
    const db = await getTenantDb(params.slug)

    await db.personDuplikatDiabaikan.upsert({
      where: {
        tenant_slug_person_a_id_person_b_id: { tenant_slug: params.slug, person_a_id: a, person_b_id: b },
      },
      update: { alasan: parsed.data.alasan ?? null, oleh: session!.userId },
      create: {
        tenant_slug: params.slug, person_a_id: a, person_b_id: b,
        alasan: parsed.data.alasan ?? null, oleh: session!.userId,
      },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[POST /api/[slug]/pasien/duplikat/abaikan]', e)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
