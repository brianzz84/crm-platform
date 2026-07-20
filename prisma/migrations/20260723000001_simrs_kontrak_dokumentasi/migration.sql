-- Dokumentasi kontrak API SIMRS sebagai fitur di dalam aplikasi (Pengaturan >
-- Integrasi SIMRS), bukan file terpisah — bisa diedit Admin IT langsung dari UI.
--
-- field_nama di crm_simrs_kontrak_fields sengaja tidak boleh menyimpang dari
-- SimrsKunjungan/SimrsPasien (simrs-client.ts). Status Wajib/Penting/Opsional
-- SENGAJA tidak disimpan di tabel manapun di sini — dihitung dari
-- WAJIB_KUNJUNGAN/PENTING_KUNJUNGAN dkk di simrs-diagnostik.ts, sumber yang sama
-- yang dipakai tools diagnostik untuk validasi sungguhan.

CREATE TABLE "crm_simrs_kontrak_fields" (
    "id"          TEXT         NOT NULL,
    "tenant_slug" TEXT         NOT NULL,
    "endpoint"    TEXT         NOT NULL,
    "field_nama"  TEXT         NOT NULL,
    "contoh"      TEXT,
    "catatan"     TEXT,
    "updated_at"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_simrs_kontrak_fields_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "crm_simrs_kontrak_fields_tenant_slug_endpoint_field_nama_key"
  ON "crm_simrs_kontrak_fields"("tenant_slug", "endpoint", "field_nama");

CREATE TABLE "crm_simrs_kontrak_items" (
    "id"          TEXT         NOT NULL,
    "tenant_slug" TEXT         NOT NULL,
    "bagian"      TEXT         NOT NULL,
    "judul"       TEXT,
    "isi"         TEXT         NOT NULL,
    "status"      TEXT,
    "urutan"      INTEGER      NOT NULL DEFAULT 0,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_simrs_kontrak_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "crm_simrs_kontrak_items_tenant_slug_bagian_idx"
  ON "crm_simrs_kontrak_items"("tenant_slug", "bagian");

CREATE TABLE "crm_simrs_kontrak_catatan" (
    "id"           TEXT         NOT NULL,
    "tenant_slug"  TEXT         NOT NULL,
    "catatan_umum" TEXT         NOT NULL DEFAULT '',
    "updated_at"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_simrs_kontrak_catatan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "crm_simrs_kontrak_catatan_tenant_slug_key"
  ON "crm_simrs_kontrak_catatan"("tenant_slug");
