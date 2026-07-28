import * as XLSX from 'xlsx'
import { PrismaClient } from '@/generated/prisma/client'
import { ExcelImportRow, ExcelRencanaRow, ImportRowError } from '@/types'
import { normalizePhone } from '@/lib/phone'

export interface ImportResult {
  totalRows:      number
  processedRows:  number
  newPersons:     number
  updatedPersons: number
  newVisits:      number
  newRencana:     number
  updatedRencana: number
  skippedRows:    number
  errors:         ImportRowError[]
}

/** Sheet kedua yang OPSIONAL — jadwal kontrol/vaksin yang belum terjadi. */
export const NAMA_SHEET_RENCANA = 'Rencana Kontrol'

// Kolom wajib per sheet
const REQUIRED_COLS         = ['nama', 'no_hp']
const REQUIRED_COLS_RENCANA = ['no_hp', 'tanggal_rencana']


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

/**
 * Baca satu sheet menjadi array objek {header → nilai}. Header dinormalisasi ke
 * lowercase + underscore supaya variasi penulisan di Excel tetap terbaca.
 * Kolom yang tidak ada pada sheet akan bernilai undefined saat diambil.
 */
function bacaSheet(ws: XLSX.WorkSheet | undefined): Record<string, string>[] {
  if (!ws) return []
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
  if (raw.length < 2) return []

  const headers = (raw[0] as unknown[]).map(h =>
    String(h).toLowerCase().trim().replace(/\s+/g, '_')
  )

  const out: Record<string, string>[] = []
  for (let i = 1; i < raw.length; i++) {
    const cells = raw[i] as unknown[]
    const rec: Record<string, string> = {}
    headers.forEach((h, idx) => { rec[h] = String(cells[idx] ?? '').trim() })
    out.push(rec)
  }
  return out
}

export function parseExcelBuffer(buffer: Buffer): ExcelImportRow[] {
  const wb   = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const recs = bacaSheet(wb.Sheets[wb.SheetNames[0]])
  if (recs.length === 0) return []

  const missing = REQUIRED_COLS.filter(c => !(c in recs[0]))
  if (missing.length) {
    throw new Error(`Kolom wajib tidak ditemukan: ${missing.join(', ')}`)
  }

  const rows: ExcelImportRow[] = recs.map(r => ({
    no_rm:             r.no_rm             || null,
    nama:              r.nama              ?? '',
    no_hp:             r.no_hp             ?? '',
    email:             r.email             || null,
    tanggal_lahir:     r.tanggal_lahir     || null,
    unit:              r.unit              || null,
    poli:              r.poli              || null,
    dokter:            r.dokter            || null,
    tanggal_kunjungan: r.tanggal_kunjungan || null,
    diagnosa_icd:      r.diagnosa_icd      || null,
    diagnosa_nama:     r.diagnosa_nama     || null,
    tindakan:          r.tindakan          || null,
    tindakan_kode:     r.tindakan_kode     || null,
    jenis_pembayaran:  r.jenis_pembayaran  || null,
    nama_instansi:     r.nama_instansi     || null,
    status_kunjungan:  r.status_kunjungan  || null,
  }))

  return rows.filter(r => r.nama || r.no_hp)
}

/**
 * Baca sheet "Rencana Kontrol" bila ada. Berkas lama yang hanya punya satu sheet
 * tetap sah — fungsi ini cukup mengembalikan array kosong.
 */
export function parseExcelRencana(buffer: Buffer): ExcelRencanaRow[] {
  const wb   = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const nama = wb.SheetNames.find(n => n.toLowerCase().trim() === NAMA_SHEET_RENCANA.toLowerCase())
  if (!nama) return []

  const recs = bacaSheet(wb.Sheets[nama])
  if (recs.length === 0) return []

  const missing = REQUIRED_COLS_RENCANA.filter(c => !(c in recs[0]))
  if (missing.length) {
    throw new Error(`Sheet "${NAMA_SHEET_RENCANA}" — kolom wajib tidak ditemukan: ${missing.join(', ')}`)
  }

  return recs.map(r => ({
    no_hp:           r.no_hp           ?? '',
    no_rm:           r.no_rm           || null,
    rencana_id:      r.rencana_id      || null,
    tanggal_rencana: r.tanggal_rencana ?? '',
    jenis:           r.jenis           || null,
    poli:            r.poli            || null,
    unit:            r.unit            || null,
    jenis_vaksin:    r.jenis_vaksin    || null,
    keterangan:      r.keterangan      || null,
    status:          r.status          || null,
  })).filter(r => r.no_hp || r.tanggal_rencana)
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
    newRencana:     0,
    updatedRencana: 0,
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

  urutkanError(result.errors)

  return result
}

/**
 * Error dikumpulkan dari beberapa fase dan dua sheet, jadi urutan aslinya tidak
 * mengikuti berkas. Diurutkan (Data Pasien dulu, lalu Rencana Kontrol, masing-masing
 * menurut nomor baris) supaya admin bisa menyusurinya sejajar dengan berkas Excel.
 */
function urutkanError(errors: ImportRowError[]): void {
  const rank = (e: ImportRowError) => (e.sheet === NAMA_SHEET_RENCANA ? 1 : 0)
  errors.sort((a, b) => rank(a) - rank(b) || a.row - b.row)
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

// ──────────────────────────────────────────────
// Rencana kontrol / vaksin — sheet "Rencana Kontrol"
// ──────────────────────────────────────────────

/**
 * `sumber` menentukan cabang pengingat di worker sapaan: bernilai 'vaksin' →
 * Pengingat Vaksin (H-7/H-3/H-1); nilai lain → Pengingat Kontrol (H-3/H-1).
 * Karena itu hanya kata vaksin/imunisasi yang boleh memetakan ke 'vaksin'.
 */
function normalizeSumberRencana(jenis: string | null): string {
  const v = (jenis ?? '').toLowerCase().trim()
  if (!v) return 'rawat_jalan'
  if (v.includes('vaksin') || v.includes('imunisasi')) return 'vaksin'
  if (v.includes('kontrol')) return 'rawat_jalan'
  return v.replace(/\s+/g, '_')   // tenant boleh memakai istilahnya sendiri, mis. "pondok sehat"
}

/** Hanya status 'terjadwal' yang diproses menjadi pengingat oleh worker. */
function normalizeStatusRencana(status: string | null): 'terjadwal' | 'batal' | 'terpenuhi' {
  const v = (status ?? '').toLowerCase().trim()
  if (v.includes('batal') || v.includes('cancel'))                     return 'batal'
  if (v.includes('penuh') || v.includes('selesai') || v.includes('hadir')) return 'terpenuhi'
  return 'terjadwal'
}

/**
 * Cari pasien yang SUDAH ada. Sheet jadwal sengaja tidak boleh membuat pasien
 * baru — ia tidak punya kolom nama, jadi pasien hasil bentukan akan cacat.
 */
async function cariPerson(db: PrismaClient, tenantSlug: string, noHp: string, noRm: string | null) {
  if (noRm) {
    const p = await db.person.findFirst({
      where: { tenant_slug: tenantSlug, no_rm: noRm }, select: { id: true, no_rm: true },
    })
    if (p) return p
  }
  return db.person.findFirst({
    where:  { tenant_slug: tenantSlug, OR: [{ no_hp: noHp }, { no_hp_2: noHp }] },
    select: { id: true, no_rm: true },
  })
}

/**
 * Identitas jadwal. Kalau RS mengisi `rencana_id` (ID jadwal di sistem mereka),
 * itu yang dipakai — jadwalnya bisa digeser tanggalnya lewat impor ulang. Tanpa
 * itu, identitas terpaksa menyertakan tanggal, sehingga mengubah tanggal
 * menghasilkan baris baru dan jadwal lama perlu dibatalkan lewat kolom `status`.
 */
function kunciRencanaExcel(row: ExcelRencanaRow, personId: string, tanggal: Date, sumber: string): string {
  const eksplisit = row.rencana_id?.trim()
  if (eksplisit) return `xls:${eksplisit}`
  const tgl  = tanggal.toISOString().slice(0, 10)
  const poli = (row.poli || '-').trim().toLowerCase()
  return `xls:${personId}:${tgl}:${sumber}:${poli}`
}

/**
 * Impor jadwal kontrol/vaksin. Menambah ke `result` yang sama dengan impor pasien
 * supaya satu berkas menghasilkan satu laporan.
 *
 * BEDA PENTING dari jalur SIMRS live (`syncRencanaKontrol`): di sini TIDAK ada
 * rekonsiliasi. Feed SIMRS mengirim SELURUH jadwal dalam satu jendela waktu,
 * sehingga jadwal yang hilang dari feed boleh disimpulkan batal. Berkas Excel
 * hanyalah potongan sebagian — menyimpulkan hal yang sama akan membatalkan jadwal
 * yang kebetulan tidak diikutkan. Pembatalan di jalur ini harus eksplisit lewat
 * kolom `status`.
 */
export async function processImportRencana(
  db: PrismaClient,
  rows: ExcelRencanaRow[],
  tenantSlug: string,
  result: ImportResult,
): Promise<void> {
  result.totalRows += rows.length

  for (let i = 0; i < rows.length; i++) {
    const row    = rows[i]
    const rowNum = i + 2
    const gagal  = (alasan: string) => {
      result.errors.push({ row: rowNum, noHp: row.no_hp || null, alasan, sheet: NAMA_SHEET_RENCANA })
      result.skippedRows++
    }

    try {
      if (!row.no_hp?.trim()) { gagal('Kolom no_hp kosong'); continue }

      const tanggal = parseDate(row.tanggal_rencana)
      if (!tanggal) { gagal(`tanggal_rencana kosong atau tidak terbaca: ${row.tanggal_rencana || '(kosong)'}`); continue }

      const person = await cariPerson(db, tenantSlug, normalizePhone(row.no_hp), row.no_rm)
      if (!person) { gagal('Pasien belum terdaftar — masukkan dulu lewat sheet "Data Pasien"'); continue }

      const sumber    = normalizeSumberRencana(row.jenis)
      const rencanaId = kunciRencanaExcel(row, person.id, tanggal, sumber)

      const isi = {
        person_id:       person.id,
        no_rm_sumber:    row.no_rm || person.no_rm || '',
        tanggal_rencana: tanggal,
        sumber,
        unit:            row.unit         || null,
        poli:            row.poli         || null,
        jenis_vaksin:    row.jenis_vaksin || null,
        keterangan:      row.keterangan   || null,
        status:          normalizeStatusRencana(row.status),
      }

      const ada = await db.simrsRencanaKontrol.findUnique({
        where:  { tenant_slug_rencana_id_sumber: { tenant_slug: tenantSlug, rencana_id_sumber: rencanaId } },
        select: { id: true, tanggal_rencana: true },
      })

      if (ada) {
        // Jadwal digeser → stempel pengingat lama tidak lagi relevan. Tanpa reset,
        // pengingat untuk tanggal yang baru tidak akan pernah terkirim.
        const tanggalBergeser = ada.tanggal_rencana.getTime() !== tanggal.getTime()
        await db.simrsRencanaKontrol.update({
          where: { id: ada.id },
          data: {
            ...isi,
            last_simrs_sync_at: new Date(),
            ...(tanggalBergeser ? { reminder_h7_at: null, reminder_h3_at: null, reminder_h1_at: null } : {}),
          },
        })
        result.updatedRencana++
      } else {
        await db.simrsRencanaKontrol.create({
          data: { tenant_slug: tenantSlug, rencana_id_sumber: rencanaId, ...isi },
        })
        result.newRencana++
      }
      result.processedRows++

    } catch (err) {
      gagal(err instanceof Error ? err.message : 'Error tidak diketahui')
    }
  }

  urutkanError(result.errors)
}
