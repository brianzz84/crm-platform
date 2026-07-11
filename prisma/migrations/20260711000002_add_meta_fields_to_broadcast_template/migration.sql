ALTER TABLE "crm_broadcast_templates"
  ADD COLUMN IF NOT EXISTS "meta_template_id" TEXT,
  ADD COLUMN IF NOT EXISTS "meta_status"      TEXT,
  ADD COLUMN IF NOT EXISTS "meta_category"    TEXT;
