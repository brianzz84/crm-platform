import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { batalkanPenggabungan } from '@/lib/person-merge'
import { z } from 'zod'

type Ctx = { params: { slug: string } }

const Skema = z.object({ merge_log_id: z.string().uuid() })

// POST /api/[slug]/pasien/duplikat/batal — batalkan sebuah penggabungan.
// Hanya baris yang tercatat berpindah yang dikembalikan, jadi data yang sejak awal
// milik penyintas tidak ikut tergeser.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error, session } = await requireTenantPermission(req, params.slug, 'mergePatients')
  if (error) return error

  try {
    const parsed = Skema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.message }, { status: 400 })
    }

    const db = await getTenantDb(params.slug)
    await batalkanPenggabungan(db, {
      tenantSlug: params.slug,
      mergeLogId: parsed.data.merge_log_id,
      olehUserId: session!.userId,
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    const pesan = e instanceof Error ? e.message : 'Server error'
    console.error('[POST /api/[slug]/pasien/duplikat/batal]', e)
    return NextResponse.json({ success: false, error: pesan }, { status: 400 })
  }
}
