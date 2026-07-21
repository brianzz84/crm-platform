-- App ID Meta untuk resumable upload (contoh media header saat membuat template).
ALTER TABLE "crm_meta_configs" ADD COLUMN IF NOT EXISTS "app_id" TEXT;
