-- Token khusus Marketing API, terpisah dari access_token (WhatsApp) dan
-- insights_token (analitik Page/IG).
--
-- Marketing API tidak dilayani token Halaman; ia menuntut token Pengguna atau
-- System User. Menimpa insights_token yang sekarang berjalan akan mematikan
-- analitik Kanal Publik dan penarikan DM.
--
-- Idempoten: migrasi di proyek ini kerap dijalankan lewat psql langsung.
ALTER TABLE "crm_meta_configs"
  ADD COLUMN IF NOT EXISTS "ads_token" TEXT;
