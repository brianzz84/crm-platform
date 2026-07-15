import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { parseNlpQuery } from '@/lib/nlp-segmen'
import { z } from 'zod'

const schema = z.object({ query: z.string().min(3) })

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageSegments')
  if (error) return error

  try {
    const body = await req.json()
    const { query } = schema.parse(body)
    const result = await parseNlpQuery(params.slug, query)
    return NextResponse.json({ success: true, data: result })
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Query terlalu pendek' }, { status: 400 })
    }
    if (err?.message?.includes('Pengaturan > AI')) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('[POST /api/[slug]/segmen/nlp]', err)
    return NextResponse.json({ error: 'Gagal memproses query AI' }, { status: 500 })
  }
}
