-- AlterTable: hapus kolom meta_phone_number_id yang tidak diperlukan
-- Model integrasi adalah tenant-owned: setiap tenant punya Meta App sendiri,
-- tidak ada routing terpusat via phone_number_id di master DB.
ALTER TABLE "crm_tenant_configs" DROP COLUMN IF EXISTS "meta_phone_number_id";
