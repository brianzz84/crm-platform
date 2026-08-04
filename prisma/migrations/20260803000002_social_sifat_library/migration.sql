-- Master sifat konten per tenant. Idempoten — migrasi prod dijalankan lewat psql
-- langsung karena riwayat migrasi di prod tidak sinkron (P3005).

CREATE TABLE IF NOT EXISTS "crm_social_sifat_library" (
  "id"          TEXT NOT NULL,
  "tenant_slug" TEXT NOT NULL,
  "kode"        TEXT NOT NULL,
  "nama"        TEXT NOT NULL,
  "deskripsi"   TEXT,
  "warna"       TEXT NOT NULL DEFAULT '#0089A8',
  "urutan"      INTEGER NOT NULL DEFAULT 0,
  "aktif"       BOOLEAN NOT NULL DEFAULT true,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "crm_social_sifat_library_pkey" PRIMARY KEY ("id")
);

-- Kode adalah rujukan yang dipegang SocialContent.sifat, jadi keunikannya per
-- tenant wajib dijaga di level basis data — bukan hanya di validasi aplikasi.
CREATE UNIQUE INDEX IF NOT EXISTS "crm_social_sifat_library_tenant_slug_kode_key"
  ON "crm_social_sifat_library"("tenant_slug", "kode");
CREATE INDEX IF NOT EXISTS "crm_social_sifat_library_tenant_slug_aktif_idx"
  ON "crm_social_sifat_library"("tenant_slug", "aktif");
