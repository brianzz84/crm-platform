-- Config Meta untuk analitik medsos (Fase 0): Page, IG Business, Ad Account, token Insights.
ALTER TABLE "crm_meta_configs"
  ADD COLUMN IF NOT EXISTS "page_id"        TEXT,
  ADD COLUMN IF NOT EXISTS "ig_business_id" TEXT,
  ADD COLUMN IF NOT EXISTS "ad_account_id"  TEXT,
  ADD COLUMN IF NOT EXISTS "insights_token" TEXT;
