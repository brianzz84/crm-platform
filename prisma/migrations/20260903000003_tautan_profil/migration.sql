-- `profile_links_taps` harian — metrik NIAT.
--
-- Terbukti ikut pada panggilan harian yang SUDAH ada (views, total_interactions,
-- likes, saves), jadi tidak menambah satu permintaan pun. Diuji 3 Sep 2026.
--
-- Instagram saja; Facebook tidak punya padanannya.
--
-- Idempoten: migrasi di proyek ini kerap dijalankan lewat psql langsung karena
-- `migrate deploy` tersandung P3005 pada basis data yang sudah berisi.
ALTER TABLE "crm_social_account_daily" ADD COLUMN IF NOT EXISTS "tautan_profil" INTEGER NOT NULL DEFAULT 0;
