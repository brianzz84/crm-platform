-- AlterTable: tambah field kota/kecamatan terstruktur, terpisah dari alamat teks bebas
ALTER TABLE "crm_persons" ADD COLUMN "kota" TEXT;
ALTER TABLE "crm_persons" ADD COLUMN "kecamatan" TEXT;
