-- Nama tampilan pengirim dari platform. Nullable: WhatsApp tidak menyediakannya.
ALTER TABLE "crm_conversations" ADD COLUMN IF NOT EXISTS "channel_user_name" TEXT;
