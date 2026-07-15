-- AI Partner: chat diskusi admin dengan AI untuk pencarian target marketing.
-- Tenant-scoped models (dijalankan di DB tiap tenant, bukan master).

CREATE TYPE "AiRuleKategori" AS ENUM ('PERILAKU', 'PERSONA', 'BATASAN');
CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT');

CREATE TABLE "crm_ai_partner_rules" (
    "id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "kategori" "AiRuleKategori" NOT NULL,
    "teks" TEXT NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_ai_partner_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "crm_ai_partner_rules_tenant_slug_aktif_idx" ON "crm_ai_partner_rules"("tenant_slug", "aktif");

CREATE TABLE "crm_ai_partner_sessions" (
    "id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "judul" TEXT NOT NULL DEFAULT 'Percakapan baru',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_ai_partner_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "crm_ai_partner_sessions_tenant_slug_created_by_idx" ON "crm_ai_partner_sessions"("tenant_slug", "created_by");

CREATE TABLE "crm_ai_partner_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tool_calls" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_ai_partner_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "crm_ai_partner_messages_session_id_idx" ON "crm_ai_partner_messages"("session_id");

ALTER TABLE "crm_ai_partner_messages" ADD CONSTRAINT "crm_ai_partner_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "crm_ai_partner_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
