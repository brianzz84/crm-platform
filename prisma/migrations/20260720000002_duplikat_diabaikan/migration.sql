-- Penanda "bukan duplikat" untuk antrean tinjauan penggabungan.
--
-- Tanpa ini antrean tidak pernah menyusut: pasangan yang sudah dinilai petugas
-- sebagai dua orang berbeda (mis. ibu dan anak yang memakai satu nomor HP) akan
-- muncul lagi setiap kali deteksi dijalankan.
--
-- Pasangan disimpan dalam urutan tetap (id terkecil dulu) supaya (A,B) dan (B,A)
-- tidak tercatat dua kali — penyusunannya dilakukan di sisi aplikasi.
CREATE TABLE "crm_person_duplikat_diabaikan" (
    "id"           TEXT         NOT NULL,
    "tenant_slug"  TEXT         NOT NULL,
    "person_a_id"  TEXT         NOT NULL,
    "person_b_id"  TEXT         NOT NULL,
    "alasan"       TEXT,
    "oleh"         TEXT         NOT NULL,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crm_person_duplikat_diabaikan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "crm_person_duplikat_diabaikan_pasangan_key"
  ON "crm_person_duplikat_diabaikan"("tenant_slug", "person_a_id", "person_b_id");
CREATE INDEX "crm_person_duplikat_diabaikan_tenant_slug_idx"
  ON "crm_person_duplikat_diabaikan"("tenant_slug");
