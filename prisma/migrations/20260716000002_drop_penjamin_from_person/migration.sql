-- Penjamin adalah atribut KUNJUNGAN, bukan orang. Field di person hanya
-- "cache kunjungan terakhir" yang menyesatkan untuk orang dengan >1 penjamin
-- berbeda (di RKZ sudah ada 68 orang seperti itu) dan hampir tak terisi
-- (1 dari 2.195). Dihapus; sumber kebenaran = SimrsVisit.
-- no_bpjs TIDAK dihapus — itu memang atribut orang.
ALTER TABLE "crm_persons" DROP COLUMN IF EXISTS "jenis_pembayaran";
ALTER TABLE "crm_persons" DROP COLUMN IF EXISTS "nama_instansi";
ALTER TABLE "crm_persons" DROP COLUMN IF EXISTS "kode_instansi";
