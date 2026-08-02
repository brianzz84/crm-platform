-- Satu sambungan Google per tenant untuk tiga layanan (Business Profile, YouTube,
-- Analytics). Tabel lama hanya melayani Business Profile; dinamai ulang karena kini
-- menampung ketiganya. Aman: tabel masih kosong saat migrasi ini dibuat.
ALTER TABLE IF EXISTS "crm_google_bisnis_configs" RENAME TO "crm_google_configs";

-- refresh_token kini diisi otomatis oleh alur OAuth, bukan diketik admin, sehingga
-- kredensial boleh disimpan lebih dulu sebelum tombol "Hubungkan" ditekan.
ALTER TABLE "crm_google_configs" ALTER COLUMN "refresh_token" SET DEFAULT '';

ALTER TABLE "crm_google_configs" ADD COLUMN IF NOT EXISTS "scopes"             TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "crm_google_configs" ADD COLUMN IF NOT EXISTS "connected_at"       TIMESTAMP(3);
ALTER TABLE "crm_google_configs" ADD COLUMN IF NOT EXISTS "connected_email"    TEXT;
ALTER TABLE "crm_google_configs" ADD COLUMN IF NOT EXISTS "ga4_property_id"    TEXT;
ALTER TABLE "crm_google_configs" ADD COLUMN IF NOT EXISTS "youtube_channel_id" TEXT;
