-- Selaraskan enum SimrsUnit dengan kelompok layanan di master tindakan SIMRS RKZ.
-- Master tindakan punya 6 kelompok, enum lama cuma menampung 3 — akibatnya kunjungan
-- Pondok Sehat (paket check-up), One Day Care, dan Home Care tidak punya unit yang benar.
-- Aditif: nilai lama tetap valid, data existing tidak berubah.
ALTER TYPE "SimrsUnit" ADD VALUE IF NOT EXISTS 'PONDOK_SEHAT';
ALTER TYPE "SimrsUnit" ADD VALUE IF NOT EXISTS 'ONE_DAY_CARE';
ALTER TYPE "SimrsUnit" ADD VALUE IF NOT EXISTS 'HOME_CARE';
