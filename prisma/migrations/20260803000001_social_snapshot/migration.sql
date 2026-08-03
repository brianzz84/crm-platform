-- Snapshot Kanal Publik — tabel perekam untuk laporan triwulanan.
--
-- Ditulis idempoten (IF NOT EXISTS / DO $$) karena migrasi produksi dijalankan
-- lewat `psql -f` langsung, bukan `prisma migrate deploy` — riwayat migrasi di
-- prod tidak sinkron (P3005) sehingga perintah itu menolak jalan.

DO $$ BEGIN
  CREATE TYPE "KanalSosial" AS ENUM ('IG', 'FB', 'YOUTUBE', 'GA4');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "crm_social_snapshot_configs" (
  "id"           TEXT NOT NULL,
  "tenant_slug"  TEXT NOT NULL,
  "aktif"        BOOLEAN NOT NULL DEFAULT false,
  "jam_snapshot" INTEGER NOT NULL DEFAULT 2,
  "last_run_at"  TIMESTAMP(3),
  "last_status"  TEXT,
  "last_pesan"   TEXT,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "crm_social_snapshot_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_social_snapshot_configs_tenant_slug_key"
  ON "crm_social_snapshot_configs"("tenant_slug");

CREATE TABLE IF NOT EXISTS "crm_social_account_daily" (
  "id"               TEXT NOT NULL,
  "tenant_slug"      TEXT NOT NULL,
  "kanal"            "KanalSosial" NOT NULL,
  "tanggal"          DATE NOT NULL,
  "jangkauan"        INTEGER NOT NULL DEFAULT 0,
  "tayangan"         INTEGER NOT NULL DEFAULT 0,
  "interaksi"        INTEGER NOT NULL DEFAULT 0,
  "suka"             INTEGER NOT NULL DEFAULT 0,
  "disimpan"         INTEGER NOT NULL DEFAULT 0,
  "follower_baru"    INTEGER NOT NULL DEFAULT 0,
  "follower_total"   INTEGER NOT NULL DEFAULT 0,
  "kunjungan_profil" INTEGER NOT NULL DEFAULT 0,
  "diambil_pada"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_social_account_daily_pkey" PRIMARY KEY ("id")
);
-- Kunci unik ini TIDAK boleh memuat kolom nullable: Postgres menganggap tiap NULL
-- berbeda, sehingga constraint-nya akan diam-diam berhenti mencegah duplikat dan
-- tabel menggandakan diri tiap malam tanpa ada yang menyadari.
CREATE UNIQUE INDEX IF NOT EXISTS "crm_social_account_daily_tenant_slug_kanal_tanggal_key"
  ON "crm_social_account_daily"("tenant_slug", "kanal", "tanggal");
CREATE INDEX IF NOT EXISTS "crm_social_account_daily_tenant_slug_kanal_idx"
  ON "crm_social_account_daily"("tenant_slug", "kanal");

CREATE TABLE IF NOT EXISTS "crm_social_contents" (
  "id"           TEXT NOT NULL,
  "tenant_slug"  TEXT NOT NULL,
  "kanal"        "KanalSosial" NOT NULL,
  "konten_id"    TEXT NOT NULL,
  "jenis"        TEXT NOT NULL,
  "terbit_pada"  TIMESTAMP(3) NOT NULL,
  "teks"         TEXT,
  "permalink"    TEXT,
  "sampul_url"   TEXT,
  "sifat"        TEXT,
  "sifat_usulan" TEXT,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "crm_social_contents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_social_contents_tenant_slug_kanal_konten_id_key"
  ON "crm_social_contents"("tenant_slug", "kanal", "konten_id");
CREATE INDEX IF NOT EXISTS "crm_social_contents_tenant_slug_terbit_pada_idx"
  ON "crm_social_contents"("tenant_slug", "terbit_pada");

CREATE TABLE IF NOT EXISTS "crm_social_content_snapshots" (
  "id"               TEXT NOT NULL,
  "content_id"       TEXT NOT NULL,
  "umur_hari"        INTEGER NOT NULL,
  "jangkauan"        INTEGER NOT NULL DEFAULT 0,
  "tayangan"         INTEGER NOT NULL DEFAULT 0,
  "suka"             INTEGER NOT NULL DEFAULT 0,
  "komentar"         INTEGER NOT NULL DEFAULT 0,
  "dibagikan"        INTEGER NOT NULL DEFAULT 0,
  "disimpan"         INTEGER NOT NULL DEFAULT 0,
  "interaksi"        INTEGER NOT NULL DEFAULT 0,
  "follower_baru"    INTEGER NOT NULL DEFAULT 0,
  "kunjungan_profil" INTEGER NOT NULL DEFAULT 0,
  "diambil_pada"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_social_content_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_social_content_snapshots_content_id_umur_hari_key"
  ON "crm_social_content_snapshots"("content_id", "umur_hari");

DO $$ BEGIN
  ALTER TABLE "crm_social_content_snapshots"
    ADD CONSTRAINT "crm_social_content_snapshots_content_id_fkey"
    FOREIGN KEY ("content_id") REFERENCES "crm_social_contents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
