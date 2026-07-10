-- CreateTable
CREATE TABLE "crm_meta_configs" (
    "id"               TEXT NOT NULL,
    "tenant_slug"      TEXT NOT NULL,
    "phone_number_id"  TEXT NOT NULL,
    "access_token"     TEXT NOT NULL,
    "waba_id"          TEXT,
    "aktif"            BOOLEAN NOT NULL DEFAULT true,
    "tested_at"        TIMESTAMP(3),
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_meta_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_meta_configs_tenant_slug_key" ON "crm_meta_configs"("tenant_slug");
