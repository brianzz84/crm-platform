import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'

// GET /api/[slug]/sapaan/log?jenis=ULTAH&page=1
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageSapaan')
  if (error) return error

  const sp    = req.nextUrl.searchParams
  const jenis = sp.get('jenis') as any
  const page  = Math.max(1, parseInt(sp.get('page') || '1'))
  const take  = 25
  const skip  = (page - 1) * take

  const db    = await getTenantDb(params.slug)
  const where = { tenant_slug: params.slug, ...(jenis ? { jenis } : {}) }

  const [total, logs] = await Promise.all([
    db.sapaanLog.count({ where }),
    db.sapaanLog.findMany({
      where,
      orderBy: { sent_at: 'desc' },
      skip, take,
    }),
  ])

  // Ambil nama pasien untuk setiap log
  const personIds = Array.from(new Set(logs.map(l => l.person_id)))
  const persons   = personIds.length
    ? await db.person.findMany({ where: { id: { in: personIds } }, select: { id: true, name: true, no_hp: true } })
    : []
  const personMap = Object.fromEntries(persons.map(p => [p.id, p]))

  const data = logs.map(l => ({
    ...l,
    sent_at:    l.sent_at.toISOString(),
    person_name: personMap[l.person_id]?.name ?? '—',
    person_hp:   personMap[l.person_id]?.no_hp ?? '—',
  }))

  return NextResponse.json({ success: true, data, total, page, totalPages: Math.ceil(total / take) })
}
