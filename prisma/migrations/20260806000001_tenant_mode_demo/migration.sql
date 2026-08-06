-- Tenant peragaan: pesan keluar dicatat tapi tidak pernah benar-benar dikirim.
--
-- Idempoten. Migrasi di proyek ini kerap dijalankan ulang lewat psql langsung
-- karena `migrate deploy` tersandung P3005 pada basis data yang sudah berisi.
ALTER TABLE "crm_tenants"
  ADD COLUMN IF NOT EXISTS "mode_demo" BOOLEAN NOT NULL DEFAULT false;
