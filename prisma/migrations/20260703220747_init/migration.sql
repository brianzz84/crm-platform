-- CreateEnum
CREATE TYPE "TenantPlan" AS ENUM ('TRIAL', 'STARTER', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN_IT', 'ADMIN_OPS', 'SUPERVISOR', 'AGEN');

-- CreateEnum
CREATE TYPE "TagSource" AS ENUM ('manual', 'auto_ai', 'kegiatan', 'broadcast', 'simrs_sync', 'akar_migrasi');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('WA', 'IG', 'FB');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('incoming', 'outgoing');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "SimrsUnit" AS ENUM ('RAWAT_JALAN', 'RAWAT_INAP', 'PENUNJANG');

-- CreateEnum
CREATE TYPE "SapaanJenis" AS ENUM ('ULTAH', 'HARI_RAYA', 'KONTROL_REMINDER');

-- CreateEnum
CREATE TYPE "ImportSumber" AS ENUM ('EXCEL', 'SIMRS_API');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "crm_tenants" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" "TenantPlan" NOT NULL DEFAULT 'TRIAL',
    "database_url" TEXT NOT NULL,
    "custom_domain" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_tenant_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "simrs_base_url" TEXT,
    "simrs_api_key" TEXT,
    "wappin_api_key" TEXT,
    "wappin_phone_number" TEXT,
    "meta_access_token" TEXT,
    "ai_enabled" BOOLEAN NOT NULL DEFAULT false,
    "max_broadcast_per_month" INTEGER NOT NULL DEFAULT 1000,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_tenant_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_icd_library_global" (
    "id" TEXT NOT NULL,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "nama_id" TEXT NOT NULL,
    "bab" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "crm_icd_library_global_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_app_users" (
    "id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "roles" "UserRole"[],
    "aktif" BOOLEAN NOT NULL DEFAULT false,
    "invite_token" TEXT,
    "invite_expires_at" TIMESTAMP(3),
    "reset_token" TEXT,
    "reset_expires_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_app_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_persons" (
    "id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "no_hp" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "tanggal_lahir" TIMESTAMP(3),
    "no_rm" TEXT,
    "simrs_patient_id" TEXT,
    "last_simrs_sync_at" TIMESTAMP(3),
    "akar_id" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_tags" (
    "id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "warna" TEXT NOT NULL DEFAULT '#0089A8',
    "keterangan" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_person_tags" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "sumber" "TagSource" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_person_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_simrs_visits" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "unit" "SimrsUnit" NOT NULL,
    "poli" TEXT,
    "dokter" TEXT,
    "diagnosa_nama" TEXT,
    "diagnosa_icd" TEXT,
    "tindakan" TEXT,
    "simrs_visit_id" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "crm_simrs_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_simrs_layanan_library" (
    "id" TEXT NOT NULL,
    "kode_barang" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "unit" "SimrsUnit" NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "crm_simrs_layanan_library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_icd_library" (
    "id" TEXT NOT NULL,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "nama_id" TEXT NOT NULL,
    "bab" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "crm_icd_library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_segments" (
    "id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "deskripsi" TEXT,
    "nlp_query" TEXT,
    "simrs_params" JSONB,
    "last_refresh_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_segment_persons" (
    "segment_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_segment_persons_pkey" PRIMARY KEY ("segment_id","person_id")
);

-- CreateTable
CREATE TABLE "crm_campaigns" (
    "id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "channel" "Channel" NOT NULL DEFAULT 'WA',
    "template_id" TEXT,
    "pesan" TEXT NOT NULL,
    "segment_id" TEXT,
    "jadwal_kirim" TIMESTAMP(3),
    "total_penerima" INTEGER NOT NULL DEFAULT 0,
    "total_terkirim" INTEGER NOT NULL DEFAULT 0,
    "total_diterima" INTEGER NOT NULL DEFAULT 0,
    "total_dibaca" INTEGER NOT NULL DEFAULT 0,
    "total_dibalas" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "no_hp" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDING',
    "wappin_message_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "replied_at" TIMESTAMP(3),

    CONSTRAINT "crm_campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_conversations" (
    "id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "person_id" TEXT,
    "channel" "Channel" NOT NULL,
    "channel_user_id" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "assigned_to" TEXT,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "content" TEXT NOT NULL,
    "media_url" TEXT,
    "media_type" TEXT,
    "is_internal_note" BOOLEAN NOT NULL DEFAULT false,
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDING',
    "wappin_message_id" TEXT,
    "sent_by" TEXT,
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_sapaan_configs" (
    "id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "jenis" "SapaanJenis" NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT false,
    "template" TEXT NOT NULL,
    "jam_kirim" INTEGER NOT NULL DEFAULT 7,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_sapaan_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_sapaan_logs" (
    "id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "jenis" "SapaanJenis" NOT NULL,
    "person_id" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_sapaan_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_tag_rules" (
    "id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "icd_codes" TEXT[],
    "icd_exclude" TEXT[],
    "keyword_include" TEXT[],
    "keyword_exclude" TEXT[],
    "instruksi_ai" TEXT NOT NULL,
    "contoh_positif" TEXT[],
    "contoh_negatif" TEXT[],
    "confidence_min" DOUBLE PRECISION NOT NULL DEFAULT 0.80,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_tag_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_import_logs" (
    "id" TEXT NOT NULL,
    "tenant_slug" TEXT NOT NULL,
    "sumber" "ImportSumber" NOT NULL DEFAULT 'EXCEL',
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "filename" TEXT,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "processed_rows" INTEGER NOT NULL DEFAULT 0,
    "new_persons" INTEGER NOT NULL DEFAULT 0,
    "updated_persons" INTEGER NOT NULL DEFAULT 0,
    "new_visits" INTEGER NOT NULL DEFAULT 0,
    "skipped_rows" INTEGER NOT NULL DEFAULT 0,
    "error_detail" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,

    CONSTRAINT "crm_import_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_tenants_slug_key" ON "crm_tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "crm_tenant_configs_tenant_id_key" ON "crm_tenant_configs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_icd_library_global_kode_key" ON "crm_icd_library_global"("kode");

-- CreateIndex
CREATE INDEX "crm_icd_library_global_kode_idx" ON "crm_icd_library_global"("kode");

-- CreateIndex
CREATE INDEX "crm_icd_library_global_nama_id_idx" ON "crm_icd_library_global"("nama_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_app_users_invite_token_key" ON "crm_app_users"("invite_token");

-- CreateIndex
CREATE UNIQUE INDEX "crm_app_users_reset_token_key" ON "crm_app_users"("reset_token");

-- CreateIndex
CREATE INDEX "crm_app_users_tenant_slug_idx" ON "crm_app_users"("tenant_slug");

-- CreateIndex
CREATE UNIQUE INDEX "crm_app_users_tenant_slug_email_key" ON "crm_app_users"("tenant_slug", "email");

-- CreateIndex
CREATE INDEX "crm_persons_tenant_slug_idx" ON "crm_persons"("tenant_slug");

-- CreateIndex
CREATE INDEX "crm_persons_no_rm_idx" ON "crm_persons"("no_rm");

-- CreateIndex
CREATE UNIQUE INDEX "crm_persons_tenant_slug_no_hp_key" ON "crm_persons"("tenant_slug", "no_hp");

-- CreateIndex
CREATE INDEX "crm_tags_tenant_slug_idx" ON "crm_tags"("tenant_slug");

-- CreateIndex
CREATE UNIQUE INDEX "crm_tags_tenant_slug_name_key" ON "crm_tags"("tenant_slug", "name");

-- CreateIndex
CREATE INDEX "crm_person_tags_person_id_idx" ON "crm_person_tags"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_person_tags_person_id_tag_id_key" ON "crm_person_tags"("person_id", "tag_id");

-- CreateIndex
CREATE INDEX "crm_simrs_visits_person_id_idx" ON "crm_simrs_visits"("person_id");

-- CreateIndex
CREATE INDEX "crm_simrs_visits_tanggal_idx" ON "crm_simrs_visits"("tanggal");

-- CreateIndex
CREATE UNIQUE INDEX "crm_simrs_visits_person_id_simrs_visit_id_key" ON "crm_simrs_visits"("person_id", "simrs_visit_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_simrs_layanan_library_kode_barang_key" ON "crm_simrs_layanan_library"("kode_barang");

-- CreateIndex
CREATE INDEX "crm_simrs_layanan_library_nama_idx" ON "crm_simrs_layanan_library"("nama");

-- CreateIndex
CREATE UNIQUE INDEX "crm_icd_library_kode_key" ON "crm_icd_library"("kode");

-- CreateIndex
CREATE INDEX "crm_icd_library_kode_idx" ON "crm_icd_library"("kode");

-- CreateIndex
CREATE INDEX "crm_icd_library_nama_id_idx" ON "crm_icd_library"("nama_id");

-- CreateIndex
CREATE INDEX "crm_segments_tenant_slug_idx" ON "crm_segments"("tenant_slug");

-- CreateIndex
CREATE INDEX "crm_campaigns_tenant_slug_idx" ON "crm_campaigns"("tenant_slug");

-- CreateIndex
CREATE INDEX "crm_campaigns_status_idx" ON "crm_campaigns"("status");

-- CreateIndex
CREATE INDEX "crm_campaign_recipients_campaign_id_idx" ON "crm_campaign_recipients"("campaign_id");

-- CreateIndex
CREATE INDEX "crm_campaign_recipients_no_hp_idx" ON "crm_campaign_recipients"("no_hp");

-- CreateIndex
CREATE UNIQUE INDEX "crm_campaign_recipients_campaign_id_person_id_key" ON "crm_campaign_recipients"("campaign_id", "person_id");

-- CreateIndex
CREATE INDEX "crm_conversations_tenant_slug_idx" ON "crm_conversations"("tenant_slug");

-- CreateIndex
CREATE INDEX "crm_conversations_status_idx" ON "crm_conversations"("status");

-- CreateIndex
CREATE INDEX "crm_conversations_last_message_at_idx" ON "crm_conversations"("last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "crm_conversations_tenant_slug_channel_channel_user_id_key" ON "crm_conversations"("tenant_slug", "channel", "channel_user_id");

-- CreateIndex
CREATE INDEX "crm_messages_conversation_id_idx" ON "crm_messages"("conversation_id");

-- CreateIndex
CREATE INDEX "crm_messages_created_at_idx" ON "crm_messages"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "crm_sapaan_configs_tenant_slug_jenis_key" ON "crm_sapaan_configs"("tenant_slug", "jenis");

-- CreateIndex
CREATE INDEX "crm_sapaan_logs_tenant_slug_jenis_idx" ON "crm_sapaan_logs"("tenant_slug", "jenis");

-- CreateIndex
CREATE INDEX "crm_tag_rules_tenant_slug_idx" ON "crm_tag_rules"("tenant_slug");

-- CreateIndex
CREATE UNIQUE INDEX "crm_tag_rules_tenant_slug_tag_id_key" ON "crm_tag_rules"("tenant_slug", "tag_id");

-- CreateIndex
CREATE INDEX "crm_import_logs_tenant_slug_idx" ON "crm_import_logs"("tenant_slug");

-- CreateIndex
CREATE INDEX "crm_import_logs_status_idx" ON "crm_import_logs"("status");

-- AddForeignKey
ALTER TABLE "crm_tenant_configs" ADD CONSTRAINT "crm_tenant_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "crm_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_person_tags" ADD CONSTRAINT "crm_person_tags_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "crm_persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_person_tags" ADD CONSTRAINT "crm_person_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "crm_tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_simrs_visits" ADD CONSTRAINT "crm_simrs_visits_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "crm_persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_segment_persons" ADD CONSTRAINT "crm_segment_persons_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "crm_segments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_campaigns" ADD CONSTRAINT "crm_campaigns_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "crm_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_campaigns" ADD CONSTRAINT "crm_campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "crm_app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_campaign_recipients" ADD CONSTRAINT "crm_campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "crm_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_campaign_recipients" ADD CONSTRAINT "crm_campaign_recipients_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "crm_persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_conversations" ADD CONSTRAINT "crm_conversations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "crm_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_conversations" ADD CONSTRAINT "crm_conversations_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "crm_app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_messages" ADD CONSTRAINT "crm_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "crm_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_messages" ADD CONSTRAINT "crm_messages_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "crm_app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tag_rules" ADD CONSTRAINT "crm_tag_rules_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "crm_tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
