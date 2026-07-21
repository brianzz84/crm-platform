-- Jadwal kontrol / rencana kunjungan jadi entitas terpisah dari kunjungan.
-- DO: kunjungan = SUDAH terjadi (immutable, keyed nomor transaksi); rencana kontrol =
-- BELUM terjadi (bisa berubah/batal, dari tabel jadwal SIMRS yang berbeda-beda).

-- 1. Kolom jadwal_kontrol di kunjungan tidak dipakai lagi — pindah ke tabel rencana.
ALTER TABLE "crm_simrs_visits" DROP COLUMN IF EXISTS "jadwal_kontrol";

-- 2. Tabel rencana kontrol
CREATE TABLE "crm_simrs_rencana_kontrol" (
    "id"                 TEXT         NOT NULL,
    "tenant_slug"        TEXT         NOT NULL,
    "person_id"          TEXT         NOT NULL,
    "no_rm_sumber"       TEXT         NOT NULL,
    "rencana_id_sumber"  TEXT         NOT NULL,
    "tanggal_rencana"    TIMESTAMP(3) NOT NULL,
    "sumber"             TEXT         NOT NULL,
    "unit"               TEXT,
    "poli"               TEXT,
    "status"             TEXT         NOT NULL DEFAULT 'terjadwal',
    "last_simrs_sync_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_simrs_rencana_kontrol_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "crm_simrs_rencana_kontrol"
  ADD CONSTRAINT "crm_simrs_rencana_kontrol_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "crm_persons"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE UNIQUE INDEX "crm_simrs_rencana_kontrol_tenant_slug_rencana_id_sumber_key"
  ON "crm_simrs_rencana_kontrol"("tenant_slug", "rencana_id_sumber");
CREATE INDEX "crm_simrs_rencana_kontrol_person_id_idx"
  ON "crm_simrs_rencana_kontrol"("person_id");
CREATE INDEX "crm_simrs_rencana_kontrol_tenant_slug_tanggal_rencana_idx"
  ON "crm_simrs_rencana_kontrol"("tenant_slug", "tanggal_rencana");
CREATE INDEX "crm_simrs_rencana_kontrol_tenant_slug_status_idx"
  ON "crm_simrs_rencana_kontrol"("tenant_slug", "status");
