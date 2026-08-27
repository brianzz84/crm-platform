-- Riwayat penarikan terjadwal, satu baris per sumber per hari.
--
-- Idempoten: migrasi di proyek ini kerap dijalankan lewat psql langsung karena
-- `migrate deploy` tersandung P3005 pada basis data yang sudah berisi.

-- CREATE TYPE tidak mengenal IF NOT EXISTS, jadi dibungkus.
DO $$
BEGIN
  CREATE TYPE "SumberSnapshot" AS ENUM ('META', 'GOOGLE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "crm_snapshot_runs" (
  "id"          TEXT             NOT NULL,
  "tenant_slug" TEXT             NOT NULL,
  "sumber"      "SumberSnapshot" NOT NULL,
  "tanggal"     DATE             NOT NULL,
  "status"      TEXT             NOT NULL,
  "pesan"       TEXT,
  "durasi_ms"   INTEGER          NOT NULL DEFAULT 0,
  "dijalankan"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_snapshot_runs_pkey" PRIMARY KEY ("id")
);

-- Satu hasil per sumber per hari: penarikan ulang pada hari yang sama menimpa,
-- bukan menumpuk baris yang membuat deteksi hari bolong jadi menipu.
CREATE UNIQUE INDEX IF NOT EXISTS "crm_snapshot_runs_tenant_slug_sumber_tanggal_key"
  ON "crm_snapshot_runs" ("tenant_slug", "sumber", "tanggal");
CREATE INDEX IF NOT EXISTS "crm_snapshot_runs_tenant_slug_tanggal_idx"
  ON "crm_snapshot_runs" ("tenant_slug", "tanggal");
