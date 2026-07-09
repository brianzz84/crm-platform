-- CreateEnum
CREATE TYPE "ContactJenis" AS ENUM ('HP', 'WA', 'EMAIL', 'TELEPON_RUMAH');

-- DropIndex
DROP INDEX "crm_persons_tenant_slug_no_hp_key";

-- AlterTable
ALTER TABLE "crm_campaign_recipients" ADD COLUMN     "error_code" TEXT,
ADD COLUMN     "error_detail" TEXT,
ADD COLUMN     "nama" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "crm_campaigns" DROP COLUMN "pesan",
ADD COLUMN     "error_summary" JSONB,
ADD COLUMN     "finished_at" TIMESTAMP(3),
ADD COLUMN     "started_at" TIMESTAMP(3),
ADD COLUMN     "template_params" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "total_gagal" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "crm_icd_library" ADD COLUMN     "versi" TEXT NOT NULL DEFAULT 'ICD10';

-- AlterTable
ALTER TABLE "crm_icd_library_global" ADD COLUMN     "versi" TEXT NOT NULL DEFAULT 'ICD10';

-- AlterTable
ALTER TABLE "crm_persons" ADD COLUMN     "akar_kode" TEXT,
ADD COLUMN     "alamat" TEXT,
ADD COLUMN     "jenis_kelamin" TEXT,
ADD COLUMN     "kategori" TEXT,
ADD COLUMN     "nik" TEXT,
ADD COLUMN     "pekerjaan" TEXT,
ALTER COLUMN "no_hp" DROP NOT NULL;

-- AlterTable
ALTER TABLE "crm_sapaan_logs" ADD COLUMN     "error_msg" TEXT,
ADD COLUMN     "message_id" TEXT;

-- AlterTable
ALTER TABLE "crm_simrs_layanan_library" DROP COLUMN "unit",
ADD COLUMN     "jenis" TEXT NOT NULL,
ADD COLUMN     "kelompok" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "crm_tenant_configs" DROP COLUMN "wappin_api_key",
DROP COLUMN "wappin_phone_number";

-- AlterTable
ALTER TABLE "crm_tenant_profile" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "crm_push_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_wappin_configs" (
    "id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "api_version" TEXT NOT NULL DEFAULT 'v2',
    "client_id" TEXT,
    "project_id" TEXT,
    "secret_key" TEXT,
    "username" TEXT,
    "password" TEXT,
    "base_url" TEXT NOT NULL DEFAULT 'https://api.chat.wappin.app',
    "login_url" TEXT NOT NULL DEFAULT '/auth/login',
    "messages_url" TEXT NOT NULL DEFAULT '/v1/messages',
    "namespace" TEXT,
    "webhook_secret" TEXT NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "tested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_wappin_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_eflyer_configs" (
    "id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT false,
    "api_url" TEXT,
    "api_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_eflyer_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_broadcast_templates" (
    "id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "template_name" TEXT NOT NULL,
    "template_namespace" TEXT,
    "template_language" TEXT NOT NULL DEFAULT 'id',
    "components_schema" JSONB NOT NULL DEFAULT '[]',
    "preview_text" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_broadcast_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_person_contacts" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "jenis" "ContactJenis" NOT NULL,
    "nilai" TEXT NOT NULL,
    "label" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_wa_aktif" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_person_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_kegiatan" (
    "id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "jenis" TEXT NOT NULL,
    "tanggal_mulai" TIMESTAMP(3) NOT NULL,
    "tanggal_selesai" TIMESTAMP(3),
    "lokasi" TEXT,
    "penyelenggara" TEXT,
    "keterangan" TEXT,
    "poin_kegiatan" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'selesai',
    "qr_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_kegiatan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_kegiatan_peserta" (
    "id" TEXT NOT NULL,
    "kegiatan_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "hadir" BOOLEAN NOT NULL DEFAULT true,
    "poin_diberikan" INTEGER NOT NULL DEFAULT 0,
    "sumber" TEXT NOT NULL DEFAULT 'admin',
    "catatan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_kegiatan_peserta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_kontak_langsung" (
    "id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "sub_tipe" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "catatan" TEXT,
    "operator_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_kontak_langsung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_loyalty_rules" (
    "id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "jenis" TEXT NOT NULL,
    "poin" INTEGER NOT NULL DEFAULT 0,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "keterangan" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_loyalty_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_loyalty_transactions" (
    "id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "jenis" TEXT NOT NULL,
    "poin" INTEGER NOT NULL,
    "ref_id" TEXT,
    "keterangan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_push_subscriptions_endpoint_key" ON "crm_push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "crm_push_subscriptions_tenant_slug_idx" ON "crm_push_subscriptions"("tenant_slug");

-- CreateIndex
CREATE INDEX "crm_push_subscriptions_user_id_idx" ON "crm_push_subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_wappin_configs_tenant_slug_key" ON "crm_wappin_configs"("tenant_slug");

-- CreateIndex
CREATE UNIQUE INDEX "crm_eflyer_configs_tenant_slug_key" ON "crm_eflyer_configs"("tenant_slug");

-- CreateIndex
CREATE INDEX "crm_broadcast_templates_tenant_slug_idx" ON "crm_broadcast_templates"("tenant_slug");

-- CreateIndex
CREATE UNIQUE INDEX "crm_broadcast_templates_tenant_slug_template_name_key" ON "crm_broadcast_templates"("tenant_slug", "template_name");

-- CreateIndex
CREATE INDEX "crm_person_contacts_tenant_slug_nilai_idx" ON "crm_person_contacts"("tenant_slug", "nilai");

-- CreateIndex
CREATE INDEX "crm_person_contacts_person_id_idx" ON "crm_person_contacts"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_person_contacts_person_id_nilai_key" ON "crm_person_contacts"("person_id", "nilai");

-- CreateIndex
CREATE UNIQUE INDEX "crm_kegiatan_qr_token_key" ON "crm_kegiatan"("qr_token");

-- CreateIndex
CREATE INDEX "crm_kegiatan_tenant_slug_idx" ON "crm_kegiatan"("tenant_slug");

-- CreateIndex
CREATE INDEX "crm_kegiatan_tanggal_mulai_idx" ON "crm_kegiatan"("tanggal_mulai");

-- CreateIndex
CREATE INDEX "crm_kegiatan_peserta_person_id_idx" ON "crm_kegiatan_peserta"("person_id");

-- CreateIndex
CREATE INDEX "crm_kegiatan_peserta_tenant_slug_idx" ON "crm_kegiatan_peserta"("tenant_slug");

-- CreateIndex
CREATE UNIQUE INDEX "crm_kegiatan_peserta_kegiatan_id_person_id_key" ON "crm_kegiatan_peserta"("kegiatan_id", "person_id");

-- CreateIndex
CREATE INDEX "crm_kontak_langsung_person_id_idx" ON "crm_kontak_langsung"("person_id");

-- CreateIndex
CREATE INDEX "crm_kontak_langsung_tenant_slug_idx" ON "crm_kontak_langsung"("tenant_slug");

-- CreateIndex
CREATE UNIQUE INDEX "crm_loyalty_rules_tenant_slug_jenis_key" ON "crm_loyalty_rules"("tenant_slug", "jenis");

-- CreateIndex
CREATE INDEX "crm_loyalty_transactions_person_id_idx" ON "crm_loyalty_transactions"("person_id");

-- CreateIndex
CREATE INDEX "crm_loyalty_transactions_tenant_slug_idx" ON "crm_loyalty_transactions"("tenant_slug");

-- CreateIndex
CREATE UNIQUE INDEX "crm_campaign_recipients_wappin_message_id_key" ON "crm_campaign_recipients"("wappin_message_id");

-- CreateIndex
CREATE INDEX "crm_campaign_recipients_wappin_message_id_idx" ON "crm_campaign_recipients"("wappin_message_id");

-- CreateIndex
CREATE INDEX "crm_campaigns_jadwal_kirim_idx" ON "crm_campaigns"("jadwal_kirim");

-- CreateIndex
CREATE INDEX "crm_persons_tenant_slug_no_hp_idx" ON "crm_persons"("tenant_slug", "no_hp");

-- CreateIndex
CREATE INDEX "crm_persons_nik_idx" ON "crm_persons"("nik");

-- CreateIndex
CREATE INDEX "crm_persons_akar_kode_idx" ON "crm_persons"("akar_kode");

-- CreateIndex
CREATE INDEX "crm_sapaan_logs_tenant_slug_person_id_jenis_idx" ON "crm_sapaan_logs"("tenant_slug", "person_id", "jenis");

-- CreateIndex
CREATE INDEX "crm_simrs_layanan_library_kelompok_idx" ON "crm_simrs_layanan_library"("kelompok");

-- CreateIndex
CREATE INDEX "crm_simrs_layanan_library_jenis_idx" ON "crm_simrs_layanan_library"("jenis");

-- AddForeignKey
ALTER TABLE "crm_campaigns" ADD CONSTRAINT "crm_campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "crm_broadcast_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_sapaan_logs" ADD CONSTRAINT "crm_sapaan_logs_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "crm_persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_person_contacts" ADD CONSTRAINT "crm_person_contacts_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "crm_persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_kegiatan_peserta" ADD CONSTRAINT "crm_kegiatan_peserta_kegiatan_id_fkey" FOREIGN KEY ("kegiatan_id") REFERENCES "crm_kegiatan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_kegiatan_peserta" ADD CONSTRAINT "crm_kegiatan_peserta_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "crm_persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_kontak_langsung" ADD CONSTRAINT "crm_kontak_langsung_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "crm_persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_loyalty_transactions" ADD CONSTRAINT "crm_loyalty_transactions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "crm_persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

