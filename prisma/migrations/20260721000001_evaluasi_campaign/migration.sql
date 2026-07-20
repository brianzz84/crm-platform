-- Panel evaluasi campaign: funnel + sentimen balasan + konversi kunjungan.
--
-- kode_layanan_promo menyimpan kode layanan (SimrsLayananLibrary.kode_barang) yang
-- benar-benar dipromosikan campaign ini, supaya evaluasi bisa membedakan konversi
-- LANGSUNG (kunjungan pakai kode ini) dari konversi ke PRODUK LAIN.
ALTER TABLE "crm_campaigns" ADD COLUMN "kode_layanan_promo" TEXT[] NOT NULL DEFAULT '{}';

-- Sentimen dihitung sekali (tombol "Hitung ulang"), bukan tiap halaman dibuka —
-- supaya stabil dan tidak memanggil AI berulang tanpa perlu.
ALTER TABLE "crm_campaign_recipients" ADD COLUMN "sentimen"        TEXT;
ALTER TABLE "crm_campaign_recipients" ADD COLUMN "sentimen_alasan" TEXT;
ALTER TABLE "crm_campaign_recipients" ADD COLUMN "sentimen_at"     TIMESTAMP(3);
