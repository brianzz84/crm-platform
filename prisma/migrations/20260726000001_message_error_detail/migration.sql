-- Simpan alasan gagal pengiriman pesan chat (mis. error 131047 = di luar jendela 24 jam)
ALTER TABLE "crm_messages" ADD COLUMN IF NOT EXISTS "error_detail" TEXT;
