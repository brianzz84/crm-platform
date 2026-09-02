-- Keluarga Media View Facebook — pengganti Reach/Impressions yang dihapus Meta.
--
-- Terbukti hidup lewat probe akun RKZ 2 Sep 2026:
--   page_media_view              30 titik harian
--   page_total_media_view_unique 30 titik harian
--
-- KOLOM SENDIRI, bukan menumpang `jangkauan`. Metodologi Meta berubah, jadi
-- angka baru tidak boleh disambungkan dengan riwayat jangkauan lama seolah satu
-- deret. Menaruhnya di kolom yang sama akan melakukan penyambungan itu diam-diam.
--
-- Idempoten: migrasi di proyek ini kerap dijalankan lewat psql langsung karena
-- `migrate deploy` tersandung P3005 pada basis data yang sudah berisi.
ALTER TABLE "crm_social_account_daily" ADD COLUMN IF NOT EXISTS "tayangan_media" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "crm_social_account_daily" ADD COLUMN IF NOT EXISTS "penonton_unik"  INTEGER NOT NULL DEFAULT 0;
