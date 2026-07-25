-- Jenis konversi campaign: KUNJUNGAN (default, lama) atau KEGIATAN (mendaftar event target).
DO $$ BEGIN
  CREATE TYPE "KonversiJenis" AS ENUM ('KUNJUNGAN', 'KEGIATAN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "crm_campaigns"
  ADD COLUMN IF NOT EXISTS "jenis_konversi" "KonversiJenis" NOT NULL DEFAULT 'KUNJUNGAN',
  ADD COLUMN IF NOT EXISTS "konversi_kegiatan_id" TEXT;
