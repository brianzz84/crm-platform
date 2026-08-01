-- Kredensial Google Business Profile per tenant (OAuth refresh token).
CREATE TABLE IF NOT EXISTS "crm_google_bisnis_configs" (
  "id"             TEXT NOT NULL,
  "tenant_slug"    TEXT NOT NULL,
  "client_id"      TEXT NOT NULL,
  "client_secret"  TEXT NOT NULL,
  "refresh_token"  TEXT NOT NULL,
  "account_id"     TEXT,
  "location_utama" TEXT,
  "aktif"          BOOLEAN NOT NULL DEFAULT true,
  "tested_at"      TIMESTAMP(3),
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_google_bisnis_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "crm_google_bisnis_configs_tenant_slug_key"
  ON "crm_google_bisnis_configs" ("tenant_slug");
