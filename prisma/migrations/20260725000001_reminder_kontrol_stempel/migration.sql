-- Stempel pengiriman pengingat kontrol per-rencana: sumber status dashboard & idempotency
-- (H-3/H-1 tidak bisa dibedakan dari SapaanLog, jadi disimpan di baris rencana itu sendiri).
ALTER TABLE "crm_simrs_rencana_kontrol"
  ADD COLUMN IF NOT EXISTS "reminder_h3_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reminder_h1_at" TIMESTAMP(3);
