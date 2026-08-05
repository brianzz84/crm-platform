-- ID pesan dari platform asal + kunci idempotensi penarikan riwayat.
ALTER TABLE "crm_messages" ADD COLUMN IF NOT EXISTS "external_id" TEXT;

-- PARTIAL index: hanya baris yang punya external_id yang dijaga keunikannya.
-- Unique biasa tidak bisa dipakai karena kolomnya nullable — Postgres menganggap
-- tiap NULL berbeda sehingga constraint-nya diam-diam tidak mencegah apa pun,
-- dan pesan WhatsApp yang memang tidak punya ID eksternal akan lolos berkali-kali.
CREATE UNIQUE INDEX IF NOT EXISTS "crm_messages_external_id_key"
  ON "crm_messages"("conversation_id", "external_id") WHERE "external_id" IS NOT NULL;
