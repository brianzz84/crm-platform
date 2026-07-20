-- Kontak (nomor HP) pindah sepenuhnya jadi atribut Person, menggantikan tabel
-- PersonContact terpisah. Temuan yang mendasari: dari 3.491 baris di
-- crm_person_contacts, 1.745 (persis = total pasien asli) adalah baris YATIM
-- (person_id tidak match Person manapun) — dan ternyata TIDAK ADA foreign key
-- constraint nyata di DB untuk mencegahnya (cuma NOT NULL). Menempelkan nomor
-- langsung di baris Person menghilangkan kelas bug ini secara struktural.
-- Data valid (bukan yatim) sekarang: 1.744 person punya 1 kontak, 1 person
-- punya 2 kontak — jadi 2 kolom eksplisit (no_hp + no_hp_2) menampung 100%
-- kebutuhan nyata, sekaligus sesuai kapasitas SIMRS API (kirim maks 2 nomor).

-- 1. Kolom baru di Person
ALTER TABLE "crm_persons" ADD COLUMN "no_hp_2" TEXT;
ALTER TABLE "crm_persons" ADD COLUMN "no_hp_2_label" TEXT;

-- 2. Backfill no_hp (HANYA jika masih kosong — menutup bug lama: pasien dari
--    SIMRS sync yang PersonContact-nya ada tapi Person.no_hp tidak pernah diisi)
UPDATE "crm_persons" p
SET "no_hp" = pc."nilai"
FROM "crm_person_contacts" pc
WHERE pc."person_id" = p."id"
  AND pc."is_primary" = true
  AND p."no_hp" IS NULL;

-- 3. Backfill no_hp_2 dari kontak non-primary yang valid
UPDATE "crm_persons" p
SET "no_hp_2" = pc."nilai", "no_hp_2_label" = pc."label"
FROM "crm_person_contacts" pc
WHERE pc."person_id" = p."id"
  AND pc."is_primary" = false;

-- 4. Arsipkan tabel lama — TIDAK di-drop, untuk audit baris yatim jika
--    diperlukan nanti. Lepas FK dulu jika ada (production tidak punya FK ini,
--    tapi environment lain mungkin punya — aman untuk dua-duanya).
ALTER TABLE "crm_person_contacts" DROP CONSTRAINT IF EXISTS "crm_person_contacts_person_id_fkey";
ALTER TABLE "crm_person_contacts" RENAME TO "crm_person_contacts_deprecated";

-- 5. Enum ContactJenis sudah tidak dipakai model aktif manapun. Konversi kolom
--    jenis di tabel arsip ke TEXT dulu (Prisma model PersonContactArsip juga
--    mendefinisikan jenis sebagai String) baru enum-nya aman di-drop.
ALTER TABLE "crm_person_contacts_deprecated" ALTER COLUMN "jenis" TYPE TEXT USING "jenis"::text;
DROP TYPE IF EXISTS "ContactJenis";

-- 6. CampaignRecipient: dukung 2 baris per person per campaign (kirim ke 2 nomor)
ALTER TABLE "crm_campaign_recipients" ADD COLUMN "nomor_ke" TEXT NOT NULL DEFAULT 'utama';
-- Kunci lama (campaign_id, person_id) HARUS benar-benar hilang, kalau tidak baris
-- kedua untuk nomor alternatif selalu ditolak. Prisma membuatnya sebagai UNIQUE
-- INDEX biasa, bukan table constraint — jadi DROP CONSTRAINT saja tidak cukup
-- (diam-diam ter-skip). Butuh dua-duanya supaya aman di semua environment.
ALTER TABLE "crm_campaign_recipients" DROP CONSTRAINT IF EXISTS "crm_campaign_recipients_campaign_id_person_id_key";
DROP INDEX IF EXISTS "crm_campaign_recipients_campaign_id_person_id_key";
ALTER TABLE "crm_campaign_recipients" ADD CONSTRAINT "crm_campaign_recipients_campaign_id_person_id_no_hp_key" UNIQUE ("campaign_id", "person_id", "no_hp");

-- 7. Campaign: toggle kirim ke dua nomor
ALTER TABLE "crm_campaigns" ADD COLUMN "kirim_dua_nomor" BOOLEAN NOT NULL DEFAULT false;
