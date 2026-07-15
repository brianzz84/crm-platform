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
  tagIds:            z.array(z.string()).optional(),
  jenisPembayaran:   z.string().optional(),  // "TUNAI" | "NON_TUNAI"
  nameQuery:         z.string().optional(),
  pekerjaanContains: z.string().optional(),  // mis. "nakes", "dokter", "perawat"
  usiaMin:           z.number().optional(),  // tahun — dihitung dari tanggal_lahir
  usiaMax:           z.number().optional(),
  alamatContains:    z.string().optional(),  // kata kunci teks bebas — bukan filter wilayah administratif presisi
  kota:              z.string().optional(),  // field terstruktur — cocok kata kunci pada kolom kota
  kecamatan:         z.string().optional(),  // field terstruktur — cocok kata kunci pada kolom kecamatan
  // filter tingkat kegiatan (KegiatanPeserta) — partisipasi event, bukan kunjungan SIMRS
  jenisKegiatan:        z.string().optional(),  // "Seminar" | "Pelatihan" | "Bakti Sosial" | dll
  namaKegiatanContains: z.string().optional(),
  kegiatanTahunMulai:   z.number().optional(),
  kegiatanTahunSelesai: z.number().optional(),
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
  if (p.pekerjaanContains?.trim()) {
    personWhere.pekerjaan = { contains: p.pekerjaanContains.trim(), mode: 'insensitive' }
  }
  if (p.alamatContains?.trim()) {
    personWhere.alamat = { contains: p.alamatContains.trim(), mode: 'insensitive' }
  }
  if (p.kota?.trim()) {
    personWhere.kota = { contains: p.kota.trim(), mode: 'insensitive' }
  }
  if (p.kecamatan?.trim()) {
    personWhere.kecamatan = { contains: p.kecamatan.trim(), mode: 'insensitive' }
  }
  if (p.usiaMin != null) {
    const maxBirthDate = new Date()
    maxBirthDate.setFullYear(maxBirthDate.getFullYear() - p.usiaMin)
    personWhere.tanggal_lahir = { ...personWhere.tanggal_lahir, lte: maxBirthDate }
  }
  if (p.usiaMax != null) {
    const minBirthDate = new Date()
    minBirthDate.setFullYear(minBirthDate.getFullYear() - p.usiaMax - 1)
    personWhere.tanggal_lahir = { ...personWhere.tanggal_lahir, gte: minBirthDate }
  }
  if (p.nameQuery?.trim()) {
    const q = p.nameQuery.trim()
    personWhere.OR = [
      { name:  { contains: q, mode: 'insensitive' } },
      { no_hp: { contains: q } },
      { no_rm: { contains: q } },
    ]
  }

  // Kandidat person_id dari tiap sumber interaksi yang difilter — digabung AND (irisan) di bawah.
  const candidateIdSets: string[][] = []

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
    candidateIdSets.push(matchingVisits.map((v: any) => v.person_id))
  }

  const hasKegiatanFilter = !!(p.jenisKegiatan || p.namaKegiatanContains || p.kegiatanTahunMulai || p.kegiatanTahunSelesai)
  if (hasKegiatanFilter) {
    const kegiatanWhere: any = {}
    if (p.jenisKegiatan)        kegiatanWhere.jenis = { equals: p.jenisKegiatan, mode: 'insensitive' }
    if (p.namaKegiatanContains) kegiatanWhere.nama  = { contains: p.namaKegiatanContains, mode: 'insensitive' }
    if (p.kegiatanTahunMulai || p.kegiatanTahunSelesai) {
      kegiatanWhere.tanggal_mulai = {}
      if (p.kegiatanTahunMulai)   kegiatanWhere.tanggal_mulai.gte = new Date(`${p.kegiatanTahunMulai}-01-01`)
      if (p.kegiatanTahunSelesai) kegiatanWhere.tanggal_mulai.lte = new Date(`${p.kegiatanTahunSelesai}-12-31`)
    }

    const matchingPeserta = await db.kegiatanPeserta.findMany({
      where: { tenant_slug: slug, hadir: true, kegiatan: kegiatanWhere },
      select: { person_id: true },
      distinct: ['person_id'],
    })
    candidateIdSets.push(matchingPeserta.map((m: any) => m.person_id))
  }

  if (candidateIdSets.length > 0) {
    let intersected = candidateIdSets[0]
    for (let i = 1; i < candidateIdSets.length; i++) {
      const set = new Set(candidateIdSets[i])
      intersected = intersected.filter((id: string) => set.has(id))
    }
    personWhere.id = { in: intersected }
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
