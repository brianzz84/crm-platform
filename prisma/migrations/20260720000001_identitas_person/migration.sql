-- Pengerasan identitas Person, menyiapkan integrasi SIMRS.
--
-- Latar: data pasien dan data kunjungan datang dari DUA API berbeda, dan satu-satunya
-- penghubung di antara keduanya adalah no_rm. Sebelum migrasi ini, no_rm hanya punya
-- index biasa — tidak ada yang menjamin keunikannya, padahal seluruh penjahitan data
-- bergantung padanya.
--
-- Selain itu RKZ selalu menerbitkan RM baru dan TIDAK mengirim pemberitahuan saat dua
-- RM ternyata milik orang yang sama (mis. kasir keliru membuat RM baru untuk pasien
-- lama). Penyatuannya dilakukan manual di sistem ini. Konsekuensinya: SIMRS akan
-- SELAMANYA tetap mengirim kunjungan memakai RM lama, jadi baris lama tidak boleh
-- dihapus — ia disimpan sebagai "baris nisan" yang menunjuk ke baris yang bertahan.

-- 1. Kolom baru di Person
ALTER TABLE "crm_persons" ADD COLUMN "is_rintisan"           BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "crm_persons" ADD COLUMN "digabung_ke_person_id" TEXT;
ALTER TABLE "crm_persons" ADD COLUMN "digabung_at"           TIMESTAMP(3);
ALTER TABLE "crm_persons" ADD COLUMN "digabung_oleh"         TEXT;
ALTER TABLE "crm_persons" ADD COLUMN "digabung_alasan"       TEXT;

-- FK mandiri: penunjuk gabungan tidak boleh menggantung ke baris yang tidak ada.
-- RESTRICT supaya baris yang masih jadi tujuan gabungan tidak bisa terhapus.
ALTER TABLE "crm_persons"
  ADD CONSTRAINT "crm_persons_digabung_ke_person_id_fkey"
  FOREIGN KEY ("digabung_ke_person_id") REFERENCES "crm_persons"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX "crm_persons_digabung_ke_person_id_idx" ON "crm_persons"("digabung_ke_person_id");

-- 2. no_rm WAJIB unik per tenant. Postgres memperlakukan NULL sebagai berbeda satu
--    sama lain, jadi ribuan person dari kegiatan (yang memang belum punya RM) tetap
--    lolos tanpa perlu perlakuan khusus.
CREATE UNIQUE INDEX "crm_persons_tenant_slug_no_rm_key" ON "crm_persons"("tenant_slug", "no_rm");

-- 3. Simpan RM mentah di baris kunjungan, di sebelah person_id hasil resolusi.
ALTER TABLE "crm_simrs_visits" ADD COLUMN "no_rm_sumber" TEXT;
CREATE INDEX "crm_simrs_visits_no_rm_sumber_idx" ON "crm_simrs_visits"("no_rm_sumber");

-- Isi mundur untuk kunjungan yang sudah ada, dari RM pemiliknya saat ini.
UPDATE "crm_simrs_visits" v
SET "no_rm_sumber" = p."no_rm"
FROM "crm_persons" p
WHERE p."id" = v."person_id" AND p."no_rm" IS NOT NULL;

-- 4. Catatan audit penggabungan — menyimpan APA SAJA yang berpindah, supaya
--    penggabungan bisa dibatalkan dengan benar.
CREATE TABLE "crm_person_merge_logs" (
    "id"               TEXT         NOT NULL,
    "tenant_slug"      TEXT         NOT NULL,
    "person_sumber_id" TEXT         NOT NULL,
    "person_tujuan_id" TEXT         NOT NULL,
    "alasan"           TEXT         NOT NULL,
    "dipindahkan"      JSONB        NOT NULL DEFAULT '{}',
    "dilakukan_oleh"   TEXT         NOT NULL,
    "dilakukan_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dibatalkan_at"    TIMESTAMP(3),
    "dibatalkan_oleh"  TEXT,
    CONSTRAINT "crm_person_merge_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "crm_person_merge_logs_tenant_slug_idx"      ON "crm_person_merge_logs"("tenant_slug");
CREATE INDEX "crm_person_merge_logs_person_tujuan_id_idx" ON "crm_person_merge_logs"("person_tujuan_id");
CREATE INDEX "crm_person_merge_logs_person_sumber_id_idx" ON "crm_person_merge_logs"("person_sumber_id");
