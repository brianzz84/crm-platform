-- Peran baru: admin media sosial.
--
-- Idempoten: migrasi di proyek ini kerap dijalankan lewat psql langsung karena
-- `migrate deploy` tersandung P3005 pada basis data yang sudah berisi.
--
-- Menambah nilai enum TIDAK BISA dibungkus transaksi bersama pemakaiannya di
-- Postgres lama, dan `IF NOT EXISTS` baru ada sejak PG 12 — aman di sini karena
-- Railway memakai PG 16.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ADMIN_MEDSOS';
