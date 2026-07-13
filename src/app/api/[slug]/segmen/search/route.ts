import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { requireTenantPermission } from "@/lib/auth"
import { z } from 'zod'

const schema = z.object({
  // filter tingkat kunjungan (SimrsVisit)
  units:        z.array(z.string()).optional(),
  icdCodes:     z.array(z.string()).optional(),
  periodeAwal:  z.string().optional(),
  periodeAkhir: z.string().optional(),
  poli:         z.string().optional(),
  // filter tingkat pasien (Person)
  tagIds:          z.array(z.string()).optional(),
  jenisPembayaran: z.string().optional(),  // "TUNAI" | "NON_TUNAI"
  nameQuery:       z.string().optional(),
  // pasien yang sengaja dikeluarkan admin (persisten terhadap refresh)
  excludeIds:      z.array(z.string()).optional(),
})

const SELECT_LIMIT = 300  // jumlah baris yang dikembalikan untuk diseleksi/di-exclude

export type SegmenSearchInput = z.infer<typeof schema>

// Bangun personWhere + personIds hasil filter (dipakai search & refresh)
export async function runSegmenSearch(db: any, slug: string, p: SegmenSearchInput) {
  const hasVisitFilter = !!(p.units?.length || p.icdCodes?.length || p.periodeAwal || p.periodeAkhir || p.poli)

  const personWhere: any = { tenant_slug: slug, aktif: true }

  if (p.tagIds?.length) {
    personWhere.tags = { some: { tag_id: { in: p.tagIds }, aktif: true } }
  }
  if (p.jenisPembayaran) {
    personWhere.jenis_pembayaran = p.jenisPembayaran
  }
  if (p.nameQuery?.trim()) {
    const q = p.nameQuery.trim()
    personWhere.OR = [
      { name:  { contains: q, mode: 'insensitive' } },
      { no_hp: { contains: q } },
      { no_rm: { contains: q } },
    ]
  }

  if (hasVisitFilter) {
    const visitWhere: any = { aktif: true, person: { tenant_slug: slug, aktif: true } }
    if (p.units?.length) visitWhere.unit = { in: p.units }
    if (p.icdCodes?.length) {
      visitWhere.OR = [
        { diagnosa_icd: { in: p.icdCodes } },
        ...p.icdCodes.map(code => ({ diagnosa_icd: { startsWith: code } })),
      ]
    }
    if (p.periodeAwal)  visitWhere.tanggal = { ...visitWhere.tanggal, gte: new Date(p.periodeAwal) }
    if (p.periodeAkhir) visitWhere.tanggal = { ...visitWhere.tanggal, lte: new Date(p.periodeAkhir) }
    if (p.poli)         visitWhere.poli = { contains: p.poli, mode: 'insensitive' }

    const matchingVisits = await db.simrsVisit.findMany({
      where: visitWhere,
      select: { person_id: true },
      distinct: ['person_id'],
    })
    personWhere.id = { in: matchingVisits.map((v: any) => v.person_id) }
  }

  // Semua id yang cocok (untuk disimpan sebagai anggota segmen)
  const allMatches = await db.person.findMany({ where: personWhere, select: { id: true } })
  let personIds    = allMatches.map((m: any) => m.id)

  // Buang pasien yang sengaja dikeluarkan admin
  if (p.excludeIds?.length) {
    const ex = new Set(p.excludeIds)
    personIds = personIds.filter((id: string) => !ex.has(id))
  }

  // Baris untuk diseleksi (hingga SELECT_LIMIT)
  const persons = await db.person.findMany({
    where: { id: { in: personIds } },
    select: { id: true, name: true, no_hp: true, no_rm: true },
    orderBy: { name: 'asc' },
    take: SELECT_LIMIT,
  })

  return { persons, total: personIds.length, person_ids: personIds, capped: personIds.length > SELECT_LIMIT }
}

// POST: search pasien berdasarkan filter gabungan di DB lokal
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageSegments')
  if (error) return error

  try {
    const body = await req.json()
    const p    = schema.parse(body)
    const db   = await getTenantDb(params.slug)

    const data = await runSegmenSearch(db, params.slug, p)
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Parameter tidak valid' }, { status: 400 })
    }
    console.error('[POST /api/[slug]/segmen/search]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
