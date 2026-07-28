import * as XLSX from 'xlsx'
import { PrismaClient } from '@/generated/prisma/client'
import { ExcelImportRow, ImportRowError } from '@/types'
import { normalizePhone } from '@/lib/phone'

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

// Penjamin: terima berbagai tulisan bebas (BPJS, asuransi, umum, cash, dst).
// Mengecek pola NON_TUNAI lebih dulu karena "NON TUNAI" mengandung substring "TUNAI".
function normalizeJenisPembayaran(raw: string | null): 'TUNAI' | 'NON_TUNAI' | null {
  if (!raw?.trim()) return null
  const v = raw.toUpperCase().trim()
  if (/NON|ASURANSI|BPJS|JAMIN|PENJAMIN/.test(v)) return 'NON_TUNAI'
  if (/TUNAI|UMUM|CASH|SENDIRI|PRIBADI/.test(v))  return 'TUNAI'
  return null
}

// "BATAL"/"CANCEL"/"DIBATALKAN" dll → kunjungan tidak disimpan sbg riwayat,
// konsisten dgn ekspektasi kanonik (lihat catatan SimrsVisit.status_kunjungan).
function isBatal(status: string | null): boolean {
  if (!status?.trim()) return false
  const v = status.toUpperCase()
  return v.includes('BATAL') || v.includes('CANCEL')
}

// Tautkan ke pustaka layanan: pakai kode kalau diisi & valid, kalau tidak coba
// cocokkan persis (case-insensitive) dari nama. TIDAK menebak dgn partial match —
// salah tautan disini bisa merusak dasar pencocokan evaluasi campaign.
async function resolveTindakanKode(
  db: PrismaClient, kodeRaw: string | null, namaRaw: string | null,
): Promise<string | null> {
  const kode = kodeRaw?.trim()
  if (kode) {
    const found = await db.simrsLayananLibrary.findFirst({
      where: { kode_barang: kode, aktif: true }, select: { kode_barang: true },
    })
    if (found) return found.kode_barang
  }
  const nama = namaRaw?.trim()
  if (nama) {
    const found = await db.simrsLayananLibrary.findFirst({
      where: { nama: { equals: nama, mode: 'insensitive' }, aktif: true }, select: { kode_barang: true },
    })
    if (found) return found.kode_barang
  }
  return null
}

/**
 * Normalisasi tulisan unit dari Excel ke label kelompok yang dipakai sistem.
 * Menerima singkatan & ejaan lama (termasuk nilai enum sebelum refactor) supaya
 * file impor lama tetap jalan. Nilai di luar daftar dikembalikan apa adanya
 * (rapi-kan kapitalisasinya) — tenant lain bisa punya kelompok sendiri, jadi
 * jangan dibuang jadi null hanya karena tidak dikenal di sini.
 */
function mapUnit(raw: string | null): string | null {
  if (!raw?.trim()) return null
  const u = raw.toUpperCase().trim().replace(/\s+/g, ' ')
  if (u === 'RAWAT_JALAN'  || u === 'RAWAT JALAN' || u === 'RJ') return 'Rawat Jalan'
  if (u === 'RAWAT_INAP'   || u === 'RAWAT INAP'  || u === 'RI') return 'Rawat Inap'
  if (u === 'PENUNJANG'    || u === 'LAB'         || u === 'PJ') return 'Penunjang'
  if (u === 'PONDOK_SEHAT' || u === 'PONDOK SEHAT')              return 'Pondok Sehat'
  if (u === 'ONE_DAY_CARE' || u === 'ONE DAY CARE' || u === 'ODC') return 'One Day Care'
  if (u === 'HOME_CARE'    || u === 'HOME CARE')                 return 'Home Care'
  return raw.trim()
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
      tindakan_kode:     get('tindakan_kode')     || null,
      jenis_pembayaran:  get('jenis_pembayaran')  || null,
      nama_instansi:     get('nama_instansi')     || null,
      status_kunjungan:  get('status_kunjungan')  || null,
    })
  }

  return rows.filter(r => r.nama || r.no_hp)
}

/** Satu baris Excel yang lolos validasi dasar. */
interface BarisValid {
  row:    ExcelImportRow
  rowNum: number   // nomor baris di Excel — baris 1 header, jadi data mulai dari 2
  noHp:   string   // sudah dinormalisasi
}

/** Validasi per baris; yang gagal dicatat sbg error dan tidak diteruskan. */
function validasiBaris(rows: ExcelImportRow[], result: ImportResult): BarisValid[] {
  const valid: BarisValid[] = []

  for (let i = 0; i < rows.length; i++) {
    const row    = rows[i]
    const rowNum = i + 2

    if (!row.nama?.trim()) {
      result.errors.push({ row: rowNum, noHp: row.no_hp || null, alasan: 'Kolom nama kosong' })
      result.skippedRows++
      continue
    }
    if (!row.no_hp?.trim()) {
      result.errors.push({ row: rowNum, noHp: null, alasan: 'Kolom no_hp kosong' })
      result.skippedRows++
      continue
    }

    const noHp = normalizePhone(row.no_hp)
    if (noHp.length < 9 || noHp.length > 15) {
      result.errors.push({ row: rowNum, noHp: row.no_hp, alasan: `Format no_hp tidak valid: ${row.no_hp}` })
      result.skippedRows++
      continue
    }

    valid.push({ row, rowNum, noHp })
  }

  return valid
}

/**
 * Buat/perbarui satu pasien. Hierarki pencocokan: no_rm dulu (paling kuat),
 * lalu no_hp/no_hp_2 di Person — sumber kebenaran tunggal untuk kontak.
 */
async function upsertPerson(
  db: PrismaClient, tenantSlug: string, noHp: string, row: ExcelImportRow,
): Promise<{ id: string; baru: boolean }> {
  const kolom = { id: true, email: true, tanggal_lahir: true, no_rm: true, no_hp: true, no_hp_2: true }

  let existing = row.no_rm
    ? await db.person.findFirst({ where: { tenant_slug: tenantSlug, no_rm: row.no_rm }, select: kolom })
    : null

  if (!existing) {
    existing = await db.person.findFirst({
      where:  { tenant_slug: tenantSlug, OR: [{ no_hp: noHp }, { no_hp_2: noHp }] },
      select: kolom,
    })
  }

  const nama  = normalizeName(row.nama)
  const email = normalizeEmail(row.email)
  const lahir = parseDate(row.tanggal_lahir)

  if (existing) {
    // Kalau nomor ini sudah tersimpan sebagai no_hp_2 (bukan no_hp utama), jangan
    // dipromosikan jadi utama secara diam-diam — biarkan slotnya seperti semula.
    const cocokLewatAlternatif = existing.no_hp !== noHp && existing.no_hp_2 === noHp

    await db.person.update({
      where: { id: existing.id },
      data: {
        name:          nama,
        email:         email ?? existing.email,
        tanggal_lahir: lahir ?? existing.tanggal_lahir,
        no_rm:         row.no_rm || existing.no_rm,
        no_hp:         cocokLewatAlternatif ? undefined : noHp,  // update cache
        // Hanya naik, tidak pernah turun: adanya no_rm membuktikan pasien terdaftar
        // di sistem RS. `sumber` sengaja TIDAK ditimpa — orang yang sudah dikenal
        // lewat SIMRS atau kegiatan jangan diturunkan jadi IMPORT.
        ...(row.no_rm ? { is_pasien_simrs: true } : {}),
        updated_at:    new Date(),
      },
    })
    return { id: existing.id, baru: false }
  }

  const person = await db.person.create({
    data: {
      tenant_slug:     tenantSlug,
      no_hp:           noHp,
      name:            nama,
      email,
      tanggal_lahir:   lahir,
      no_rm:           row.no_rm || null,
      sumber:          'IMPORT',
      is_pasien_simrs: !!row.no_rm,
      aktif:           true,
    },
  })
  return { id: person.id, baru: true }
}

/**
 * Impor dijalankan dalam dua fase yang sengaja dipisah:
 *   Fase 1 — PASIEN: satu penulisan per no_hp unik; kalau datanya berbeda antar
 *            baris, baris TERAKHIR untuk nomor itu yang menang.
 *   Fase 2 — KUNJUNGAN: setiap baris ber-tanggal_kunjungan menjadi satu kunjungan.
 *
 * Pemisahan inilah yang membuat satu pasien boleh punya banyak baris kunjungan —
 * kebutuhan utama backfill riwayat dari RS yang tidak punya API. (Versi lama
 * men-dedup per no_hp lalu membuang semua baris kecuali yang terakhir, sehingga
 * riwayat kunjungan ikut terbuang.)
 */
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

  const valid = validasiBaris(rows, result)

  // Baris terakhir per nomor = sumber data demografi.
  const indeksTerakhir = new Map<string, number>()
  valid.forEach((v, idx) => indeksTerakhir.set(v.noHp, idx))

  // Baris TANPA tanggal_kunjungan yang bukan baris terakhir untuk nomornya tidak
  // menyumbang apa pun: demografinya ditimpa baris sesudahnya dan tidak membawa
  // kunjungan. Dilaporkan supaya admin tahu datanya diabaikan.
  const diproses: BarisValid[] = []
  valid.forEach((v, idx) => {
    if (!v.row.tanggal_kunjungan && indeksTerakhir.get(v.noHp) !== idx) {
      const barisMenang = valid[indeksTerakhir.get(v.noHp)!].rowNum
      result.errors.push({
        row:    v.rowNum,
        noHp:   v.row.no_hp,
        alasan: `Duplikat dalam file — data no_hp ${v.noHp} diambil dari baris ${barisMenang}`,
      })
      result.skippedRows++
      return
    }
    diproses.push(v)
  })

  // ── Fase 1: pasien ──
  const perNomor = new Map<string, BarisValid[]>()
  for (const v of diproses) {
    const arr = perNomor.get(v.noHp)
    if (arr) arr.push(v)
    else perNomor.set(v.noHp, [v])
  }

  const personIdPerNomor = new Map<string, string>()
  for (const [noHp, baris] of perNomor) {
    const sumberData = baris[baris.length - 1]   // baris terakhir menang
    try {
      const { id, baru } = await upsertPerson(db, tenantSlug, noHp, sumberData.row)
      personIdPerNomor.set(noHp, id)
      if (baru) result.newPersons++
      else      result.updatedPersons++
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error tidak diketahui'
      result.errors.push({ row: sumberData.rowNum, noHp: sumberData.row.no_hp, alasan: `Gagal menyimpan pasien: ${msg}` })
      result.skippedRows += baris.length          // seluruh baris nomor ini ikut gagal
    }
  }

  // ── Fase 2: kunjungan ──
  for (const { row, rowNum, noHp } of diproses) {
    const personId = personIdPerNomor.get(noHp)
    if (!personId) continue                       // pasiennya gagal ditulis; sudah dicatat

    try {
      // Kunjungan batal tidak disimpan sebagai riwayat — sejalan dengan jalur SIMRS
      // live, yang mengharapkan baris BATAL sudah difilter sebelum sampai ke sini.
      if (row.tanggal_kunjungan && !isBatal(row.status_kunjungan)) {
        await insertVisit(db, personId, row, result)
      }
      result.processedRows++
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error tidak diketahui'
      result.errors.push({ row: rowNum, noHp: row.no_hp || null, alasan: msg })
      result.skippedRows++
    }

    // Update progress setiap 50 baris
    if (result.processedRows > 0 && result.processedRows % 50 === 0) {
      await db.importLog.update({
        where: { id: logId },
        data:  { processed_rows: result.processedRows },
      })
    }
  }

  // Error dikumpulkan dari beberapa fase, jadi urutannya tidak mengikuti berkas.
  // Diurutkan supaya admin bisa menyusurinya sejajar dengan barisnya di Excel.
  result.errors.sort((a, b) => a.row - b.row)

  return result
}

/**
 * Kunci kunjungan sintetis untuk baris Excel. Tanpa ini `simrs_visit_id` bernilai
 * null, dan unique (person_id, simrs_visit_id) tidak menahan apa pun — Postgres
 * menganggap setiap NULL berbeda, sehingga file yang diunggah dua kali akan
 * menggandakan seluruh riwayat kunjungannya. Prefiks `xls:` menjaga kunci ini
 * tidak mungkin bertabrakan dengan ID asli dari jalur sync API SIMRS.
 *
 * Konsekuensi yang disengaja: dua kunjungan dengan tanggal + poli + tindakan yang
 * persis sama dianggap satu. Ini dicantumkan di sheet Petunjuk pada template.
 */
function kunciKunjunganExcel(tanggal: Date, row: ExcelImportRow, tindakanKode: string | null): string {
  const tgl  = tanggal.toISOString().slice(0, 10)
  const poli = (row.poli || '-').trim().toLowerCase()
  const tind = (tindakanKode || row.tindakan || '-').trim().toLowerCase()
  return `xls:${tgl}:${poli}:${tind}`
}

async function insertVisit(
  db: PrismaClient,
  personId: string,
  row: ExcelImportRow,
  result: ImportResult,
): Promise<void> {
  const tanggal = parseDate(row.tanggal_kunjungan)
  if (!tanggal) return

  const tindakanKode = await resolveTindakanKode(db, row.tindakan_kode, row.tindakan)

  try {
    await db.simrsVisit.create({
      data: {
        person_id:        personId,
        tanggal,
        unit:             mapUnit(row.unit) ?? 'Rawat Jalan',
        poli:             row.poli             || null,
        dokter:           row.dokter           || null,
        diagnosa_icd:     row.diagnosa_icd     || null,
        diagnosa_nama:    row.diagnosa_nama    || null,
        tindakan:         row.tindakan         || null,
        tindakan_kode:    tindakanKode,
        jenis_pembayaran: normalizeJenisPembayaran(row.jenis_pembayaran),
        nama_instansi:    row.nama_instansi    || null,
        status_kunjungan: row.status_kunjungan || null,
        simrs_visit_id:   kunciKunjunganExcel(tanggal, row, tindakanKode),
        no_rm_sumber:     row.no_rm || null,
        aktif:            true,
      },
    })
    result.newVisits++
  } catch (err: any) {
    // P2002 = unique violation → kunjungan ini sudah pernah diimpor. Sengaja
    // dilewati tanpa error supaya file yang sama boleh diunggah ulang (mis.
    // setelah memperbaiki beberapa baris) tanpa menggandakan riwayat.
    if (err?.code === 'P2002') return
    throw err   // error lain harus terlihat, jangan ditelan diam-diam
  }
}
