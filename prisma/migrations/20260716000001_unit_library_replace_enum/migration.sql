-- Unit library per-tenant menggantikan enum SimrsUnit yang hardcode.
-- Alasan: enum memaku struktur satu RS ke skema global (SAAS-FIRST, CLAUDE.md §9).

-- 1. Master unit per tenant
CREATE TABLE "crm_simrs_unit_library" (
    "id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "kelompok" TEXT NOT NULL,
    "warna" TEXT NOT NULL DEFAULT '#0089A8',
    "urutan" INTEGER NOT NULL DEFAULT 0,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_simrs_unit_library_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "crm_simrs_unit_library_tenant_slug_nama_key" ON "crm_simrs_unit_library"("tenant_slug", "nama");
CREATE INDEX "crm_simrs_unit_library_tenant_slug_aktif_idx" ON "crm_simrs_unit_library"("tenant_slug", "aktif");
CREATE INDEX "crm_simrs_unit_library_tenant_slug_kelompok_idx" ON "crm_simrs_unit_library"("tenant_slug", "kelompok");

-- 2. SimrsVisit.unit: enum -> text. Nilai lama dipetakan ke label manusiawi
--    yang sama dengan yang dipakai di kelompok library.
ALTER TABLE "crm_simrs_visits"
  ALTER COLUMN "unit" TYPE TEXT
  USING (CASE "unit"::text
    WHEN 'RAWAT_JALAN'  THEN 'Rawat Jalan'
    WHEN 'RAWAT_INAP'   THEN 'Rawat Inap'
    WHEN 'PENUNJANG'    THEN 'Penunjang'
    WHEN 'PONDOK_SEHAT' THEN 'Pondok Sehat'
    WHEN 'ONE_DAY_CARE' THEN 'One Day Care'
    WHEN 'HOME_CARE'    THEN 'Home Care'
    ELSE "unit"::text
  END);

-- 3. Enum tidak dipakai lagi
DROP TYPE "SimrsUnit";

-- 4. Index untuk filter per kelompok (dipakai pencarian segmen & AI Partner)
CREATE INDEX IF NOT EXISTS "crm_simrs_visits_unit_idx" ON "crm_simrs_visits"("unit");
