-- CreateTable
CREATE TABLE IF NOT EXISTS "crm_tenant_profile" (
    "id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "nama_klinik" TEXT NOT NULL,
    "nama_rs" TEXT NOT NULL,
    "logo_url" TEXT,
    "alamat" TEXT,
    "telp" TEXT,
    "email" TEXT,
    "website" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_tenant_profile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "crm_tenant_profile_tenant_slug_key" ON "crm_tenant_profile"("tenant_slug");
