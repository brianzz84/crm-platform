-- Instagram Messaging lewat jalur Instagram Login (graph.instagram.com).
--
-- Kolom TERPISAH dari insights_token/access_token/ads_token. Menumpang salah
-- satunya sudah pernah mematikan fitur yang tidak berhubungan.
--
-- Idempoten: migrasi di proyek ini kerap dijalankan lewat psql langsung karena
-- `migrate deploy` tersandung P3005 pada basis data yang sudah berisi.
ALTER TABLE "crm_meta_configs" ADD COLUMN IF NOT EXISTS "ig_msg_token"        TEXT;
ALTER TABLE "crm_meta_configs" ADD COLUMN IF NOT EXISTS "ig_msg_user_id"      TEXT;
ALTER TABLE "crm_meta_configs" ADD COLUMN IF NOT EXISTS "ig_msg_username"     TEXT;
ALTER TABLE "crm_meta_configs" ADD COLUMN IF NOT EXISTS "ig_msg_expires_at"   TIMESTAMP(3);
ALTER TABLE "crm_meta_configs" ADD COLUMN IF NOT EXISTS "ig_msg_refreshed_at" TIMESTAMP(3);
ALTER TABLE "crm_meta_configs" ADD COLUMN IF NOT EXISTS "ig_msg_aktif"        BOOLEAN NOT NULL DEFAULT false;
