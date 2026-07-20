/**
 * Pengaman data uji — mencegah pesan WhatsApp sungguhan terkirim ke pasien dummy.
 *
 * Latar belakang: person dummy (penanda `simrs_patient_id` berawalan 'DUMMY-')
 * dulu sengaja dibiarkan tanpa nomor HP supaya broadcast tidak mungkin nyasar.
 * Sejak nomor sintetis diisikan untuk menguji campaign, pengaman itu dipindah ke
 * sini: bukan lagi mengandalkan kolom yang kebetulan kosong, tapi dicegat di
 * jalur kirimnya — supaya tidak bisa bocor lewat jalur yang terlupa.
 *
 * Nomor sintetis memakai awalan 0899900 yang tidak dipakai person mana pun di DB,
 * TAPI 0899 adalah awalan operator asli (Tri). Jadi tanpa pengaman ini, satu
 * campaign yang salah pilih segmen bisa mengirim promo ke orang tak dikenal.
 *
 * Dipakai oleh SEMUA jalur yang benar-benar mengirim WA:
 *  - src/app/api/[slug]/broadcast/[id]/send/route.ts  (campaign)
 *  - src/workers/sapaan.worker.ts                      (ULTAH & HARI_RAYA)
 *
 * Data dummy tetap ikut di pencarian/segmentasi/AI Partner — yang dicegat hanya
 * pengiriman pesannya.
 */

export const PENANDA_PERSON_UJI = 'DUMMY-'

/**
 * Potongan `where` Prisma untuk menyaring person dummy.
 *
 * Sengaja memakai bentuk OR eksplisit, bukan `NOT: { startsWith }`. `NOT` akan
 * diterjemahkan jadi `NOT (simrs_patient_id LIKE 'DUMMY-%')`, yang bernilai NULL
 * (bukan TRUE) untuk baris ber-`simrs_patient_id` NULL — sehingga justru membuang
 * hampir semua pasien asli, yang memang tidak punya id SIMRS.
 *
 * Sisipkan lewat `AND` supaya tidak bentrok dengan OR milik pemanggil:
 *   where: { ...filterLain, AND: [BUKAN_PERSON_UJI] }
 */
export const BUKAN_PERSON_UJI = {
  OR: [
    { simrs_patient_id: null },
    { simrs_patient_id: { not: { startsWith: PENANDA_PERSON_UJI } } },
  ],
}

/** Cek satu person (hasil query) — untuk penyaringan di memori. */
export function isPersonUji(p: { simrs_patient_id?: string | null }): boolean {
  return !!p.simrs_patient_id?.startsWith(PENANDA_PERSON_UJI)
}
