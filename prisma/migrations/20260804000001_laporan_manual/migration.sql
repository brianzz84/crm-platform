-- Angka triwulan lampau dari laporan manual. Idempoten; diterapkan lewat psql.

CREATE TABLE IF NOT EXISTS "crm_social_laporan_manual" (
  "id"            TEXT NOT NULL,
  "tenant_slug"   TEXT NOT NULL,
  "kanal"         "KanalSosial" NOT NULL,
  "periode"       TEXT NOT NULL,
  "urutan"        INTEGER NOT NULL,
  "dimensi"       TEXT NOT NULL,
  -- Bagian dari kunci unik, jadi TIDAK boleh nullable: Postgres menganggap tiap
  -- NULL berbeda sehingga duplikat akan lolos tanpa terdeteksi.
  "nilai_dim"     TEXT NOT NULL DEFAULT '',
  "jumlah_konten" INTEGER NOT NULL DEFAULT 0,
  "jangkauan"     INTEGER NOT NULL DEFAULT 0,
  "tayangan"      INTEGER NOT NULL DEFAULT 0,
  "interaksi"     INTEGER NOT NULL DEFAULT 0,
  "suka"          INTEGER NOT NULL DEFAULT 0,
  "follower"      INTEGER NOT NULL DEFAULT 0,
  "sumber"        TEXT NOT NULL,
  "diimpor_pada"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_social_laporan_manual_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "crm_social_laporan_manual_unik"
  ON "crm_social_laporan_manual"("tenant_slug", "kanal", "periode", "dimensi", "nilai_dim");
CREATE INDEX IF NOT EXISTS "crm_social_laporan_manual_tenant_kanal_idx"
  ON "crm_social_laporan_manual"("tenant_slug", "kanal");
