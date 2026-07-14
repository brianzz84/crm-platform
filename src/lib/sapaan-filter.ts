/**
 * Filter audiens Sapaan (mis. Ulang Tahun) — grup kondisi dengan AND di dalam grup,
 * OR antar grup (Disjunctive Normal Form). Kosong/null = tidak ada filter, semua lolos.
 */

export type FilterConditionType = 'tag' | 'asal_pasien' | 'keterlibatan'
export type KeterlibatanSumber  = 'SIMRS_VISIT' | 'KEGIATAN'

export interface FilterCondition {
  type: FilterConditionType
  // type: 'tag'
  tagId?: string
  tagName?: string   // disimpan untuk tampilan UI, tidak dipakai saat evaluasi
  // type: 'asal_pasien'
  sumber?: string    // salah satu nilai enum PersonSumber
  // type: 'keterlibatan'
  sumberKeterlibatan?: KeterlibatanSumber[]
  min?: number
  periodeAwal?:  string  // YYYY-MM-DD, opsional
  periodeAkhir?: string
}

export interface FilterGroup {
  conditions: FilterCondition[]
}

/**
 * Evaluasi filter_groups terhadap sekumpulan person, kembalikan id yang lolos.
 * Precompute data yang bisa dibatch (tag, sumber, hitungan all-time); kondisi
 * ber-periode dihitung on-demand (jarang dipakai, aman N+1 untuk subset kecil harian).
 */
export async function filterPersonsBySapaanRules(
  db: any,
  personIds: string[],
  filterGroups: FilterGroup[] | null | undefined,
): Promise<Set<string>> {
  if (!filterGroups || filterGroups.length === 0) return new Set(personIds)
  if (personIds.length === 0) return new Set()

  const tagRows = await db.personTag.findMany({
    where:  { person_id: { in: personIds }, aktif: true },
    select: { person_id: true, tag_id: true },
  })
  const tagsByPerson = new Map<string, Set<string>>()
  for (const r of tagRows) {
    if (!tagsByPerson.has(r.person_id)) tagsByPerson.set(r.person_id, new Set())
    tagsByPerson.get(r.person_id)!.add(r.tag_id)
  }

  const persons = await db.person.findMany({
    where:  { id: { in: personIds } },
    select: { id: true, sumber: true },
  })
  const sumberByPerson = new Map(persons.map((p: any) => [p.id, p.sumber]))

  const visitCounts = await db.simrsVisit.groupBy({
    by:     ['person_id'],
    where:  { person_id: { in: personIds }, aktif: true },
    _count: { _all: true },
  })
  const visitCountByPerson = new Map(visitCounts.map((v: any) => [v.person_id, v._count._all]))

  const kegiatanCounts = await db.kegiatanPeserta.groupBy({
    by:     ['person_id'],
    where:  { person_id: { in: personIds }, hadir: true },
    _count: { _all: true },
  })
  const kegiatanCountByPerson = new Map(kegiatanCounts.map((v: any) => [v.person_id, v._count._all]))

  async function hitungKeterlibatan(personId: string, cond: FilterCondition): Promise<number> {
    const sumberList = cond.sumberKeterlibatan?.length ? cond.sumberKeterlibatan : ['SIMRS_VISIT']
    const hasPeriode = !!(cond.periodeAwal || cond.periodeAkhir)

    if (!hasPeriode) {
      let total = 0
      if (sumberList.includes('SIMRS_VISIT')) total += visitCountByPerson.get(personId) ?? 0
      if (sumberList.includes('KEGIATAN'))    total += kegiatanCountByPerson.get(personId) ?? 0
      return total
    }

    let total = 0
    const range = (from?: string, to?: string) => ({
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to) }   : {}),
    })
    if (sumberList.includes('SIMRS_VISIT')) {
      total += await db.simrsVisit.count({
        where: { person_id: personId, aktif: true, tanggal: range(cond.periodeAwal, cond.periodeAkhir) },
      })
    }
    if (sumberList.includes('KEGIATAN')) {
      total += await db.kegiatanPeserta.count({
        where: {
          person_id: personId, hadir: true,
          kegiatan: { tanggal_mulai: range(cond.periodeAwal, cond.periodeAkhir) },
        },
      })
    }
    return total
  }

  async function cocok(personId: string, cond: FilterCondition): Promise<boolean> {
    if (cond.type === 'tag') {
      return cond.tagId ? (tagsByPerson.get(personId)?.has(cond.tagId) ?? false) : false
    }
    if (cond.type === 'asal_pasien') {
      return cond.sumber ? sumberByPerson.get(personId) === cond.sumber : false
    }
    if (cond.type === 'keterlibatan') {
      return (await hitungKeterlibatan(personId, cond)) >= (cond.min ?? 1)
    }
    return false
  }

  const lolos = new Set<string>()
  for (const personId of personIds) {
    for (const group of filterGroups) {
      if (group.conditions.length === 0) continue
      let semuaCocok = true
      for (const cond of group.conditions) {
        if (!(await cocok(personId, cond))) { semuaCocok = false; break }
      }
      if (semuaCocok) { lolos.add(personId); break } // OR antar grup — cukup satu grup cocok
    }
  }
  return lolos
}
