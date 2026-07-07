/**
 * CRM Platform — Constants
 * Semua nilai hardcoded ada di sini.
 * Jangan hardcode angka atau string magic di komponen / service lain.
 */

// ─────────────────────────────────────────────
// AI MODELS
// ─────────────────────────────────────────────

/** Untuk NLP search, auto-tag, klasifikasi — prioritas kecepatan + biaya */
export const AI_MODEL_FAST  = 'claude-haiku-4-5-20251001'

/** Untuk suggested reply, patient summary, draft broadcast — prioritas kualitas */
export const AI_MODEL_SMART = 'claude-sonnet-4-6'

/** Confidence minimum untuk AI auto-tag. Di bawah ini → masuk queue review manual */
export const AI_AUTOTAG_CONFIDENCE_THRESHOLD = 0.80

/** Jumlah pesan chat terakhir yang disertakan sebagai konteks AI */
export const AI_CONTEXT_MESSAGES_LIMIT = 10

// ─────────────────────────────────────────────
// BROADCAST
// ─────────────────────────────────────────────

/** Maks penerima per batch pengiriman Wappin */
export const BROADCAST_BATCH_SIZE = 50

/** Jeda antar batch dalam ms (rate limit Wappin — konfirmasi dengan tim Wappin) */
export const BROADCAST_DELAY_MS = 1000

/** Maks retry jika pengiriman gagal */
export const BROADCAST_MAX_RETRY = 3

// ─────────────────────────────────────────────
// SIMRS SYNC
// ─────────────────────────────────────────────

/** Interval delta sync dalam menit */
export const SIMRS_SYNC_INTERVAL_MINUTES = 60

/** Timeout request ke SIMRS dalam ms */
export const SIMRS_SYNC_TIMEOUT_MS = 30_000

/** Maks record per request saat delta sync */
export const SIMRS_SYNC_BATCH_SIZE = 500

// ─────────────────────────────────────────────
// TAG SOURCE — nilai enum untuk person_tags.sumber
// ─────────────────────────────────────────────

export const TAG_SOURCE = {
  MANUAL:       'manual',
  AUTO_AI:      'auto_ai',
  KEGIATAN:     'kegiatan',
  BROADCAST:    'broadcast',
  SIMRS_SYNC:   'simrs_sync',
  AKAR_MIGRASI: 'akar_migrasi',
} as const

export type TagSourceValue = typeof TAG_SOURCE[keyof typeof TAG_SOURCE]

// ─────────────────────────────────────────────
// CHANNEL
// ─────────────────────────────────────────────

export const CHANNEL = {
  WHATSAPP:  'wa',
  INSTAGRAM: 'ig',
  FACEBOOK:  'fb',
} as const

export const CHANNEL_LABEL: Record<string, string> = {
  wa: 'WhatsApp',
  ig: 'Instagram DM',
  fb: 'Facebook Messenger',
}

// ─────────────────────────────────────────────
// CAMPAIGN STATUS
// ─────────────────────────────────────────────

export const CAMPAIGN_STATUS = {
  DRAFT:     'DRAFT',
  SCHEDULED: 'SCHEDULED',
  RUNNING:   'RUNNING',
  DONE:      'DONE',
  FAILED:    'FAILED',
} as const

// ─────────────────────────────────────────────
// MESSAGE STATUS
// ─────────────────────────────────────────────

export const MESSAGE_STATUS = {
  PENDING:   'PENDING',
  SENT:      'SENT',
  DELIVERED: 'DELIVERED',
  READ:      'READ',
  FAILED:    'FAILED',
} as const

// ─────────────────────────────────────────────
// SIMRS UNIT
// ─────────────────────────────────────────────

export const SIMRS_UNIT = {
  RAWAT_JALAN: 'RAWAT_JALAN',
  RAWAT_INAP:  'RAWAT_INAP',
  PENUNJANG:   'PENUNJANG',
} as const

export const SIMRS_UNIT_LABEL: Record<string, string> = {
  RAWAT_JALAN: 'Rawat Jalan',
  RAWAT_INAP:  'Rawat Inap',
  PENUNJANG:   'Penunjang / Lab',
}

// ─────────────────────────────────────────────
// USER ROLE
// ─────────────────────────────────────────────

export const USER_ROLE = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN_IT:    'ADMIN_IT',
  ADMIN_OPS:   'ADMIN_OPS',
  SUPERVISOR:  'SUPERVISOR',
  AGEN:        'AGEN',
} as const

// Hak akses per fitur — gunakan untuk guard di API route dan UI
export const ROLE_CAN = {
  manageUsers:        ['SUPER_ADMIN', 'ADMIN_IT'],
  configSystem:       ['SUPER_ADMIN', 'ADMIN_IT'],
  icdLibrary:         ['SUPER_ADMIN', 'ADMIN_IT'],
  viewPatients:       ['SUPER_ADMIN', 'ADMIN_IT', 'ADMIN_OPS'],
  importExcel:        ['SUPER_ADMIN', 'ADMIN_IT', 'ADMIN_OPS'],
  manageTagRules:     ['SUPER_ADMIN', 'ADMIN_IT', 'ADMIN_OPS'],
  manageSegments:     ['SUPER_ADMIN', 'ADMIN_IT', 'ADMIN_OPS'],
  manageBroadcast:    ['SUPER_ADMIN', 'ADMIN_IT', 'ADMIN_OPS'],
  manageSapaan:       ['SUPER_ADMIN', 'ADMIN_IT', 'ADMIN_OPS'],
  manageKegiatan:     ['SUPER_ADMIN', 'ADMIN_IT', 'ADMIN_OPS'],
  viewAllInbox:       ['SUPER_ADMIN', 'ADMIN_IT', 'SUPERVISOR'],
  assignConversation: ['SUPER_ADMIN', 'ADMIN_IT', 'SUPERVISOR'],
  replyChat:          ['SUPER_ADMIN', 'ADMIN_IT', 'SUPERVISOR', 'AGEN'],
} as const

export type FeatureKey = keyof typeof ROLE_CAN

/**
 * Cek apakah user memiliki akses ke suatu fitur.
 * Gunakan ini di API route guard dan UI conditional rendering.
 *
 * @example
 * if (!canDo(user.roles, 'importExcel')) return 403
 */
export function canDo(userRoles: string[], feature: FeatureKey): boolean {
  const allowed = ROLE_CAN[feature] as readonly string[]
  return userRoles.some(r => allowed.includes(r))
}

/**
 * Cek apakah user memiliki role tertentu.
 * Gunakan ini hanya ketika perlu cek role spesifik (bukan fitur).
 *
 * @example
 * if (hasRole(user.roles, 'SUPERVISOR')) showAgentFilter()
 */
export function hasRole(userRoles: string[], role: string): boolean {
  return userRoles.includes(role)
}

// ─────────────────────────────────────────────
// PAGINATION
// ─────────────────────────────────────────────

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE     = 100

// ─────────────────────────────────────────────
// TENANT
// ─────────────────────────────────────────────

/** Batas minimum slug — alphanumeric + dash, min 3 karakter */
export const TENANT_SLUG_REGEX = /^[a-z0-9-]{3,32}$/

/** Domain utama platform */
export const PLATFORM_DOMAIN = 'crm-platform.com'

// ─────────────────────────────────────────────
// SAPAAN TERJADWAL
// ─────────────────────────────────────────────

/** Jam kirim sapaan ulang tahun (WIB, format 24h) */
export const BIRTHDAY_GREETING_HOUR = 7

/** Hari sebelum jadwal kontrol untuk kirim reminder */
export const KONTROL_REMINDER_DAYS = [3, 1]   // H-3 dan H-1
