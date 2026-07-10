-- AlterTable: tambah meta_phone_number_id ke master TenantConfig
-- Dipakai sebagai lookup key untuk routing webhook Meta SaaS (satu App untuk semua tenant)
ALTER TABLE "crm_tenant_configs" ADD COLUMN "meta_phone_number_id" TEXT;
