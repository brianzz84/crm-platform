-- Pengingat Vaksin: jadwal vaksin datang lewat feed rencana yang sama (sumber='vaksin'),
-- membawa jenis vaksin + catatan dokter. Horizon H-7 (selain H-3/H-1).
ALTER TABLE "crm_simrs_rencana_kontrol"
  ADD COLUMN IF NOT EXISTS "jenis_vaksin"   TEXT,
  ADD COLUMN IF NOT EXISTS "keterangan"     TEXT,
  ADD COLUMN IF NOT EXISTS "reminder_h7_at" TIMESTAMP(3);

-- Nilai enum baru untuk jenis sapaan.
ALTER TYPE "SapaanJenis" ADD VALUE IF NOT EXISTS 'VAKSIN_REMINDER';
