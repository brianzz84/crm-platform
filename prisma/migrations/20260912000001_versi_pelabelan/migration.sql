-- Versi taksonomi, prompt, dan model pada tiap hasil klasifikasi.
--
-- MENGAPA SEKARANG, BUKAN NANTI: definisi kategori SUDAH pernah berubah —
-- uraian INFO_UMUM diperbaiki setelah ditemukan model membacanya sebagai izin.
-- Label sebelum dan sesudah perbaikan itu berasal dari definisi yang berbeda
-- tetapi tersimpan identik, sehingga membandingkan dua periode laporan akan
-- TAMPAK SAH PADAHAL TIDAK.
--
-- Jendela termurah mengerjakannya adalah saat label masih sedikit. Per hari ini
-- baru 600 dari 2.531 sebutan yang berlabel; menundanya berarti menambal ribuan
-- baris secara retroaktif dengan versi yang hanya bisa ditebak.
--
-- Nullable dengan sengaja: baris lama memang TIDAK DIKETAHUI versinya, dan
-- mengisinya dengan tebakan lebih buruk daripada mengakui tidak tahu.
ALTER TABLE "crm_sebutan_labels"
  ADD COLUMN IF NOT EXISTS "taxonomy_version" TEXT,
  ADD COLUMN IF NOT EXISTS "prompt_version"   TEXT,
  ADD COLUMN IF NOT EXISTS "model_version"    TEXT;

ALTER TABLE "crm_conversation_labels"
  ADD COLUMN IF NOT EXISTS "taxonomy_version" TEXT,
  ADD COLUMN IF NOT EXISTS "prompt_version"   TEXT,
  ADD COLUMN IF NOT EXISTS "model_version"    TEXT;
