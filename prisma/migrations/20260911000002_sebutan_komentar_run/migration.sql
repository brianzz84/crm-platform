-- Sumber lari untuk kolektor komentar IG & FB.
--
-- DUA NILAI, bukan satu "SEBUTAN_KOMENTAR": Instagram dan Facebook memakai
-- token yang sama tetapi endpoint dan bentuk balasan yang berbeda, dan salah
-- satunya bisa gagal sementara yang lain sehat. Digabung jadi satu baris
-- riwayat, kegagalan salah satu akan menyamar sebagai kegagalan keduanya —
-- persis kebutaan yang hendak ditutup oleh pencatatan lari ini.
ALTER TYPE "SumberSnapshot" ADD VALUE IF NOT EXISTS 'SEBUTAN_KOMENTAR_IG';
ALTER TYPE "SumberSnapshot" ADD VALUE IF NOT EXISTS 'SEBUTAN_KOMENTAR_FB';
