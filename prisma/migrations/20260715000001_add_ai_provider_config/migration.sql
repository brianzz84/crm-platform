-- AlterTable: tambah pilihan provider AI per tenant (SaaS — admin IT bisa pilih Claude/Gemini)
CREATE TYPE "AiProvider" AS ENUM ('CLAUDE', 'GEMINI');

ALTER TABLE "crm_tenant_configs" ADD COLUMN "ai_provider" "AiProvider" NOT NULL DEFAULT 'CLAUDE';
ALTER TABLE "crm_tenant_configs" ADD COLUMN "ai_api_key" TEXT;
ALTER TABLE "crm_tenant_configs" ADD COLUMN "ai_model" TEXT;
