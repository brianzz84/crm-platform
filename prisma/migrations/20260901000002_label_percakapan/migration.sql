-- Label percakapan: topik + poli, boleh lebih dari satu per percakapan.
--
-- Menggantikan pasangan kolom topik/topik_usulan yang hanya bisa menampung satu
-- nilai. Satu percakapan nyatanya kerap membahas beberapa hal sekaligus, dan
-- memaksanya jadi satu label membuat laporan menghilangkan yang lain diam-diam.
--
-- Idempoten: migrasi di proyek ini kerap dijalankan lewat psql langsung karena
-- `migrate deploy` tersandung P3005 pada basis data yang sudah berisi.

CREATE TABLE IF NOT EXISTS "crm_percakapan_poli_library" (
  "id"          TEXT         NOT NULL,
  "tenant_slug" TEXT         NOT NULL,
  "kode"        TEXT         NOT NULL,
  "nama"        TEXT         NOT NULL,
  "kelompok"    TEXT,
  "warna"       TEXT         NOT NULL DEFAULT '#0089A8',
  "urutan"      INTEGER      NOT NULL DEFAULT 0,
  "aktif"       BOOLEAN      NOT NULL DEFAULT true,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_percakapan_poli_library_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "crm_percakapan_poli_library_tenant_slug_kode_key"
  ON "crm_percakapan_poli_library" ("tenant_slug", "kode");
CREATE INDEX IF NOT EXISTS "crm_percakapan_poli_library_tenant_slug_aktif_idx"
  ON "crm_percakapan_poli_library" ("tenant_slug", "aktif");

CREATE TABLE IF NOT EXISTS "crm_conversation_labels" (
  "id"              TEXT         NOT NULL,
  "conversation_id" TEXT         NOT NULL,
  "dimensi"         TEXT         NOT NULL,
  "kode"            TEXT         NOT NULL,
  "sumber"          TEXT         NOT NULL DEFAULT 'AI',
  "disetujui"       BOOLEAN      NOT NULL DEFAULT false,
  "alasan"          TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_conversation_labels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "crm_conversation_labels_conversation_id_dimensi_kode_key"
  ON "crm_conversation_labels" ("conversation_id", "dimensi", "kode");
CREATE INDEX IF NOT EXISTS "crm_conversation_labels_conversation_id_idx"
  ON "crm_conversation_labels" ("conversation_id");
CREATE INDEX IF NOT EXISTS "crm_conversation_labels_dimensi_kode_disetujui_idx"
  ON "crm_conversation_labels" ("dimensi", "kode", "disetujui");

DO $$ BEGIN
  ALTER TABLE "crm_conversation_labels"
    ADD CONSTRAINT "crm_conversation_labels_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "crm_conversations"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Keperluan yang hilang selama topik masih satu dimensi: pertanyaan kesehatan
-- itu sendiri. Sebelum ini semuanya jatuh ke INFO_UMUM. Ditambahkan lewat
-- migrasi, bukan lewat daftar bawaan, karena penyemaian hanya berjalan pada
-- tenant yang pustakanya masih kosong — dan RKZ sudah terisi.
-- Digeser dulu supaya kategori baru duduk di urutan 6, tepat setelah topik
-- klinis lain, alih-alih menumpuk di ekor daftar.
UPDATE "crm_percakapan_topik_library" SET "urutan" = "urutan" + 1
WHERE "urutan" >= 6 AND "kode" <> 'KONSULTASI_KESEHATAN';

INSERT INTO "crm_percakapan_topik_library"
  ("id", "tenant_slug", "kode", "nama", "deskripsi", "warna", "urutan", "aktif", "created_at", "updated_at")
SELECT gen_random_uuid()::text, t."tenant_slug", 'KONSULTASI_KESEHATAN', 'Konsultasi Kesehatan',
       'Menanyakan keluhan, gejala, atau saran medis — termasuk menanyakan layanan mana yang sesuai untuk suatu keluhan. Bidangnya dicatat terpisah pada dimensi Poli.',
       '#0891B2', 6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "tenant_slug" FROM "crm_percakapan_topik_library") t
ON CONFLICT ("tenant_slug", "kode") DO NOTHING;

-- Usulan AI yang sudah ada dipindahkan, bukan dibuang. Nilainya kecil, tetapi
-- membuang pekerjaan yang bisa diselamatkan dengan satu perintah tidak punya
-- pembenaran. Semuanya masuk sebagai BELUM disetujui — memang itu keadaannya.
INSERT INTO "crm_conversation_labels"
  ("id", "conversation_id", "dimensi", "kode", "sumber", "disetujui", "alasan", "created_at")
SELECT gen_random_uuid()::text, c."id", 'TOPIK', c."topik_usulan", 'AI', false,
       c."topik_alasan", COALESCE(c."topik_usul_pada", CURRENT_TIMESTAMP)
FROM "crm_conversations" c
WHERE c."topik_usulan" IS NOT NULL
ON CONFLICT ("conversation_id", "dimensi", "kode") DO NOTHING;

-- Topik yang sudah DITETAPKAN manusia, bila ada, ikut terbawa sebagai disetujui.
INSERT INTO "crm_conversation_labels"
  ("id", "conversation_id", "dimensi", "kode", "sumber", "disetujui", "alasan", "created_at")
SELECT gen_random_uuid()::text, c."id", 'TOPIK', c."topik", 'MANUAL', true, NULL, CURRENT_TIMESTAMP
FROM "crm_conversations" c
WHERE c."topik" IS NOT NULL
ON CONFLICT ("conversation_id", "dimensi", "kode") DO UPDATE
  SET "disetujui" = true, "sumber" = 'MANUAL';

-- Baru sesudah isinya diselamatkan, kolom lama dibuang.
ALTER TABLE "crm_conversations" DROP COLUMN IF EXISTS "topik";
ALTER TABLE "crm_conversations" DROP COLUMN IF EXISTS "topik_usulan";
ALTER TABLE "crm_conversations" DROP COLUMN IF EXISTS "topik_alasan";
ALTER TABLE "crm_conversations" DROP COLUMN IF EXISTS "topik_usul_pada";
DROP INDEX IF EXISTS "crm_conversations_tenant_slug_topik_idx";
