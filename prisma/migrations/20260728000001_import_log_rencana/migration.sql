-- Penghitung hasil impor untuk sheet "Rencana Kontrol" (jadwal kontrol/vaksin)
ALTER TABLE "crm_import_logs" ADD COLUMN IF NOT EXISTS "new_rencana"     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "crm_import_logs" ADD COLUMN IF NOT EXISTS "updated_rencana" INTEGER NOT NULL DEFAULT 0;
