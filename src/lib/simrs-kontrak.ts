/**
 * Dokumentasi kontrak API SIMRS — fitur di dalam aplikasi (Pengaturan > Integrasi
 * SIMRS), bukan file terpisah. Admin IT bisa melihat & menyesuaikan langsung dari UI.
 *
 * Batasan yang sengaja dijaga:
 *
 * 1. NAMA FIELD ikut kode (SimrsKunjungan/SimrsPasien di simrs-client.ts) — daftar
 *    field yang ditampilkan di sini SELALU sama dengan tipe yang sungguhan dipakai
 *    sync, tidak bisa didaftarkan sendiri lewat UI. Kalau field baru ditambahkan ke
 *    kode, otomatis muncul di sini (dengan anotasi kosong, siap diisi).
 *
 * 2. STATUS (Wajib/Penting/Opsional) ikut kode (WAJIB_KUNJUNGAN dkk. di
 *    simrs-diagnostik.ts) — SATU sumber kebenaran yang sama dipakai tools
 *    diagnostik untuk validasi sungguhan. Kalau status bisa diedit bebas di sini
 *    tanpa terhubung ke validator, dokumentasi dan validasi nyata bisa bercerai
 *    tanpa siapa pun sadar.
 *
 * Yang BEBAS diedit Admin IT: contoh nilai & catatan per field, plus tiga bagian
 * lepas (aturan non-fungsional, kesepakatan, pertanyaan terbuka) dan satu blok
 * catatan umum.
 */
import type { PrismaClient } from '../generated/prisma/client'
import {
  WAJIB_KUNJUNGAN, PENTING_KUNJUNGAN, DIKENAL_KUNJUNGAN,
  WAJIB_PASIEN, PENTING_PASIEN, DIKENAL_PASIEN,
} from './simrs-diagnostik'
import {
  SIMRS_PER_PAGE, SIMRS_ENDPOINT_KUNJUNGAN, SIMRS_ENDPOINT_PASIEN,
  type SimrsEndpointSpec,
} from './simrs-client'

export type StatusField = 'wajib' | 'penting' | 'opsional'
export type Bagian = 'non_fungsional' | 'kesepakatan' | 'pertanyaan_terbuka'

export interface FieldKontrak {
  endpoint: 'kunjungan' | 'pasien'
  fieldNama: string
  status: StatusField
  contoh: string | null
  catatan: string | null
}

export interface ItemKontrak {
  id: string
  bagian: Bagian
  judul: string | null
  isi: string
  status: string | null
  urutan: number
}

/** Blok endpoint + contoh respons untuk ditampilkan read-only di dokumentasi.
 * Semuanya diturunkan dari kode (spec endpoint + contoh field) — bukan diedit
 * bebas, supaya tidak pernah menyimpang dari yang sungguhan dipanggil sync. */
export interface EndpointDoc {
  spec: SimrsEndpointSpec
  contohRespons: string   // JSON siap tampil, dibangun dari contoh tiap field
}

export interface KontrakDoc {
  endpointKunjungan: EndpointDoc
  endpointPasien: EndpointDoc
  fieldsKunjungan: FieldKontrak[]
  fieldsPasien: FieldKontrak[]
  nonFungsional: ItemKontrak[]
  kesepakatan: ItemKontrak[]
  pertanyaanTerbuka: ItemKontrak[]
  catatanUmum: string
}

function statusDari(fieldNama: string, wajib: readonly string[], penting: readonly string[]): StatusField {
  if ((wajib as string[]).includes(fieldNama)) return 'wajib'
  if ((penting as string[]).includes(fieldNama)) return 'penting'
  return 'opsional'
}

/**
 * Susun daftar field LENGKAP dari kode (DIKENAL_KUNJUNGAN/DIKENAL_PASIEN), lalu
 * tempeli anotasi dari DB kalau ada. Field yang belum pernah dianotasi tetap
 * muncul (dengan contoh/catatan kosong) — supaya field baru dari kode langsung
 * kelihatan perlu diisi, bukan hilang begitu saja.
 */
export async function ambilKontrakDoc(db: PrismaClient, tenantSlug: string): Promise<KontrakDoc> {
  const [anotasi, items, catatan] = await Promise.all([
    db.simrsKontrakField.findMany({ where: { tenant_slug: tenantSlug } }),
    db.simrsKontrakItem.findMany({ where: { tenant_slug: tenantSlug }, orderBy: { urutan: 'asc' } }),
    db.simrsKontrakCatatan.findUnique({ where: { tenant_slug: tenantSlug } }),
  ])

  const anotasiMap = new Map(anotasi.map(a => [`${a.endpoint}:${a.field_nama}`, a]))

  const susunFields = (
    endpoint: 'kunjungan' | 'pasien',
    dikenal: readonly string[], wajib: readonly string[], penting: readonly string[],
  ): FieldKontrak[] =>
    dikenal.map(fieldNama => {
      const a = anotasiMap.get(`${endpoint}:${fieldNama}`)
      return {
        endpoint, fieldNama,
        status: statusDari(fieldNama, wajib, penting),
        contoh: a?.contoh ?? null,
        catatan: a?.catatan ?? null,
      }
    })

  const keItem = (i: (typeof items)[number]): ItemKontrak => ({
    id: i.id, bagian: i.bagian as Bagian, judul: i.judul, isi: i.isi, status: i.status, urutan: i.urutan,
  })

  const fieldsKunjungan = susunFields('kunjungan', DIKENAL_KUNJUNGAN, WAJIB_KUNJUNGAN, PENTING_KUNJUNGAN)
  const fieldsPasien    = susunFields('pasien', DIKENAL_PASIEN, WAJIB_PASIEN, PENTING_PASIEN)

  return {
    endpointKunjungan: {
      spec: SIMRS_ENDPOINT_KUNJUNGAN,
      contohRespons: JSON.stringify(
        { data: [ contohBaris(fieldsKunjungan) ], meta: { total: 1, page: 1, per_page: SIMRS_PER_PAGE } },
        null, 2,
      ),
    },
    endpointPasien: {
      spec: SIMRS_ENDPOINT_PASIEN,
      // Endpoint pasien mengembalikan satu objek, bukan array — cocok dengan cara
      // getPasienByNoRm() membacanya (json.data ?? json).
      contohRespons: JSON.stringify({ data: contohBaris(fieldsPasien) }, null, 2),
    },
    fieldsKunjungan,
    fieldsPasien,
    nonFungsional: items.filter(i => i.bagian === 'non_fungsional').map(keItem),
    kesepakatan: items.filter(i => i.bagian === 'kesepakatan').map(keItem),
    pertanyaanTerbuka: items.filter(i => i.bagian === 'pertanyaan_terbuka').map(keItem),
    catatanUmum: catatan?.catatan_umum ?? '',
  }
}

/** Bangun satu baris contoh JSON dari nilai "contoh" tiap field. Field yang belum
 * dianotasi tampil null — jadi contoh respons ikut lengkap begitu Admin IT mengisi
 * contoh, tanpa blok statis terpisah yang bisa basi. diagnosa_sekunder ditampilkan
 * sebagai array supaya bentuknya benar. */
function contohBaris(fields: FieldKontrak[]): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const f of fields) {
    if (f.contoh === null) { row[f.fieldNama] = null; continue }
    if (f.fieldNama === 'diagnosa_sekunder') {
      try { row[f.fieldNama] = JSON.parse(f.contoh) } catch { row[f.fieldNama] = [f.contoh] }
    } else {
      row[f.fieldNama] = f.contoh
    }
  }
  return row
}

/** Simpan contoh/catatan untuk satu field. field_nama HARUS ada di DIKENAL_* —
 * mencegah anotasi menempel ke field yang tidak pernah ada di kontrak sungguhan. */
export async function simpanAnotasiField(
  db: PrismaClient, tenantSlug: string,
  endpoint: 'kunjungan' | 'pasien', fieldNama: string,
  data: { contoh?: string | null; catatan?: string | null },
): Promise<void> {
  const dikenal = endpoint === 'kunjungan' ? DIKENAL_KUNJUNGAN : DIKENAL_PASIEN
  if (!(dikenal as string[]).includes(fieldNama)) {
    throw new Error(`Field "${fieldNama}" tidak dikenal di kontrak ${endpoint} — periksa penulisan.`)
  }

  await db.simrsKontrakField.upsert({
    where: { tenant_slug_endpoint_field_nama: { tenant_slug: tenantSlug, endpoint, field_nama: fieldNama } },
    create: { tenant_slug: tenantSlug, endpoint, field_nama: fieldNama, ...data },
    update: data,
  })
}

export async function simpanItem(
  db: PrismaClient, tenantSlug: string, bagian: Bagian,
  data: { judul?: string | null; isi: string; status?: string | null; urutan?: number },
): Promise<ItemKontrak> {
  const created = await db.simrsKontrakItem.create({
    data: { tenant_slug: tenantSlug, bagian, judul: data.judul ?? null, isi: data.isi, status: data.status ?? null, urutan: data.urutan ?? 0 },
  })
  return { id: created.id, bagian: created.bagian as Bagian, judul: created.judul, isi: created.isi, status: created.status, urutan: created.urutan }
}

export async function updateItem(
  db: PrismaClient, tenantSlug: string, itemId: string,
  data: { judul?: string | null; isi?: string; status?: string | null; urutan?: number },
): Promise<void> {
  const item = await db.simrsKontrakItem.findFirst({ where: { id: itemId, tenant_slug: tenantSlug } })
  if (!item) throw new Error('Item tidak ditemukan.')
  await db.simrsKontrakItem.update({ where: { id: itemId }, data })
}

export async function hapusItem(db: PrismaClient, tenantSlug: string, itemId: string): Promise<void> {
  const item = await db.simrsKontrakItem.findFirst({ where: { id: itemId, tenant_slug: tenantSlug } })
  if (!item) throw new Error('Item tidak ditemukan.')
  await db.simrsKontrakItem.delete({ where: { id: itemId } })
}

export async function simpanCatatanUmum(db: PrismaClient, tenantSlug: string, catatanUmum: string): Promise<void> {
  await db.simrsKontrakCatatan.upsert({
    where: { tenant_slug: tenantSlug },
    create: { tenant_slug: tenantSlug, catatan_umum: catatanUmum },
    update: { catatan_umum: catatanUmum },
  })
}
