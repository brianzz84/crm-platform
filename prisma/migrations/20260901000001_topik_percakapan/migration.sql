-- Topik percakapan masuk — "orang menghubungi RKZ soal apa".
--
-- Dua kolom terpisah pada crm_conversations, bukan satu. `topik` dihitung
-- laporan; `topik_usulan` hanya usulan AI yang belum ditinjau. Menyatukannya
-- akan membuat tebakan mesin masuk ke laporan triwulan yang dibaca direksi
-- tanpa seorang pun pernah memeriksanya.
--
-- Idempoten: migrasi di proyek ini kerap dijalankan lewat psql langsung karena
-- `migrate deploy` tersandung P3005 pada basis data yang sudah berisi.

ALTER TABLE "crm_conversations" ADD COLUMN IF NOT EXISTS "topik"           TEXT;
ALTER TABLE "crm_conversations" ADD COLUMN IF NOT EXISTS "topik_usulan"    TEXT;
ALTER TABLE "crm_conversations" ADD COLUMN IF NOT EXISTS "topik_alasan"    TEXT;
ALTER TABLE "crm_conversations" ADD COLUMN IF NOT EXISTS "topik_usul_pada" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "crm_percakapan_topik_library" (
  "id"          TEXT         NOT NULL,
  "tenant_slug" TEXT         NOT NULL,
  "kode"        TEXT         NOT NULL,
  "nama"        TEXT         NOT NULL,
  "deskripsi"   TEXT,
  "warna"       TEXT         NOT NULL DEFAULT '#0089A8',
  "urutan"      INTEGER      NOT NULL DEFAULT 0,
  "aktif"       BOOLEAN      NOT NULL DEFAULT true,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_percakapan_topik_library_pkey" PRIMARY KEY ("id")
);

-- Kode kekal dan unik per tenant: ia dirujuk crm_conversations.topik.
CREATE UNIQUE INDEX IF NOT EXISTS "crm_percakapan_topik_library_tenant_slug_kode_key"
  ON "crm_percakapan_topik_library" ("tenant_slug", "kode");

CREATE INDEX IF NOT EXISTS "crm_percakapan_topik_library_tenant_slug_aktif_idx"
  ON "crm_percakapan_topik_library" ("tenant_slug", "aktif");

-- Menyaring "yang belum diusulkan" adalah kueri yang dijalankan tiap kali
-- klasifikasi berjalan, dan tiap kali halaman tinjauan dibuka.
CREATE INDEX IF NOT EXISTS "crm_conversations_tenant_slug_topik_idx"
  ON "crm_conversations" ("tenant_slug", "topik");
