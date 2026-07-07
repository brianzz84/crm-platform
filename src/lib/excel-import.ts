import * as XLSX from 'xlsx'
import { PrismaClient } from '@/generated/prisma/client'
import { ExcelImportRow, ImportRowError } from '@/types'

export interface ImportResult {
  totalRows:      number
  processedRows:  number
  newPersons:     number
  updatedPersons: number
  newVisits:      number
  skippedRows:    number
  errors:         ImportRowError[]
}

// Kolom wajib
const REQUIRED_COLS = ['nama', 'no_hp']

// Normalisasi no_hp → format 08xxx (strip +62, spasi, tanda baca)
function normalizePhone(raw: string): string {
  const s = String(raw).replace(/\s+/g, '').replace(/[^0-9+]/g, '')
  if (s.startsWith('+62')) return '0' + s.slice(3)
  if (s.startsWith('62'))  return '0' + s.slice(2)
  return s
}

// Nama → Title Case, trim spasi berlebih
function normalizeName(raw: string): string {
  return raw.trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

// Email → lowercase, trim
function normalizeEmail(raw: string | null): string | null {
  if (!raw) return null
  const e = raw.trim().toLowerCase()
  return e || null
}

// Parse tanggal dari berbagai format
function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const s = String(raw).trim()

  // Format DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) {
    const [, d, m, y] = dmy
    return new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`)
  }

  // Format YYYY-MM-DD
  const ymd = s.match(/^\d{4}-\d{2}-\d{2}$/)
  if (ymd) return new Date(s)

  // Excel serial number
  const serial = Number(s)
  if (!isNaN(serial) && serial > 1000) {
    const d = XLSX.SSF.parse_date_code(serial)
    if (d) return new Date(d.y, d.m - 1, d.d)
  }

  return null
}

function mapUnit(raw: string | null): 'RAWAT_JALAN' | 'RAWAT_INAP' | 'PENUNJANG' | null {
  if (!raw) return null
  const u = raw.toUpperCase().trim()
  if (u === 'RAWAT_JALAN' || u === 'RAWAT JALAN' || u === 'RJ') return 'RAWAT_JALAN'
  if (u === 'RAWAT_INAP'  || u === 'RAWAT INAP'  || u === 'RI') return 'RAWAT_INAP'
  if (u === 'PENUNJANG'   || u === 'LAB'          || u === 'PJ') return 'PENUNJANG'
  return null
}

export function parseExcelBuffer(buffer: Buffer): ExcelImportRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: '',
  }) as unknown[][]

  if (raw.length < 2) return []

  // Baris pertama = header, normalisasi ke lowercase + underscore
  const headers = (raw[0] as unknown[]).map(h =>
    String(h).toLowerCase().trim().replace(/\s+/g, '_')
  )

  // Validasi kolom wajib
  const missing = REQUIRED_COLS.filter(c => !headers.includes(c))
  if (missing.length) {
    throw new Error(`Kolom wajib tidak ditemukan: ${missing.join(', ')}`)
  }

  const rows: ExcelImportRow[] = []
  for (let i = 1; i < raw.length; i++) {
    const cells = raw[i] as unknown[]
    const get = (col: string) => {
      const idx = headers.indexOf(col)
      return idx >= 0 ? String(cells[idx] || '').trim() : ''
    }

    rows.push({
      no_rm:             get('no_rm')             || null,
      nama:              get('nama'),
      no_hp:             get('no_hp'),
      email:             get('email')             || null,
      tanggal_lahir:     get('tanggal_lahir')     || null,
      unit:              get('unit')              || null,
      poli:              get('poli')              || null,
      dokter:            get('dokter')            || null,
      tanggal_kunjungan: get('tanggal_kunjungan') || null,
      diagnosa_icd:      get('diagnosa_icd')      || null,
      diagnosa_nama:     get('diagnosa_nama')     || null,
      tindakan:          get('tindakan')          || null,
    })
  }

  return rows.filter(r => r.nama || r.no_hp)
}

export async function processImport(
  db: PrismaClient,
  rows: ExcelImportRow[],
  tenantSlug: string,
  createdBy: string,
  logId: string,
): Promise<ImportResult> {
  const result: ImportResult = {
    totalRows:      rows.length,
    processedRows:  0,
    newPersons:     0,
    updatedPersons: 0,
    newVisits:      0,
    skippedRows:    0,
    errors:         [],
  }

  // Deduplikasi dalam file: no_hp sama → pakai baris terakhir, catat baris yang dilewati
  const seenPhones = new Map<string, number>() // normalizedPhone → rowNum terakhir
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i].no_hp
    if (raw) seenPhones.set(normalizePhone(raw), i + 2)
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2

    try {
      // Validasi baris
      if (!row.nama) {
        result.errors.push({ row: rowNum, noHp: row.no_hp, alasan: 'Kolom nama kosong' })
        result.skippedRows++
        continue
      }
      if (!row.no_hp) {
        result.errors.push({ row: rowNum, noHp: null, alasan: 'Kolom no_hp kosong' })
        result.skippedRows++
        continue
      }

      const noHp = normalizePhone(row.no_hp)

      // Lewati baris duplikat dalam file — hanya proses baris terakhir
      if (seenPhones.get(noHp) !== rowNum) {
        result.errors.push({ row: rowNum, noHp: row.no_hp, alasan: `Duplikat dalam file — no_hp ${noHp} sudah ada di baris ${seenPhones.get(noHp)}, baris ini dilewati` })
        result.skippedRows++
        continue
      }
      if (noHp.length < 9 || noHp.length > 15) {
        result.errors.push({ row: rowNum, noHp: row.no_hp, alasan: `Format no_hp tidak valid: ${row.no_hp}` })
        result.skippedRows++
        continue
      }

      const nama  = normalizeName(row.nama)
      const email = normalizeEmail(row.email)

      // ── Cari person existing via hierarki: nik → no_rm → no_hp via PersonContact ──
      let existing: { id: string; email: string | null; tanggal_lahir: Date | null; no_rm: string | null } | null = null

      // 1. Cek by nik (belum ada di Excel row — placeholder untuk masa depan)
      // 2. Cek by no_rm jika ada
      if (row.no_rm) {
        existing = await db.person.findFirst({
          where: { tenant_slug: tenantSlug, no_rm: row.no_rm },
          select: { id: true, email: true, tanggal_lahir: true, no_rm: true },
        })
      }

      // 3. Fallback: cari by no_hp via PersonContact
      if (!existing) {
        const contact = await db.personContact.findFirst({
          where: { tenant_slug: tenantSlug, nilai: noHp },
          select: { person_id: true },
        })
        if (contact) {
          existing = await db.person.findUnique({
            where: { id: contact.person_id },
            select: { id: true, email: true, tanggal_lahir: true, no_rm: true },
          })
        }
      }

      let personId: string

      if (existing) {
        await db.person.update({
          where: { id: existing.id },
          data: {
            name:          nama,
            email:         email ?? existing.email,
            tanggal_lahir: parseDate(row.tanggal_lahir) ?? existing.tanggal_lahir,
            no_rm:         row.no_rm || existing.no_rm,
            no_hp:         noHp,  // update cache
            updated_at:    new Date(),
          },
        })
        personId = existing.id
        result.updatedPersons++

        if (row.tanggal_kunjungan) {
          await insertVisit(db, personId, row, rowNum, result)
        }
      } else {
        const person = await db.person.create({
          data: {
            tenant_slug:   tenantSlug,
            no_hp:         noHp,
            name:          nama,
            email:         email,
            tanggal_lahir: parseDate(row.tanggal_lahir),
            no_rm:         row.no_rm || null,
            aktif:         true,
          },
        })
        personId = person.id
        result.newPersons++

        if (row.tanggal_kunjungan) {
          await insertVisit(db, personId, row, rowNum, result)
        }
      }

      // ── Upsert PersonContact untuk no_hp ini ──
      await db.personContact.upsert({
        where: { person_id_nilai: { person_id: personId, nilai: noHp } },
        create: {
          person_id:   personId,
          tenant_slug: tenantSlug,
          jenis:       'WA',
          nilai:       noHp,
          is_primary:  true,
          is_wa_aktif: true,
        },
        update: {
          is_primary:  true,
          is_wa_aktif: true,
        },
      })

      result.processedRows++

      // Update progress setiap 50 baris
      if (result.processedRows % 50 === 0) {
        await db.importLog.update({
          where: { id: logId },
          data:  { processed_rows: result.processedRows },
        })
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error tidak diketahui'
      result.errors.push({ row: rowNum, noHp: row.no_hp || null, alasan: msg })
      result.skippedRows++
    }
  }

  return result
}

async function insertVisit(
  db: PrismaClient,
  personId: string,
  row: ExcelImportRow,
  rowNum: number,
  result: ImportResult,
) {
  const tanggal = parseDate(row.tanggal_kunjungan)
  if (!tanggal) return

  const unit = mapUnit(row.unit)

  try {
    await db.simrsVisit.create({
      data: {
        person_id:    personId,
        tanggal,
        unit:         unit ?? 'RAWAT_JALAN',
        poli:         row.poli        || null,
        dokter:       row.dokter      || null,
        diagnosa_icd: row.diagnosa_icd || null,
        diagnosa_nama: row.diagnosa_nama || null,
        tindakan:     row.tindakan   || null,
        aktif:        true,
      },
    })
    result.newVisits++
  } catch {
    // Kunjungan duplikat — lewati tanpa error
  }
}
