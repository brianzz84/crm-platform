-- Snapshot Google Business Profile untuk laporan triwulan.
--
-- Idempoten: migrasi di proyek ini kerap dijalankan lewat psql langsung karena
-- `migrate deploy` tersandung P3005 pada basis data yang sudah berisi.

-- Metrik harian per lokasi. Direkam karena Business Performance API hanya
-- melayani ~18 bulan ke belakang (diuji 27 Agu 2026: terisi pada 17 bulan,
-- kosong pada 19 bulan), sehingga pembandingan tahun-ke-tahun hilang selamanya
-- bila tidak disimpan.
CREATE TABLE IF NOT EXISTS "crm_gbp_location_daily" (
  "id"                      TEXT             NOT NULL,
  "tenant_slug"             TEXT             NOT NULL,
  "lokasi"                  TEXT             NOT NULL,
  "lokasi_judul"            TEXT             NOT NULL,
  "tanggal"                 DATE             NOT NULL,
  "tayangan_maps_desktop"   INTEGER          NOT NULL DEFAULT 0,
  "tayangan_search_desktop" INTEGER          NOT NULL DEFAULT 0,
  "tayangan_maps_mobile"    INTEGER          NOT NULL DEFAULT 0,
  "tayangan_search_mobile"  INTEGER          NOT NULL DEFAULT 0,
  "permintaan_rute"         INTEGER          NOT NULL DEFAULT 0,
  "klik_telepon"            INTEGER          NOT NULL DEFAULT 0,
  "klik_website"            INTEGER          NOT NULL DEFAULT 0,
  "jumlah_ulasan"           INTEGER          NOT NULL DEFAULT 0,
  "rata_rata"               DOUBLE PRECISION NOT NULL DEFAULT 0,
  "diambil_pada"            TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_gbp_location_daily_pkey" PRIMARY KEY ("id")
);

-- Tanpa kolom nullable: Postgres menganggap tiap NULL berbeda, sehingga unique
-- yang mengandungnya diam-diam berhenti mencegah duplikat.
CREATE UNIQUE INDEX IF NOT EXISTS "crm_gbp_location_daily_tenant_slug_lokasi_tanggal_key"
  ON "crm_gbp_location_daily" ("tenant_slug", "lokasi", "tanggal");
CREATE INDEX IF NOT EXISTS "crm_gbp_location_daily_tenant_slug_tanggal_idx"
  ON "crm_gbp_location_daily" ("tenant_slug", "tanggal");

-- Ulasan. `ditandai` dan `catatan` adalah milik CRM, bukan konten Google, dan
-- sengaja tidak pernah ditimpa saat ulasan disegarkan.
CREATE TABLE IF NOT EXISTS "crm_gbp_reviews" (
  "id"            TEXT         NOT NULL,
  "tenant_slug"   TEXT         NOT NULL,
  "lokasi"        TEXT         NOT NULL,
  "lokasi_judul"  TEXT         NOT NULL,
  "review_id"     TEXT         NOT NULL,
  "bintang"       INTEGER      NOT NULL,
  "pengulas"      TEXT         NOT NULL,
  "foto_pengulas" TEXT,
  "teks"          TEXT,
  "terjemahan"    TEXT,
  "foto"          TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "dibuat_pada"   TIMESTAMP(3) NOT NULL,
  "diubah_pada"   TIMESTAMP(3) NOT NULL,
  "balasan_teks"  TEXT,
  "balasan_pada"  TIMESTAMP(3),
  "ditandai"      TEXT,
  "catatan"       TEXT,
  "diambil_pada"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_gbp_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "crm_gbp_reviews_tenant_slug_review_id_key"
  ON "crm_gbp_reviews" ("tenant_slug", "review_id");
CREATE INDEX IF NOT EXISTS "crm_gbp_reviews_tenant_slug_lokasi_dibuat_pada_idx"
  ON "crm_gbp_reviews" ("tenant_slug", "lokasi", "dibuat_pada");
CREATE INDEX IF NOT EXISTS "crm_gbp_reviews_tenant_slug_bintang_idx"
  ON "crm_gbp_reviews" ("tenant_slug", "bintang");
