-- Mencatat lari penarik sebutan ke SnapshotRun yang sudah ada.
--
-- MENGAPA ENUM DIPERLUAS, BUKAN TABEL BARU: `SnapshotRun` sudah memegang
-- persis konsep yang dibutuhkan — satu baris per sumber per hari, dengan
-- kunci tanggal yang membuat HARI BOLONG bisa dideteksi. Tabel kedua berarti
-- dua logika deteksi bolong yang akan menyimpang seiring waktu.
--
-- Ini yang membuat "kolektor rusak tiga minggu" bisa dibedakan dari "kolektor
-- sehat yang memang tidak menemukan apa-apa". Tanpa catatan lari, keduanya
-- menghasilkan layar sepi yang identik.
--
-- ALTER TYPE ... ADD VALUE bersifat idempoten lewat IF NOT EXISTS dan aman
-- dijalankan ulang. Tiap pernyataan berdiri sendiri: PostgreSQL menolak
-- ADD VALUE di dalam blok transaksi yang sama dengan pemakaian nilainya.
ALTER TYPE "SumberSnapshot" ADD VALUE IF NOT EXISTS 'SEBUTAN_IG';
ALTER TYPE "SumberSnapshot" ADD VALUE IF NOT EXISTS 'SEBUTAN_YT';
ALTER TYPE "SumberSnapshot" ADD VALUE IF NOT EXISTS 'SEBUTAN_ULASAN';
