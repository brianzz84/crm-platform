-- Kredensial Threads. Jalur KETIGA, bukan cabang dari yang sudah ada.
--
-- Threads punya host, kredensial aplikasi, dan token yang sepenuhnya terpisah
-- dari Instagram maupun Facebook: token Instagram Login tidak berlaku di sana,
-- dan sebaliknya. Menumpangkannya ke kolom ig_msg_* akan membuat dua jalur
-- saling menimpa diam-diam.
--
-- `threads_expires_at` disimpan eksplisit karena token jalur ini MATI dalam 60
-- hari — berbeda dari Page token yang tidak pernah kedaluwarsa. Token yang mati
-- diam-diam sudah pernah menelan sepuluh hari tanpa disadari.
ALTER TABLE "crm_meta_configs"
  ADD COLUMN IF NOT EXISTS "threads_token"        TEXT,
  ADD COLUMN IF NOT EXISTS "threads_user_id"      TEXT,
  ADD COLUMN IF NOT EXISTS "threads_username"     TEXT,
  ADD COLUMN IF NOT EXISTS "threads_expires_at"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "threads_refreshed_at" TIMESTAMP(3);
