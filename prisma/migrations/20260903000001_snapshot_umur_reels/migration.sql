-- Metrik per jenis media pada snapshot umur konten.
--
-- Terbukti hidup lewat probe akun RKZ 2 Sep 2026, dan SALING EKSKLUSIF:
--   Reels/Video   : ig_reels_avg_watch_time, ig_reels_video_view_total_time, reels_skip_rate
--   Foto/Carousel : profile_visits, profile_activity, follows
--
-- NULLABLE dengan sengaja: null = tidak berlaku untuk jenis media ini, dibedakan
-- dari 0 yang berarti berlaku tetapi nilainya nol. Kalau dipaksa NOT NULL
-- DEFAULT 0, seluruh Reels akan tampak punya 0 kunjungan profil — angka yang
-- tidak pernah ada.
--
-- Alasan snapshot umur ini tidak tergantikan retensi API yang panjang: waktu
-- tonton bersifat kumulatif seumur hidup konten, jadi "rerata tonton pada hari
-- ke-7" hanya bisa diketahui bila diukur tepat di hari ketujuh.
--
-- Idempoten: migrasi di proyek ini kerap dijalankan lewat psql langsung karena
-- `migrate deploy` tersandung P3005 pada basis data yang sudah berisi.
ALTER TABLE "crm_social_content_snapshots" ADD COLUMN IF NOT EXISTS "aktivitas_profil" INTEGER;
ALTER TABLE "crm_social_content_snapshots" ADD COLUMN IF NOT EXISTS "rerata_tonton_ms" INTEGER;
ALTER TABLE "crm_social_content_snapshots" ADD COLUMN IF NOT EXISTS "total_tonton_ms"  INTEGER;
ALTER TABLE "crm_social_content_snapshots" ADD COLUMN IF NOT EXISTS "laju_lewat"       DOUBLE PRECISION;
