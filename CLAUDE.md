# CLAUDE.md — CRM Platform
> Baca file ini PERTAMA sebelum menulis satu baris kode apapun.
> File ini adalah briefing wajib untuk setiap sesi. Jika ada konflik antara ingatan sesi ini dengan isi file ini, **file ini yang menang**.

---

## 1. IDENTITAS PROYEK

| Item | Nilai |
|------|-------|
| Nama proyek | CRM Platform |
| Stack utama | Next.js 14 (App Router), TypeScript, Prisma, PostgreSQL |
| Model multi-tenant | **Satu database per tenant** — tidak pernah shared DB |
| Antrian / job | BullMQ + Redis |
| AI provider | Anthropic Claude API |
| Channel chat | Wappin (WhatsApp), Meta API (Instagram DM, Facebook Messenger) |
| File referensi utama | `prisma/schema.prisma`, `src/types/index.ts`, `CLAUDE.md` |
| UI Kit referensi | `CRM_UI_KIT.html` — semua komponen dan CSS variable di sini |
| Sitemap referensi | `/Applications/XAMPP/xamppfiles/htdocs/akar/CRM_SITEMAP.html` — daftar halaman, status, catatan per page |
| Keputusan teknis | `/Applications/XAMPP/xamppfiles/htdocs/akar/CRM_TECHNICAL_DECISIONS.md` — arsitektur dan keputusan non-obvious |
| Journey map | `/Applications/XAMPP/xamppfiles/htdocs/akar/CRM_JOURNEY.md` — alur kerja per role (7 journey), touchpoints antar modul |
| Role & hak akses | `/Applications/XAMPP/xamppfiles/htdocs/akar/CRM_ROLES.md` — matriks ROLE_CAN, batas kewenangan, cara pakai guard |

---

## 2. WAJIB BACA SEBELUM CODING

Setiap sesi baru, Claude WAJIB membaca file-file berikut sebelum menulis kode:

```
1. CLAUDE.md                                                    ← ini (sudah dibaca)
2. prisma/schema.prisma                                         ← source of truth semua field name DB
3. src/types/index.ts                                           ← domain types dan business interfaces
4. src/lib/tenant.ts                                            ← fungsi getTenantDb() — wajib dimengerti
5. /Applications/XAMPP/xamppfiles/htdocs/akar/CRM_ROLES.md     ← role, ROLE_CAN, cara guard (baca sebelum sentuh auth/permission)
6. /Applications/XAMPP/xamppfiles/htdocs/akar/CRM_JOURNEY.md   ← alur kerja per role (baca sebelum sentuh UI/UX)
```

Jika file belum ada (proyek baru scaffold), buat dengan mengacu pada konvensi di file ini.

---

## 3. ATURAN MULTI-TENANT — TIDAK BOLEH DILANGGAR

```
❌ DILARANG: koneksi DB global / tanpa slug
❌ DILARANG: query langsung ke tabel tanpa konteks tenant
❌ DILARANG: menyimpan data satu tenant ke schema/DB tenant lain
❌ DILARANG: slug bisa diubah setelah tenant dibuat
❌ DILARANG: gunakan requirePermission() di route yang punya :slug di URL

✅ WAJIB: selalu gunakan getTenantDb(slug) untuk query
✅ WAJIB: slug diambil dari URL param, bukan dari session saja
✅ WAJIB: setiap tenant baru → jalankan copyGlobalToTenant(tenantId)
✅ WAJIB: semua route /api/[slug]/* gunakan requireTenantPermission()
```

### 3.1 BOLA Guard — Wajib untuk semua route berslug

**BOLA (Broken Object Level Authorization)** adalah celah di mana user valid dari tenant A
bisa mengakses data tenant B hanya dengan mengganti slug di URL, karena JWT tetap valid.
`getTenantDb(slug)` mengisolasi data di level DB, tetapi tidak mencegah request masuk.
`requireTenantPermission` menutup celah ini di level auth.

```typescript
// ✅ WAJIB — untuk semua handler di /api/[slug]/*
import { requireTenantPermission } from '@/lib/auth'

export async function GET(req, { params }) {
  const { session, error } = await requireTenantPermission(req, params.slug, 'viewPatients')
  if (error) return error
  // session.userId, session.roles tersedia dan sudah terverifikasi
}

// ❌ DILARANG di route berslug — tidak ada tenant check
import { requirePermission } from '@/lib/auth'
const { error } = await requirePermission(req, 'viewPatients')

// ❌ DILARANG — tidak ada permission check
import { requireAuth } from '@/lib/auth'
const { error } = await requireAuth(req)
```

`requireTenantPermission` melakukan tiga pengecekan sekaligus:
1. Session valid (401 jika tidak ada)
2. `session.tenantSlug === params.slug` — kecuali SUPER_ADMIN (403 jika mismatch)
3. `canDo(session.roles, feature)` (403 jika tidak punya hak)

Pola wajib untuk semua DB query:
```typescript
// ✅ BENAR
const db = await getTenantDb(params.slug)
const person = await db.person.findUnique({ where: { id } })

// ❌ SALAH — tidak boleh ada ini di codebase
const person = await prisma.person.findUnique({ where: { id } })
```

---

## 4. NAMING CONVENTIONS

### 4.1 TypeScript / JavaScript
| Pola | Konvensi | Contoh |
|------|----------|--------|
| Variable & fungsi | camelCase | `tenantSlug`, `getPersonById`, `sendBroadcast` |
| Type & Interface | PascalCase | `Person`, `TenantConfig`, `BroadcastJob` |
| Constant (hardcoded) | SCREAMING_SNAKE | `MAX_BROADCAST_BATCH`, `AI_CONFIDENCE_THRESHOLD` |
| File komponen | PascalCase | `PersonCard.tsx`, `ChatBubble.tsx` |
| File lib/util | kebab-case | `tenant-db.ts`, `wappin-client.ts` |
| Route folder | kebab-case | `[slug]/bank-soal/`, `[slug]/broadcast/` |
| Env variable | SCREAMING_SNAKE | `WAPPIN_API_KEY`, `CLAUDE_API_KEY` |

### 4.2 Database (Prisma / SQL)
| Pola | Konvensi | Contoh |
|------|----------|--------|
| Table / Model | `crm_` + snake_case | `crm_persons`, `crm_person_tags`, `crm_campaigns` |
| Column | snake_case | `no_hp`, `created_at`, `tenant_slug`, `last_sync_at` |
| Foreign key | `{tabel}_id` | `person_id`, `campaign_id`, `tenant_id` |
| Boolean | prefix `is_` atau `aktif` | `is_active`, `aktif`, `is_deleted` |
| Timestamp | `created_at`, `updated_at`, `deleted_at` |
| Enum value | SCREAMING_SNAKE | `RAWAT_JALAN`, `RAWAT_INAP`, `PENUNJANG` |

### 4.3 API Route
```
GET    /api/[slug]/persons              → list
GET    /api/[slug]/persons/:id          → detail
POST   /api/[slug]/persons              → create
PATCH  /api/[slug]/persons/:id          → update
DELETE /api/[slug]/persons/:id          → soft delete (aktif=false)
```

### 4.4 CSS / UI
Semua style mengacu pada CSS variables dari `CRM_UI_KIT.html`.
```css
/* ✅ BENAR */
color: var(--c-primary);
font-size: var(--font-size-sm);

/* ❌ SALAH */
color: #0D2B55;
font-size: 13px;
```

---

## 5. DOMAIN VOCABULARY — KOSAKATA BAKU

Gunakan nama-nama ini secara konsisten. Jangan pakai sinonim lain.

| Term baku | Artinya | Jangan gunakan |
|-----------|---------|----------------|
| `tenant` | satu instansi klien SaaS | customer, client, org |
| `tenantSlug` | identifier URL tenant | slug, subdomain, tenantId (kecuali UUID) |
| `person` | data gabungan pasien+customer | user, patient, kontak, customer |
| `personId` | UUID primary key person | userId, patientId, customerId |
| `noHp` | nomor telepon (TS) / `no_hp` (DB) | phone, telepon, nomorHp, hp |
| `noRm` | nomor rekam medis (TS) / `no_rm` (DB) | rm, medicalRecord, rekamMedis |
| `conversation` | satu thread chat omnichannel | chat, thread, inbox |
| `message` | satu pesan dalam conversation | msg, chat, pesan |
| `campaign` | satu broadcast yang dikirim | broadcast (sebagai noun entity) |
| `broadcast` | aksi kirim pesan massal (verb/module) | send, blast, kirim |
| `tag` | label yang ditempel ke person/conversation | label, kategori, keyword |
| `segment` | kumpulan person berdasarkan kriteria | group, filter, list |
| `channel` | platform asal pesan (wa/ig/fb) | platform, source, media |
| `akarId` | ID dari sistem AKAR lama (TS) / `akar_id` (DB) | oldId, legacyId |
| `simrsPatientId` | ID pasien di SIMRS | patientId, simrsId |

---

## 6. KEY CONSTANTS — NILAI BAKU

```typescript
// src/constants/index.ts — jangan hardcode nilai ini di tempat lain

// AI
export const AI_AUTOTAG_CONFIDENCE_THRESHOLD = 0.80   // 80% minimum
export const AI_MODEL_FAST    = "claude-haiku-4-5-20251001"   // NLP search, auto-tag
export const AI_MODEL_SMART   = "claude-sonnet-4-6"           // suggested reply, summary, draft

// Broadcast
export const BROADCAST_BATCH_SIZE  = 50    // max pesan per batch Wappin
export const BROADCAST_DELAY_MS    = 1000  // jeda antar batch (rate limit)

// Sync
export const SIMRS_SYNC_INTERVAL_MINUTES = 60   // delta sync tiap 1 jam
export const SIMRS_SYNC_TIMEOUT_MS       = 30000

// Tag sumber — nilai enum untuk person_tags.sumber
export const TAG_SOURCE = {
  MANUAL:        'manual',
  AUTO_AI:       'auto_ai',
  KEGIATAN:      'kegiatan',
  BROADCAST:     'broadcast',
  SIMRS_SYNC:    'simrs_sync',
  AKAR_MIGRASI:  'akar_migrasi',
} as const

// Channel
export const CHANNEL = {
  WHATSAPP:  'wa',
  INSTAGRAM: 'ig',
  FACEBOOK:  'fb',
} as const

// Status campaign
export const CAMPAIGN_STATUS = {
  DRAFT:      'DRAFT',
  SCHEDULED:  'SCHEDULED',
  RUNNING:    'RUNNING',
  DONE:       'DONE',
  FAILED:     'FAILED',
} as const
```

---

## 7. STRUKTUR PROYEK

```
crm-platform/
├── CLAUDE.md                    ← ini
├── prisma/
│   └── schema.prisma            ← SOURCE OF TRUTH semua field DB
├── src/
│   ├── types/
│   │   └── index.ts             ← semua business domain types
│   ├── constants/
│   │   └── index.ts             ← semua konstanta baku
│   ├── lib/
│   │   ├── tenant.ts            ← getTenantDb(slug), copyGlobalToTenant()
│   │   ├── wappin.ts            ← Wappin API client
│   │   ├── simrs.ts             ← SIMRS API client
│   │   └── ai.ts                ← Claude API wrapper
│   ├── app/
│   │   ├── [slug]/              ← halaman per-tenant
│   │   │   ├── dashboard/
│   │   │   ├── pasien/
│   │   │   ├── segmen/
│   │   │   ├── broadcast/
│   │   │   ├── inbox/
│   │   │   ├── tags/
│   │   │   ├── sapaan/
│   │   │   └── pengaturan/
│   │   ├── login/
│   │   ├── register/
│   │   └── admin/               ← SaaS super admin panel
│   ├── components/
│   │   ├── ui/                  ← komponen dasar (button, form, card)
│   │   ├── chat/                ← ChatBubble, ChatInput, ConversationItem
│   │   ├── broadcast/           ← CampaignCard, TemplateEditor
│   │   └── pasien/              ← PersonCard, PersonDetail
│   └── middleware.ts            ← tenant routing (hostname → slug)
├── CRM_UI_KIT.html              ← referensi UI design system
├── CRM_SITEMAP.html             ← referensi halaman + status
└── CRM_TECHNICAL_DECISIONS.md  ← arsitektur + keputusan teknis
```

---

## 8. POLA KODE WAJIB

### Tenant Middleware (routing)
```typescript
// src/middleware.ts
export function middleware(req: NextRequest) {
  const hostname = req.headers.get('host') || ''
  const isCustomDomain = !hostname.includes('crm-platform.com')
  const slug = isCustomDomain
    ? await lookupSlugByDomain(hostname)    // lookup master DB
    : hostname.split('.')[0]                // subdomain = slug
  // inject slug ke header untuk dibaca server component
  req.headers.set('x-tenant-slug', slug)
}
```

### DB Query Pattern
```typescript
// src/lib/tenant.ts
export async function getTenantDb(slug: string): Promise<PrismaClient> {
  const tenant = await masterDb.tenant.findUnique({ where: { slug } })
  if (!tenant) throw new Error(`Tenant not found: ${slug}`)
  return new PrismaClient({ datasourceUrl: tenant.databaseUrl })
}
```

### AI Call Pattern
```typescript
// Selalu gunakan model yang tepat sesuai kebutuhan
const client = new Anthropic()

// Cepat + murah (NLP search, auto-tag)
const fast = await client.messages.create({
  model: AI_MODEL_FAST,
  max_tokens: 512,
  messages: [...]
})

// Pintar (suggested reply, summary, draft)
const smart = await client.messages.create({
  model: AI_MODEL_SMART,
  max_tokens: 1024,
  messages: [...]
})
```

### Soft Delete — TAG TIDAK PERNAH DIHAPUS
```typescript
// ❌ DILARANG: hapus tag
await db.tag.delete({ where: { id } })

// ✅ WAJIB: nonaktifkan saja
await db.tag.update({ where: { id }, data: { aktif: false } })
```

### Broadcast — Selalu dari DB, tidak re-query SIMRS
```typescript
// ❌ DILARANG saat kirim broadcast
const patients = await simrsClient.query(...)

// ✅ WAJIB: data sudah di DB saat campaign dibuat
const recipients = await db.campaignRecipient.findMany({
  where: { campaignId },
  include: { person: true }
})
```

---

## 9. PRINSIP SAAS-FIRST — WAJIB DIPATUHI

> Setiap fitur yang dibangun harus dirancang untuk **banyak tenant**, bukan satu tenant.
> Jika ada cara yang lebih mudah tapi hanya bekerja untuk satu tenant, pilih cara yang benar.

```
❌ DILARANG: hardcode slug / tenant ID di dalam kode
❌ DILARANG: env variable per-tenant (semua config tenant wajib di DB)
❌ DILARANG: asumsi "hanya satu tenant yang pakai fitur ini"
❌ DILARANG: satu akun Meta/Wappin platform untuk semua tenant

✅ WAJIB: setiap tenant punya akun Meta App / WABA / nomor WA sendiri
✅ WAJIB: semua config channel (Meta, Wappin, dll) disimpan di DB per-tenant
✅ WAJIB: fitur baru diuji mental: "kalau ada 50 tenant, apakah ini masih benar?"
✅ WAJIB: master DB hanya untuk lookup tenant & config global — data bisnis tetap di tenant DB
```

### 9.1 Model Integrasi: Tenant-Owned Accounts

Platform ini menggunakan model **tenant-owned** — setiap tenant memiliki dan mengelola
akun integrasi mereka sendiri secara independen:

| Integrasi | Pemilik akun | Konfigurasi |
|-----------|-------------|-------------|
| Meta Cloud API | Tenant (Meta App + WABA sendiri) | `MetaConfig` di tenant DB |
| Wappin | Tenant (akun Wappin sendiri) | `WappinConfig` di tenant DB |
| SIMRS | Tenant (endpoint SIMRS RS masing-masing) | `TenantConfig.simrs_*` di master DB |

### 9.2 Pola Webhook Per-Tenant

Karena setiap tenant punya Meta App sendiri, setiap tenant mendaftarkan
webhook URL mereka sendiri di Meta Developers:

```
# Meta — per tenant, didaftarkan di Meta App milik tenant
GET/POST /api/webhook/meta/[slug]

# Wappin — per tenant, URL mengandung secret unik
POST /api/webhook/wappin/[slug]/[secret]
```

Tenant mengisi webhook URL mereka sendiri di halaman Pengaturan → Integrasi Meta,
lalu mendaftarkannya ke Meta Developers account mereka.

### 9.3 Pola Config Per-Tenant

Semua credential / setting integrasi disimpan di **tenant DB**, bukan env variable:

```typescript
// ✅ BENAR — config dibaca dari DB tenant
const cfg = await db.metaConfig.findUnique({ where: { tenant_slug: slug } })

// ❌ SALAH — jangan taruh credential tenant di env variable
const token = process.env.META_ACCESS_TOKEN
```

---

## 11. KEPUTUSAN ARSITEKTUR FINAL — TIDAK BISA DIUBAH TANPA DISKUSI

1. **Satu DB per tenant** — tidak ada shared schema
2. **`no_hp` sebagai matching key** antara AKAR customer + SIMRS patient
3. **Tag tidak pernah dihapus** — hanya `aktif = false`
4. **Campaign selalu baca dari DB CRM** — bukan real-time dari SIMRS saat kirim
5. **NLP search 3 tahap** — library search → AI refine → konfirmasi admin → baru hit SIMRS
6. **ICD library di-copy ke setiap tenant DB** saat provisioning
7. **SIMRS delta sync** — hanya kirim record yang berubah sejak `last_sync_at`
8. **AI auto-tag hanya jika confidence > 80%** — di bawah itu masuk queue review manual
9. **`tenantSlug` tidak bisa diubah** setelah tenant dibuat (dipakai sebagai DB identifier)
10. **Channel adapter pattern** — semua channel (WA/IG/FB) dinormalisasi ke format unified inbox

---

## 12. YANG PERLU DIKONFIRMASI (pending eksternal)

> Jangan assume sudah resolved. Tanya user jika relevan dengan task.

| Item | Keterangan | Status |
|------|------------|--------|
| SIMRS endpoint format | Apakah field `updated_at` tersedia di response? | ⏳ Pending — tim IT |
| SIMRS master tindakan | Endpoint khusus yang diminta ke tim IT | ⏳ Pending — tim IT |
| Wappin webhook | Support `message.delivered`, `message.read`, `message.received`? | ⏳ Pending — negosiasi |
| Wappin rate limit | Max pesan/detik? Per nomor atau per akun? | ⏳ Pending — negosiasi |
| Meta API (IG/FB) | Apakah sudah ada akun bisnis terverifikasi? | ⏳ Pending — user |
| Nama platform SaaS | Nama resmi selain "CRM Platform"? | ⏳ Belum diputuskan |
| Harga / pricing plan | Model SaaS pricing (per pesan / per tenant / flat)? | ⏳ Belum diputuskan |
| Kegiatan Phase | Modul kegiatan masuk Phase 1 atau 3? | ⏳ Belum diputuskan |

---

*Terakhir diperbarui: 3 Juli 2026*
*File ini dikelola bersama antara developer dan Claude. Update segera jika ada keputusan baru.*
