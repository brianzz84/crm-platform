-- Jejak audit tools diagnostik API SIMRS. Tidak menyimpan respons mentah SIMRS
-- (bisa berisi PII pasien sungguhan) — hanya ringkasan hasil validasi field,
-- cukup untuk audit "siapa menguji apa kapan" dan untuk pembatas laju panggilan.
CREATE TABLE "crm_simrs_diagnostik_logs" (
    "id"              TEXT         NOT NULL,
    "tenant_slug"     TEXT         NOT NULL,
    "jenis"           TEXT         NOT NULL,
    "parameter"       JSONB        NOT NULL,
    "berhasil"        BOOLEAN      NOT NULL,
    "http_status"     INTEGER,
    "durasi_ms"       INTEGER      NOT NULL,
    "jumlah_baris"    INTEGER,
    "field_hilang"    TEXT[]       NOT NULL DEFAULT '{}',
    "field_asing"     TEXT[]       NOT NULL DEFAULT '{}',
    "pesan_error"     TEXT,
    "dilakukan_oleh"  TEXT         NOT NULL,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crm_simrs_diagnostik_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "crm_simrs_diagnostik_logs_tenant_slug_created_at_idx"
  ON "crm_simrs_diagnostik_logs"("tenant_slug", "created_at");
