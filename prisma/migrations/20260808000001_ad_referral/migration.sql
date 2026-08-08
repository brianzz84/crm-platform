-- Jejak iklan yang mengantar seseorang masuk ke percakapan.
--
-- Idempoten: migrasi di proyek ini kerap dijalankan lewat psql langsung karena
-- `migrate deploy` tersandung P3005 pada basis data yang sudah berisi.
CREATE TABLE IF NOT EXISTS "crm_ad_referrals" (
  "id"                  TEXT         NOT NULL,
  "tenant_slug"         TEXT         NOT NULL,
  "conversation_id"     TEXT         NOT NULL,
  "message_external_id" TEXT         NOT NULL,
  "channel"             "Channel"    NOT NULL DEFAULT 'WA',
  "ctwa_clid"           TEXT,
  "source_id"           TEXT,
  "source_type"         TEXT,
  "source_url"          TEXT,
  "headline"            TEXT,
  "body"                TEXT,
  "media_type"          TEXT,
  "raw"                 JSONB,
  "occurred_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_ad_referrals_pkey" PRIMARY KEY ("id")
);

-- Penjaga idempotensi webhook: Meta mengirim ulang saat gagal, dan tanpa ini
-- satu klik iklan bisa tercatat berkali-kali lalu melipatgandakan angka konversi.
CREATE UNIQUE INDEX IF NOT EXISTS "crm_ad_referrals_tenant_slug_message_external_id_key"
  ON "crm_ad_referrals" ("tenant_slug", "message_external_id");

CREATE INDEX IF NOT EXISTS "crm_ad_referrals_tenant_slug_ctwa_clid_idx"
  ON "crm_ad_referrals" ("tenant_slug", "ctwa_clid");
CREATE INDEX IF NOT EXISTS "crm_ad_referrals_tenant_slug_source_id_idx"
  ON "crm_ad_referrals" ("tenant_slug", "source_id");
CREATE INDEX IF NOT EXISTS "crm_ad_referrals_conversation_id_idx"
  ON "crm_ad_referrals" ("conversation_id");

DO $$
BEGIN
  ALTER TABLE "crm_ad_referrals"
    ADD CONSTRAINT "crm_ad_referrals_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "crm_conversations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
