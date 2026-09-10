-- RHIP — lapisan sebutan publik di atas Kanal Publik.
--
-- Menyimpan apa yang orang LAIN katakan tentang RKZ. Sumber yang sudah terbukti
-- dapat diakses dengan kredensial yang dipegang hari ini (probe 4 Sep 2026):
--   Instagram /tags   252 konten dari 102 akun, sejak Mei 2023
--   YouTube search    pencarian video publik seluruh platform
--   Facebook /tagged  33 postingan
--   Facebook /ratings 24 rekomendasi
--
-- Idempoten: migrasi di proyek ini kerap dijalankan lewat psql langsung karena
-- `migrate deploy` tersandung P3005 pada basis data yang sudah berisi.

-- ── Jejak persetujuan pada label percakapan yang SUDAH ada ──
-- `disetujui` menjawab "sudah ditinjau?" tetapi tidak "oleh siapa?". Untuk angka
-- yang masuk laporan direksi, pertanyaan kedua yang menentukan apakah jejaknya
-- benar-benar dapat diaudit. Aditif; baris lama tetap sah dengan nilai NULL.
ALTER TABLE "crm_conversation_labels" ADD COLUMN IF NOT EXISTS "approved_by" TEXT;
ALTER TABLE "crm_conversation_labels" ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "crm_sebutan" (
  "id"             TEXT         NOT NULL,
  "tenant_slug"    TEXT         NOT NULL,
  "sumber"         TEXT         NOT NULL,
  "sumber_id"      TEXT         NOT NULL,
  "penulis"        TEXT,
  "username"       TEXT,
  "teks"           TEXT,
  "tautan"         TEXT,
  "terbit_pada"    TIMESTAMP(3) NOT NULL,
  "mentah"         JSONB,
  "ditemukan_pada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "hilang_pada"    TIMESTAMP(3),
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_sebutan_pkey" PRIMARY KEY ("id")
);

-- Kunci anti-duplikat. Penarikan terjadwal PASTI membawa item yang sama berkali-
-- kali; tanpa ini satu sebutan menumpuk tiap jam tanpa ada yang menyadarinya.
CREATE UNIQUE INDEX IF NOT EXISTS "crm_sebutan_tenant_sumber_sumberid_key"
  ON "crm_sebutan" ("tenant_slug", "sumber", "sumber_id");
CREATE INDEX IF NOT EXISTS "crm_sebutan_tenant_sumber_idx"  ON "crm_sebutan" ("tenant_slug", "sumber");
CREATE INDEX IF NOT EXISTS "crm_sebutan_tenant_terbit_idx"  ON "crm_sebutan" ("tenant_slug", "terbit_pada");

CREATE TABLE IF NOT EXISTS "crm_sebutan_labels" (
  "id"          TEXT         NOT NULL,
  "sebutan_id"  TEXT         NOT NULL,
  "dimensi"     TEXT         NOT NULL,
  "kode"        TEXT         NOT NULL,
  "sumber"      TEXT         NOT NULL DEFAULT 'AI',
  "alasan"      TEXT,
  "disetujui"   BOOLEAN      NOT NULL DEFAULT false,
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_sebutan_labels_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_sebutan_labels_sebutan_dimensi_kode_key"
  ON "crm_sebutan_labels" ("sebutan_id", "dimensi", "kode");
CREATE INDEX IF NOT EXISTS "crm_sebutan_labels_sebutan_idx" ON "crm_sebutan_labels" ("sebutan_id");
CREATE INDEX IF NOT EXISTS "crm_sebutan_labels_dim_kode_setuju_idx"
  ON "crm_sebutan_labels" ("dimensi", "kode", "disetujui");

DO $$ BEGIN
  ALTER TABLE "crm_sebutan_labels"
    ADD CONSTRAINT "crm_sebutan_labels_sebutan_id_fkey"
    FOREIGN KEY ("sebutan_id") REFERENCES "crm_sebutan"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "crm_sebutan_topik_library" (
  "id"          TEXT         NOT NULL,
  "tenant_slug" TEXT         NOT NULL,
  "kode"        TEXT         NOT NULL,
  "nama"        TEXT         NOT NULL,
  "deskripsi"   TEXT,
  "warna"       TEXT         NOT NULL DEFAULT '#0089A8',
  "urutan"      INTEGER      NOT NULL DEFAULT 0,
  "aktif"       BOOLEAN      NOT NULL DEFAULT true,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_sebutan_topik_library_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_sebutan_topik_library_tenant_kode_key"
  ON "crm_sebutan_topik_library" ("tenant_slug", "kode");
CREATE INDEX IF NOT EXISTS "crm_sebutan_topik_library_tenant_aktif_idx"
  ON "crm_sebutan_topik_library" ("tenant_slug", "aktif");

CREATE TABLE IF NOT EXISTS "crm_sebutan_kata_kunci" (
  "id"           TEXT         NOT NULL,
  "tenant_slug"  TEXT         NOT NULL,
  "sumber"       TEXT         NOT NULL,
  "kata"         TEXT         NOT NULL,
  "aktif"        BOOLEAN      NOT NULL DEFAULT true,
  "urutan"       INTEGER      NOT NULL DEFAULT 0,
  "ditarik_pada" TIMESTAMP(3),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_sebutan_kata_kunci_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_sebutan_kata_kunci_tenant_sumber_kata_key"
  ON "crm_sebutan_kata_kunci" ("tenant_slug", "sumber", "kata");
CREATE INDEX IF NOT EXISTS "crm_sebutan_kata_kunci_tenant_sumber_aktif_idx"
  ON "crm_sebutan_kata_kunci" ("tenant_slug", "sumber", "aktif");
