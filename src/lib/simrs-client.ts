/**
 * SIMRS API Client
 *
 * Mode: SIMRS_MOCK=true → pakai data dummy (sementara menunggu API dari IT RKZ)
 *       SIMRS_MOCK=false → hit API real SIMRS
 *
 * Contract API yang diharapkan dari IT RKZ — lihat SIMRS_ENDPOINT_KUNJUNGAN /
 * SIMRS_ENDPOINT_PASIEN di bawah. Konstanta itu adalah SUMBER KEBENARAN TUNGGAL
 * yang dipakai bersama oleh fetch sungguhan DAN dokumentasi kontrak (halaman
 * Pengaturan > Integrasi SIMRS) — jadi keduanya tidak bisa berbeda.
 */

// Batas baris per panggilan yang disepakati tim IT RKZ. Dipakai oleh SEMUA jalur
// (sync, diagnostik, dokumentasi) — jangan tulis angka literal per_page di tempat
// lain, supaya batas ini tidak pernah bercabang lagi. (Sebelumnya sync memakai 500
// diam-diam, melanggar kesepakatan.)
export const SIMRS_PER_PAGE = 100

export interface SimrsQueryParam {
  nama:       string
  contoh:     string
  keterangan: string
}
export interface SimrsEndpointSpec {
  kunci:      'kunjungan' | 'pasien'
  method:     string
  pathContoh: string
  queryParams: SimrsQueryParam[]
}

export const SIMRS_ENDPOINT_KUNJUNGAN: SimrsEndpointSpec = {
  kunci:  'kunjungan',
  method: 'GET',
  pathContoh: `/kunjungan/delta?tanggal=2026-03-20&page=1&per_page=${SIMRS_PER_PAGE}&unit=<KODE_PONDOK_SEHAT>`,
  queryParams: [
    { nama: 'tanggal',  contoh: '2026-03-20',           keterangan: 'Tanggal kunjungan (YYYY-MM-DD)' },
    { nama: 'page',     contoh: '1',                     keterangan: 'Nomor halaman, mulai dari 1' },
    { nama: 'per_page', contoh: String(SIMRS_PER_PAGE),  keterangan: `Baris per halaman — maks ${SIMRS_PER_PAGE} (disepakati tim IT)` },
    { nama: 'unit',     contoh: '<KODE_PONDOK_SEHAT>',   keterangan: 'Filter unit DI SISI SERVER SIMRS — kode Pondok Sehat dari tim IT' },
  ],
}

export const SIMRS_ENDPOINT_PASIEN: SimrsEndpointSpec = {
  kunci:  'pasien',
  method: 'GET',
  pathContoh: '/pasien/{no_rm}',
  queryParams: [],
}

/**
 * KUNJUNGAN — RAMPING. Sengaja TIDAK memuat demografi pasien (nama, HP, NIK,
 * alamat, dst.). Data person diambil terpisah lewat endpoint Pasien, hanya untuk
 * no_rm yang datanya baru/berubah — supaya demografi tidak dikirim ulang di tiap
 * baris kunjungan (pasien rutin bisa punya banyak kunjungan). Penghubung ke person
 * cukup lewat no_rm.
 */
export interface SimrsKunjungan {
  kunjungan_id:     string       // ID unik kunjungan di SIMRS
  no_rm:            string       // nomor rekam medis — SATU-SATUNYA penghubung ke data Pasien
  tanggal:          string       // YYYY-MM-DD tanggal kunjungan
  poli:             string | null
  unit:             string | null   // nama KELOMPOK unit, mis. "Pondok Sehat" — cocok ke SimrsUnitLibrary.kelompok
  dokter:           string | null
  diagnosa_icd:     string | null   // kode ICD utama, misal "J06.9"
  diagnosa_nama:    string | null
  diagnosa_sekunder: string[]       // array kode ICD sekunder
  tindakan_kode:    string | null   // WAJIB cocok dengan SimrsLayananLibrary.kode_barang — dasar pencocokan evaluasi campaign
  jadwal_kontrol:   string | null   // YYYY-MM-DD
  status_kunjungan: string | null   // SELESAI | BATAL | dll — RKZ mengonfirmasi kunjungan BATAL sudah difilter di sisi API mereka
  jenis_pembayaran: string | null   // "TUNAI" | "NON_TUNAI" — atribut KUNJUNGAN ini, bukan pasien
  nama_instansi:    string | null   // nama penjamin kunjungan ini
  kode_instansi:    string | null   // kode master instansi dari SIMRS
}

/**
 * PASIEN — sumber tunggal demografi. Penjamin (jenis_pembayaran/nama_instansi/
 * kode_instansi) SENGAJA TIDAK di sini: itu atribut per-kunjungan (satu orang bisa
 * beda penjamin di kunjungan berbeda), ada di SimrsKunjungan.
 */
export interface SimrsPasien {
  no_rm:            string
  nama:             string
  tanggal_lahir:    string | null
  jenis_kelamin:    'L' | 'P' | null
  no_hp:            string | null
  no_hp_alternatif: string | null
  agama:            string | null
  alamat:           string | null   // alamat bebas (nama jalan, no. rumah, dst)
  kota:             string | null   // kota/kabupaten — TERPISAH dari alamat bebas, dipakai segmentasi wilayah
  kecamatan:        string | null   // kecamatan — TERPISAH dari alamat bebas, dipakai segmentasi wilayah
  nik:              string | null   // NIK KTP — dikonfirmasi tersedia di SIMRS RKZ
  no_bpjs:          string | null
}

export interface SimrsClientConfig {
  base_url: string
  api_key:  string
}

/**
 * Ambil konfigurasi SIMRS tenant dari master DB. Dipakai bersama oleh sync
 * terjadwal (simrs-sync.ts) dan tools diagnostik (simrs-diagnostik.ts) — satu
 * tempat, supaya keduanya selalu memakai kredensial yang sama persis.
 */
export async function getSimrsConfig(masterDb: any, tenantSlug: string): Promise<SimrsClientConfig | null> {
  const tenant = await masterDb.tenant.findUnique({
    where:  { slug: tenantSlug },
    select: { config: { select: { simrs_base_url: true, simrs_api_key: true } } },
  })

  const cfg = tenant?.config
  const MOCK = process.env.SIMRS_MOCK === 'true'

  if (MOCK) return { base_url: 'mock', api_key: 'mock' }
  if (!cfg?.simrs_base_url || !cfg?.simrs_api_key) return null
  return { base_url: cfg.simrs_base_url, api_key: cfg.simrs_api_key }
}

// ──────────────────────────────────────────────
// Mock data generator
// ──────────────────────────────────────────────

const MOCK_POLI   = ['Poli Umum', 'Poli Dalam', 'Poli Anak', 'Poli Bedah', 'Poli Jantung', 'IGD']
const MOCK_ICD    = ['J06.9', 'K29.7', 'I10', 'E11.9', 'J18.9', 'K35.9', 'A09', 'N39.0']
const MOCK_NAMES  = ['Budi Santoso', 'Siti Rahayu', 'Ahmad Fauzi', 'Dewi Lestari', 'Rudi Hermawan',
                     'Ani Kurniawati', 'Bambang Wibowo', 'Sri Mulyani', 'Hendra Gunawan', 'Rina Susanti']
const MOCK_KOTA_KEC: [string, string][] = [
  ['Surabaya', 'Tenggilis Mejoyo'], ['Surabaya', 'Gubeng'], ['Surabaya', 'Rungkut'],
  ['Sidoarjo', 'Waru'], ['Gresik', 'Kebomas'],
]

// no_rm SENGAJA deterministik dari indeks (bukan acak) supaya pasien yang sama muncul
// lintas hari — dibutuhkan untuk menguji "pasien berulang tidak di-fetch person ulang".
function mockNoRm(i: number): string {
  return `RM${String(100001 + i).padStart(6, '0')}`
}

// Kunjungan RAMPING — tidak ada demografi person, cuma no_rm + field kunjungan.
function mockKunjungan(tanggal: string, n: number): SimrsKunjungan[] {
  return Array.from({ length: n }, (_, i) => ({
    kunjungan_id:     `KJG-${tanggal.replace(/-/g, '')}-${String(i + 1).padStart(4, '0')}`,
    no_rm:            mockNoRm(i),
    tanggal,
    poli:             MOCK_POLI[i % MOCK_POLI.length],
    unit:             i % 3 === 0 ? 'Rawat Inap' : 'Rawat Jalan',
    dokter:           `dr. Dokter ${String.fromCharCode(65 + (i % 10))}`,
    diagnosa_icd:     MOCK_ICD[i % MOCK_ICD.length],
    diagnosa_nama:    'Diagnosis Mock',
    diagnosa_sekunder: [],
    tindakan_kode:    null,
    jadwal_kontrol:   i % 5 === 0 ? tanggal : null,
    status_kunjungan: 'SELESAI',
    jenis_pembayaran: i % 3 === 0 ? 'TUNAI' : 'NON_TUNAI',
    nama_instansi:    i % 3 === 0 ? null : ['BPJS Kesehatan', 'PT Prudential', 'PT Allianz'][i % 3 === 1 ? 0 : 1],
    kode_instansi:    i % 3 === 0 ? null : ['BPJS-001', 'PRU-001', 'ALZ-001'][i % 3 === 1 ? 0 : 1],
  }))
}

// Demografi pasien deterministik dari no_rm — dipakai mock endpoint Pasien.
function mockPasien(noRm: string): SimrsPasien {
  const i = Math.max(0, Number(noRm.replace(/\D/g, '')) - 100001)
  const [kota, kecamatan] = MOCK_KOTA_KEC[i % MOCK_KOTA_KEC.length]
  return {
    no_rm:            noRm,
    nama:             MOCK_NAMES[i % MOCK_NAMES.length],
    tanggal_lahir:    `${1960 + (i % 40)}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
    jenis_kelamin:    i % 2 === 0 ? 'L' : 'P',
    no_hp:            `0812${String(10000000 + i).slice(0, 8)}`,
    no_hp_alternatif: i % 4 === 0 ? `0813${String(20000000 + i).slice(0, 8)}` : null,
    agama:            ['Islam', 'Kristen', 'Katolik', 'Hindu', 'Budha'][i % 5],
    alamat:           `Jl. Contoh No. ${i + 1}`,
    kota,
    kecamatan,
    nik:              `35${String(1000000000000 + i).slice(0, 14)}`,
    no_bpjs:          i % 3 === 0 ? null : `000${String(1234567890 + i).slice(0, 10)}`,
  }
}

// ──────────────────────────────────────────────
// Real client
// ──────────────────────────────────────────────

async function fetchKunjunganPage(
  cfg: SimrsClientConfig,
  tanggal: string,
  page: number,
): Promise<{ data: SimrsKunjungan[]; total: number }> {
  const url = `${cfg.base_url}/kunjungan/delta?tanggal=${tanggal}&page=${page}&per_page=${SIMRS_PER_PAGE}`
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${cfg.api_key}`,
      'Accept':        'application/json',
    },
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    throw new Error(`SIMRS API error ${res.status}: ${await res.text().catch(() => res.statusText)}`)
  }

  const json = await res.json()
  return {
    data:  json.data ?? [],
    total: json.meta?.total ?? json.data?.length ?? 0,
  }
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

const MOCK_MODE = process.env.SIMRS_MOCK === 'true'

/**
 * Ambil semua kunjungan untuk tanggal tertentu.
 * Mock mode: return data dummy tanpa hit API.
 * Real mode: paginate sampai habis.
 */
export async function getKunjunganByTanggal(
  cfg: SimrsClientConfig,
  tanggal: string,
): Promise<SimrsKunjungan[]> {
  if (MOCK_MODE) {
    // Jumlah TETAP (bukan acak) supaya uji sync deterministik — pasien yang sama
    // (no_rm by indeks) muncul konsisten lintas hari. Mock hanya untuk dev.
    return mockKunjungan(tanggal, 20)
  }

  const all: SimrsKunjungan[] = []
  let page = 1

  while (true) {
    const { data, total } = await fetchKunjunganPage(cfg, tanggal, page)
    all.push(...data)
    if (all.length >= total || data.length === 0) break
    page++
  }

  return all
}

/**
 * Ambil demografi pasien by no_rm. Sumber TUNGGAL data person sekarang — dipanggil
 * SELEKTIF oleh sync (hanya untuk no_rm baru/berubah, bukan tiap kunjungan) supaya
 * demografi tidak ditransfer ulang berulang. Lihat simrs-sync.ts.
 */
export async function getPasienByNoRm(
  cfg: SimrsClientConfig,
  noRm: string,
): Promise<SimrsPasien | null> {
  if (MOCK_MODE) return mockPasien(noRm)

  try {
    const res = await fetch(`${cfg.base_url}/pasien/${encodeURIComponent(noRm)}`, {
      headers: { 'Authorization': `Bearer ${cfg.api_key}`, 'Accept': 'application/json' },
      signal:  AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.data ?? json ?? null
  } catch {
    return null
  }
}

// ──────────────────────────────────────────────
// Diagnostik — SATU panggilan, mengembalikan status & waktu tempuh mentah.
// Beda tujuan dari getKunjunganByTanggal/getPasienByNoRm di atas: fungsi itu untuk
// SYNC (paginasi penuh, gagal diam kalau error), ini untuk ADMIN MENGUJI KONEKSI
// (satu halaman saja, error & status HTTP harus terlihat apa adanya di layar).
// ──────────────────────────────────────────────

export interface HasilPanggilanMentah {
  statusHttp: number | null   // null = gagal terhubung sama sekali (bukan status HTTP)
  durasiMs:   number
  raw:        unknown          // body respons apa adanya, untuk ditampilkan & divalidasi
  errorPesan: string | null
}

export async function panggilKunjunganMentah(
  cfg: SimrsClientConfig,
  tanggal: string,
  perPage: number,
): Promise<HasilPanggilanMentah> {
  const mulai = Date.now()

  if (MOCK_MODE) {
    const data = mockKunjungan(tanggal, Math.min(perPage, 20))
    return { statusHttp: 200, durasiMs: Date.now() - mulai, raw: { data, meta: { total: data.length, page: 1, per_page: perPage } }, errorPesan: null }
  }

  try {
    const url = `${cfg.base_url}/kunjungan/delta?tanggal=${tanggal}&page=1&per_page=${perPage}`
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${cfg.api_key}`, 'Accept': 'application/json' },
      signal:  AbortSignal.timeout(30_000),
    })
    const durasiMs = Date.now() - mulai
    const raw = await res.json().catch(() => null)
    return { statusHttp: res.status, durasiMs, raw, errorPesan: res.ok ? null : `HTTP ${res.status}` }
  } catch (e) {
    return { statusHttp: null, durasiMs: Date.now() - mulai, raw: null, errorPesan: e instanceof Error ? e.message : 'Gagal terhubung' }
  }
}

export async function panggilPasienMentah(
  cfg: SimrsClientConfig,
  noRm: string,
): Promise<HasilPanggilanMentah> {
  const mulai = Date.now()

  if (MOCK_MODE) {
    return { statusHttp: 200, durasiMs: Date.now() - mulai, raw: { data: mockPasien(noRm) }, errorPesan: null }
  }

  try {
    const res = await fetch(`${cfg.base_url}/pasien/${encodeURIComponent(noRm)}`, {
      headers: { 'Authorization': `Bearer ${cfg.api_key}`, 'Accept': 'application/json' },
      signal:  AbortSignal.timeout(10_000),
    })
    const durasiMs = Date.now() - mulai
    const raw = await res.json().catch(() => null)
    return { statusHttp: res.status, durasiMs, raw, errorPesan: res.ok ? null : `HTTP ${res.status}` }
  } catch (e) {
    return { statusHttp: null, durasiMs: Date.now() - mulai, raw: null, errorPesan: e instanceof Error ? e.message : 'Gagal terhubung' }
  }
}

export { MOCK_MODE as SIMRS_MOCK_ACTIVE }
