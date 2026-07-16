/**
 * CRM Platform — Domain Types
 * SOURCE OF TRUTH untuk semua business interfaces.
 * Semua komponen, service, dan API wajib import dari sini.
 * Jangan duplikasi type di file lain.
 */

// ─────────────────────────────────────────────
// PRIMITIVES
// ─────────────────────────────────────────────

export type TenantSlug = string
export type PersonId   = string
export type TagId      = string
export type CampaignId = string
export type ConversationId = string
export type MessageId  = string
export type UserId     = string

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

export type Channel = 'wa' | 'ig' | 'fb'

export type TagSource =
  | 'manual'
  | 'auto_ai'
  | 'kegiatan'
  | 'broadcast'
  | 'simrs_sync'
  | 'akar_migrasi'

export type CampaignStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'RUNNING'
  | 'DONE'
  | 'FAILED'

export type MessageStatus =
  | 'PENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'

export type MessageDirection = 'incoming' | 'outgoing'

export type ConversationStatus = 'open' | 'resolved' | 'pending'

/**
 * Kelompok unit kunjungan, mis. "Rawat Jalan" | "Penunjang" | "Pondok Sehat".
 * SENGAJA string bebas, bukan union tetap: nilainya milik tiap tenant lewat
 * SimrsUnitLibrary.kelompok di DB. "Pondok Sehat" khas RKZ — RS lain beda.
 * Jangan dikunci jadi daftar tetap di sini (SAAS-FIRST, CLAUDE.md §9).
 */
export type SimrsUnit = string

export type UserRole = 'SUPER_ADMIN' | 'ADMIN_IT' | 'ADMIN_OPS' | 'SUPERVISOR' | 'AGEN'

export type TenantPlan = 'TRIAL' | 'STARTER' | 'PRO' | 'ENTERPRISE'

// ─────────────────────────────────────────────
// TENANT
// ─────────────────────────────────────────────

export interface Tenant {
  id:          string
  slug:        TenantSlug     // tidak bisa diubah setelah dibuat
  name:        string
  plan:        TenantPlan
  databaseUrl: string
  customDomain: string | null
  createdAt:   Date
  updatedAt:   Date
}

export interface TenantConfig {
  tenantId:         string
  simrsBaseUrl:     string | null
  simrsApiKey:      string | null
  wappinApiKey:     string | null
  wappinPhoneNumber:string | null
  metaAccessToken:  string | null
  aiEnabled:        boolean
  aiProvider:       'CLAUDE' | 'GEMINI'
  aiApiKey:         string | null
  aiModel:          string | null
  maxBroadcastPerMonth: number
}

// ─────────────────────────────────────────────
// PERSON (unified AKAR customer + SIMRS patient)
// ─────────────────────────────────────────────

export type ContactJenis = 'HP' | 'WA' | 'EMAIL' | 'TELEPON_RUMAH'

export interface PersonContact {
  id:         string
  personId:   PersonId
  tenantSlug: TenantSlug
  jenis:      ContactJenis
  nilai:      string       // nomor atau alamat email
  label:      string | null
  isPrimary:  boolean
  isWaAktif:  boolean
  createdAt:  Date
}

export interface Person {
  id:              PersonId
  tenantSlug:      TenantSlug
  noHp:            string | null  // cache dari kontak primary — untuk backward compat
  name:            string
  email:           string | null
  tanggalLahir:    Date | null
  // Identitas tambahan
  nik:             string | null
  jenisKelamin:    string | null  // "L" | "P"
  alamat:          string | null
  kota:            string | null
  kecamatan:       string | null
  pekerjaan:       string | null
  kategori:        string | null  // "umum" | "pasien" | "keluarga"
  akarKode:        string | null
  // SIMRS fields
  noRm:            string | null
  simrsPatientId:  string | null
  lastSimrsSyncAt: Date | null
  // AKAR legacy
  akarId:          string | null
  // meta
  aktif:           boolean
  createdAt:       Date
  updatedAt:       Date
  // relations (optional — dari include)
  tags?:           PersonTag[]
  visits?:         SimrsVisit[]
  contacts?:       PersonContact[]
}

export interface PersonTag {
  id:         string
  personId:   PersonId
  tagId:      TagId
  sumber:     TagSource
  confidence: number | null   // 0-1, hanya untuk auto_ai
  assignedAt: Date
  aktif:      boolean
  tag?:       Tag
}

// ─────────────────────────────────────────────
// TAG
// ─────────────────────────────────────────────

export interface Tag {
  id:          TagId
  tenantSlug:  TenantSlug
  name:        string
  warna:       string          // hex color
  keterangan:  string | null
  aktif:       boolean         // TIDAK PERNAH DELETE — hanya aktif=false
  createdAt:   Date
}

// ─────────────────────────────────────────────
// SIMRS
// ─────────────────────────────────────────────

export interface SimrsVisit {
  id:           string
  personId:     PersonId
  tanggal:      Date
  unit:         SimrsUnit
  poli:         string | null
  dokter:       string | null
  diagnosaNama: string | null
  diagnosaIcd:  string | null   // kode ICD-10
  tindakan:     string | null   // untuk penunjang
  aktif:        boolean         // TIDAK PERNAH DELETE
}

export interface SimrsQueryParams {
  unit:       SimrsUnit
  icdCodes?:  string[]         // rawat inap
  layanan?:   string[]         // rawat jalan / penunjang (nama tindakan)
  periodeAwal: string          // YYYY-MM-DD
  periodeAkhir: string
}

// ─────────────────────────────────────────────
// ICD LIBRARY
// ─────────────────────────────────────────────

export interface IcdEntry {
  id:       string
  kode:     string             // e.g. "E11.9"
  nama:     string             // e.g. "Type 2 diabetes mellitus without complications"
  namaId:   string             // nama dalam Bahasa Indonesia
  bab:      string | null
  aktif:    boolean
}

// ─────────────────────────────────────────────
// NLP SEARCH
// ─────────────────────────────────────────────

export interface NlpSearchInput {
  query:    string             // natural language dari admin
  tenantSlug: TenantSlug
}

export interface NlpSearchResult {
  queryOriginal:   string
  interpretasi:    string      // penjelasan AI ke admin
  params:          SimrsQueryParams   // parameter yang akan dikirim ke SIMRS
  icdMatches:      IcdEntry[]         // kode yang ditemukan
  confidence:      number             // 0-1
  needsConfirmation: boolean          // jika true, tampilkan ke admin sebelum hit SIMRS
}

// ─────────────────────────────────────────────
// BROADCAST / CAMPAIGN
// ─────────────────────────────────────────────

export interface Campaign {
  id:            CampaignId
  tenantSlug:    TenantSlug
  nama:          string
  status:        CampaignStatus
  channel:       Channel
  templateId:    string | null       // Wappin template ID (pre-approved)
  pesan:         string
  segmentId:     string | null
  jadwalKirim:   Date | null
  totalPenerima: number
  totalTerkirim: number
  totalDiterima: number
  totalDibaca:   number
  totalDibalas:  number
  createdBy:     UserId
  createdAt:     Date
  updatedAt:     Date
}

export interface CampaignRecipient {
  id:         string
  campaignId: CampaignId
  personId:   PersonId
  noHp:       string       // snapshot saat campaign dibuat — BUKAN real-time
  status:     MessageStatus
  sentAt:     Date | null
  deliveredAt: Date | null
  readAt:      Date | null
  repliedAt:   Date | null
  person?:     Person
}

// ─────────────────────────────────────────────
// INBOX / CONVERSATION
// ─────────────────────────────────────────────

export interface Conversation {
  id:           ConversationId
  tenantSlug:   TenantSlug
  personId:     PersonId | null
  channel:      Channel
  channelUserId: string        // ID user di platform (WA number, IG user ID)
  status:       ConversationStatus
  assignedTo:   UserId | null
  lastMessageAt: Date
  unreadCount:  number
  createdAt:    Date
  // relations
  person?:      Person
  messages?:    Message[]
  assignedUser?: AppUser
}

export interface Message {
  id:             MessageId
  conversationId: ConversationId
  direction:      MessageDirection
  content:        string
  mediaUrl:       string | null
  mediaType:      'image' | 'document' | 'audio' | 'video' | null
  isInternalNote: boolean       // catatan internal — tidak terkirim ke pasien
  status:         MessageStatus
  wappinMessageId: string | null
  aiGenerated:    boolean       // apakah dihasilkan AI (untuk audit)
  sentAt:         Date | null
  deliveredAt:    Date | null
  readAt:         Date | null
  createdAt:      Date
}

// ─────────────────────────────────────────────
// USER
// ─────────────────────────────────────────────

export interface AppUser {
  id:          UserId
  tenantSlug:  TenantSlug
  name:        string
  email:       string
  roles:       UserRole[]
  aktif:       boolean
  lastLoginAt: Date | null
  createdAt:   Date
}

// ─────────────────────────────────────────────
// API RESPONSE WRAPPER
// ─────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean
  data?:   T
  error?:  string
  meta?: {
    page:     number
    perPage:  number
    total:    number
  }
}

// ─────────────────────────────────────────────
// TAG RULE LIBRARY
// ─────────────────────────────────────────────

export interface TagRule {
  id:             string
  tenantSlug:     TenantSlug
  tagId:          TagId
  aktif:          boolean
  // Trigger
  icdCodes:       string[]     // kode ICD-10 trigger
  icdExclude:     string[]     // kode ICD yang dikecualikan
  keywordInclude: string[]     // kata kunci dalam diagnosa/tindakan
  keywordExclude: string[]     // kata kunci yang dikecualikan
  // Panduan AI
  instruksiAi:    string       // instruksi natural language untuk Haiku
  contohPositif:  string[]     // contoh yang HARUS dapat tag ini
  contohNegatif:  string[]     // contoh yang TIDAK boleh dapat tag ini
  // Meta
  confidenceMin:  number       // default 0.80
  createdBy:      UserId
  createdAt:      Date
  updatedAt:      Date
  // relations
  tag?:           Tag
}

// ─────────────────────────────────────────────
// IMPORT LOG
// ─────────────────────────────────────────────

export type ImportSumber = 'EXCEL' | 'SIMRS_API'
export type ImportStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED'

export interface ImportLog {
  id:             string
  tenantSlug:     TenantSlug
  sumber:         ImportSumber
  status:         ImportStatus
  filename:       string | null
  totalRows:      number
  processedRows:  number
  newPersons:     number       // pasien baru yang dibuat
  updatedPersons: number       // pasien existing yang diupdate
  newVisits:      number       // kunjungan baru
  skippedRows:    number       // baris duplikat/error
  errorDetail:    ImportRowError[] | null
  startedAt:      Date
  finishedAt:     Date | null
  createdBy:      UserId
}

export interface ImportRowError {
  row:     number
  noHp:    string | null
  alasan:  string
}

// Template kolom Excel yang diterima sistem
export interface ExcelImportRow {
  no_rm:          string | null
  nama:           string          // wajib
  no_hp:          string          // wajib — matching key
  email:          string | null
  tanggal_lahir:  string | null   // format: DD/MM/YYYY atau YYYY-MM-DD
  unit:           string | null   // RAWAT_JALAN | RAWAT_INAP | PENUNJANG
  poli:           string | null
  dokter:         string | null
  tanggal_kunjungan: string | null
  diagnosa_icd:   string | null
  diagnosa_nama:  string | null
  tindakan:       string | null
}

// ─────────────────────────────────────────────
// KEGIATAN
// ─────────────────────────────────────────────

export interface Kegiatan {
  id:              string
  tenantSlug:      TenantSlug
  kode:            string
  nama:            string
  jenis:           string       // Seminar | Pelatihan | Bakti Sosial | dll
  tanggalMulai:    Date
  tanggalSelesai:  Date | null
  lokasi:          string | null
  penyelenggara:   string | null
  keterangan:      string | null
  poinKegiatan:    number
  status:          string       // aktif | selesai
  qrToken:         string
  createdAt:       Date
  updatedAt:       Date
  peserta?:        KegiatanPeserta[]
}

export interface KegiatanPeserta {
  id:            string
  kegiatanId:    string
  personId:      PersonId
  tenantSlug:    TenantSlug
  hadir:         boolean
  poinDiberikan: number
  sumber:        string  // admin | self | migrasi
  catatan:       string | null
  createdAt:     Date
  person?:       Person
}

export interface KontakLangsung {
  id:         string
  tenantSlug: TenantSlug
  personId:   PersonId
  subTipe:    string   // telepon | walk_in | referral | medsos | lainnya
  tanggal:    Date
  catatan:    string | null
  operatorId: string | null
  createdAt:  Date
  person?:    Person
}

// ─────────────────────────────────────────────
// LOYALTY
// ─────────────────────────────────────────────

export interface LoyaltyRule {
  id:         string
  tenantSlug: TenantSlug
  jenis:      string   // KUNJUNGAN_RAWAT_JALAN | dll
  poin:       number
  aktif:      boolean
  keterangan: string | null
  updatedAt:  Date
}

export interface LoyaltyTransaction {
  id:         string
  tenantSlug: TenantSlug
  personId:   PersonId
  jenis:      string   // KUNJUNGAN_RAWAT_JALAN | KEGIATAN | MANUAL | REDEEM | dll
  poin:       number   // bisa negatif untuk redeem
  refId:      string | null
  keterangan: string | null
  createdAt:  Date
  person?:    Person
}

// ─────────────────────────────────────────────
// WAPPIN WEBHOOK PAYLOAD
// ─────────────────────────────────────────────

export interface WappinWebhookPayload {
  event:      'message.delivered' | 'message.read' | 'message.received'
  messageId:  string
  from:       string    // no HP pengirim
  to:         string    // no HP penerima
  timestamp:  number
  content?:   string
  mediaUrl?:  string
}
