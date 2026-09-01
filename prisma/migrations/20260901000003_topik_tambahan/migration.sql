-- Empat kategori tambahan, dan pengetatan Informasi Umum.
--
-- Lahir dari pemeriksaan 31 label sungguhan: 13 masuk INFO_UMUM, dan sembilan
-- di antaranya bukan salah tebak AI melainkan TIDAK PUNYA TEMPAT LAIN —
-- apresiasi, pelatihan NICU/PICU untuk perawat luar, jadwal misa. Uraian
-- INFO_UMUM sendiri berbunyi "…dan keterangan umum lain", yaitu undangan
-- terbuka menjadi keranjang sampah, dan AI menerimanya.
--
-- Idempoten: migrasi di proyek ini kerap dijalankan lewat psql langsung karena
-- `migrate deploy` tersandung P3005 pada basis data yang sudah berisi.

INSERT INTO "crm_percakapan_topik_library"
  ("id", "tenant_slug", "kode", "nama", "deskripsi", "warna", "urutan", "aktif", "created_at", "updated_at")
SELECT gen_random_uuid()::text, t."tenant_slug", v."kode", v."nama", v."deskripsi", v."warna", v."urutan",
       true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "tenant_slug" FROM "crm_percakapan_topik_library") t
CROSS JOIN (VALUES
  ('LAYANAN_KLINIK', 'Layanan Klinik Tersedia',
   'Menanyakan APAKAH suatu tindakan, pemeriksaan, atau layanan tersedia di RKZ — beserta syarat, persiapan, atau batas usianya. Contoh: "bisa pembersihan telinga anak?", "ada layanan suntik vitamin?". Bedanya dengan Konsultasi Kesehatan: di sini orang menanyakan ketersediaan layanan, bukan menceritakan keluhannya sendiri.',
   '#14B8A6', 7),
  ('PELAYANAN_ROHANI', 'Pelayanan Rohani',
   'Jadwal misa atau ibadah di kapel, permintaan pendampingan rohani, kunjungan pastoral, atau menanyakan rohaniwan/biarawati yang berkarya di rumah sakit.',
   '#8B5CF6', 8),
  ('APRESIASI', 'Apresiasi & Testimoni',
   'Pujian, ucapan terima kasih, ucapan selamat, atau testimoni positif atas layanan maupun staf — biasanya tanpa pertanyaan sama sekali. Kebalikan dari Keluhan Layanan, dan sama pentingnya untuk dihitung.',
   '#65A30D', 11),
  ('PELATIHAN', 'Pelatihan & Diklat',
   'Tenaga kesehatan atau institusi lain menanyakan pelatihan profesi, workshop, atau diklat yang diselenggarakan RKZ — misalnya pelatihan NICU/PICU untuk perawat. BUKAN orang yang mencari pekerjaan, magang, atau PKL; itu Lowongan & Magang.',
   '#EA580C', 13)
) AS v("kode", "nama", "deskripsi", "warna", "urutan")
ON CONFLICT ("tenant_slug", "kode") DO NOTHING;

-- INFO_UMUM ditutup rapat. Uraian kategori dibaca AI apa adanya, jadi kalimat
-- "keterangan umum lain" itu bukan sekadar dokumentasi — ia instruksi.
UPDATE "crm_percakapan_topik_library"
SET "deskripsi" = 'Jam besuk, lokasi gedung, nomor telepon, parkir, ketersediaan kamar, dan keterangan administratif serupa. KATEGORI SISA: pakai hanya setelah memastikan tidak ada kategori lain yang cocok. Bila percakapan menyebut keluhan, gejala, tindakan medis, nama layanan, atau nama spesialisasi — kategorinya BUKAN ini.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "kode" = 'INFO_UMUM';

UPDATE "crm_percakapan_topik_library"
SET "deskripsi" = 'Menceritakan keluhan atau gejala, meminta saran medis, atau menanyakan dokter spesialis mana yang sesuai untuk suatu kondisi. Bidang layanannya dicatat terpisah pada dimensi Poli.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "kode" = 'KONSULTASI_KESEHATAN';

-- Urutan ditetapkan eksplisit supaya kategori bersaudara berdampingan:
-- Konsultasi/Layanan Klinik, Keluhan/Apresiasi, Lowongan/Pelatihan.
UPDATE "crm_percakapan_topik_library" SET "urutan" = v."urutan"
FROM (VALUES
  ('JADWAL_DOKTER', 1), ('PENDAFTARAN', 2), ('TARIF_BIAYA', 3), ('PENJAMIN', 4),
  ('HASIL_PERIKSA', 5), ('KONSULTASI_KESEHATAN', 6), ('LAYANAN_KLINIK', 7),
  ('PELAYANAN_ROHANI', 8), ('INFO_UMUM', 9), ('KELUHAN', 10), ('APRESIASI', 11),
  ('LOWONGAN', 12), ('PELATIHAN', 13), ('KERJA_SAMA', 14), ('SPAM', 15), ('LAINNYA', 16)
) AS v("kode", "urutan")
WHERE "crm_percakapan_topik_library"."kode" = v."kode";
