/**
 * Resolusi identitas Person — satu-satunya tempat yang boleh memutuskan
 * "baris Person mana yang dimaksud" oleh data yang masuk.
 *
 * Ada TIGA kunci dengan tugas berbeda, dan membedakannya adalah inti modul ini:
 *
 *  - `Person.id`  — kunci internal. Hanya untuk relasi antar tabel. Tidak pernah
 *                   dikirim ke/menerima dari sistem luar.
 *  - `no_rm`      — kunci IDENTITAS dari SIMRS, dan satu-satunya penghubung antara
 *                   API data pasien dan API data kunjungan (dua API terpisah).
 *  - `no_hp`      — ALAMAT KONTAK, bukan identitas. Nomor bisa berganti, dipakai
 *                   bersama satu keluarga, dan didaur ulang operator. Boleh dipakai
 *                   untuk MENGARAHKAN pesan masuk ke orangnya, TIDAK BOLEH dipakai
 *                   untuk memutuskan dua baris adalah orang yang sama.
 *
 * Soal penggabungan: RKZ selalu menerbitkan RM baru, dan satu orang bisa terlanjur
 * punya beberapa RM (mis. kasir keliru membuat RM baru untuk pasien lama). SIMRS
 * TIDAK memberi tahu kita saat itu terjadi dan akan selamanya tetap mengirim
 * kunjungan memakai RM lama. Karena itu baris lama tidak dihapus: ia jadi "baris
 * nisan" yang menunjuk ke baris yang bertahan lewat `digabung_ke_person_id`, dan
 * setiap pencarian di sini wajib mengikuti penunjuk itu sampai ujung.
 */
import type { PrismaClient } from '../generated/prisma/client'

/** Batas panjang rantai gabungan. Praktiknya selalu 1; ini jaring pengaman. */
const MAKS_RANTAI = 10

export interface PersonRingkas {
  id: string
  name: string
  no_rm: string | null
  no_hp: string | null
  no_hp_2: string | null
  is_rintisan: boolean
  digabung_ke_person_id: string | null
}

const PILIH_RINGKAS = {
  id: true, name: true, no_rm: true, no_hp: true, no_hp_2: true,
  is_rintisan: true, digabung_ke_person_id: true,
} as const

/**
 * Ikuti rantai penggabungan sampai baris yang bertahan.
 *
 * Melempar error kalau menemukan siklus (A→B→A) atau rantai tak wajar panjangnya:
 * lebih baik gagal berisik daripada diam-diam menautkan kunjungan ke orang yang salah.
 */
export async function ikutiGabungan(db: PrismaClient, awal: PersonRingkas): Promise<PersonRingkas> {
  let kini = awal
  const dilalui = new Set<string>([kini.id])

  for (let i = 0; i < MAKS_RANTAI; i++) {
    if (!kini.digabung_ke_person_id) return kini

    const berikut = await db.person.findUnique({
      where:  { id: kini.digabung_ke_person_id },
      select: PILIH_RINGKAS,
    })
    if (!berikut) {
      throw new Error(
        `Rantai gabungan putus: person ${kini.id} menunjuk ke ${kini.digabung_ke_person_id} yang tidak ada.`
      )
    }
    if (dilalui.has(berikut.id)) {
      throw new Error(`Siklus penggabungan terdeteksi pada person ${berikut.id} — data perlu diperbaiki manual.`)
    }
    dilalui.add(berikut.id)
    kini = berikut
  }
  throw new Error(`Rantai gabungan melebihi ${MAKS_RANTAI} tingkat mulai dari person ${awal.id}.`)
}

/**
 * Cari orang berdasarkan no. RM (jalur SIMRS).
 * Mengembalikan baris yang BERTAHAN, walaupun RM-nya menempel di baris nisan.
 */
export async function cariPersonByRm(
  db: PrismaClient, tenantSlug: string, noRm: string,
): Promise<PersonRingkas | null> {
  const p = await db.person.findUnique({
    where:  { tenant_slug_no_rm: { tenant_slug: tenantSlug, no_rm: noRm } },
    select: PILIH_RINGKAS,
  })
  return p ? ikutiGabungan(db, p) : null
}

/**
 * Cari orang berdasarkan nomor HP (jalur pesan masuk / atribusi campaign).
 * Mencocokkan ke nomor utama MAUPUN nomor alternatif, karena yang mengirim pesan
 * bisa saja keluarga/wali, bukan pasiennya sendiri.
 *
 * Ini pencarian ALAMAT, bukan penetapan identitas — jangan dipakai untuk menyimpulkan
 * dua baris adalah orang yang sama (lihat deteksi duplikat di person-merge.ts).
 */
export async function cariPersonByNomor(
  db: PrismaClient, tenantSlug: string, nomor: string,
): Promise<PersonRingkas | null> {
  const p = await db.person.findFirst({
    where:  { tenant_slug: tenantSlug, OR: [{ no_hp: nomor }, { no_hp_2: nomor }] },
    select: PILIH_RINGKAS,
    // Baris nisan diletakkan belakangan supaya baris hidup menang kalau nomornya sama
    orderBy: [{ digabung_ke_person_id: { sort: 'asc', nulls: 'first' } }, { created_at: 'asc' }],
  })
  return p ? ikutiGabungan(db, p) : null
}

/**
 * Pastikan ada baris Person untuk sebuah no. RM — dipakai saat KUNJUNGAN tiba lebih
 * dulu daripada data pasiennya (dua API, dua jadwal).
 *
 * Kalau belum ada, dibuat baris RINTISAN: hanya berisi no_rm, ditandai `is_rintisan`
 * supaya (a) jelas datanya belum lengkap, dan (b) dikecualikan dari pengiriman pesan
 * lewat test-data-guard. Saat data pasien menyusul, baris yang sama tinggal dilengkapi.
 *
 * Tanpa ini, kunjungan yang datang duluan akan ditolak foreign key dan HILANG diam-diam —
 * persis kelas kegagalan yang dulu memunculkan 1.745 baris yatim di PersonContact.
 */
export async function pastikanPersonDariRm(
  db: PrismaClient, tenantSlug: string, noRm: string,
): Promise<PersonRingkas> {
  const ada = await cariPersonByRm(db, tenantSlug, noRm)
  if (ada) return ada

  // upsert, bukan create — dua sync yang berjalan bersamaan bisa berlomba di sini
  const baru = await db.person.upsert({
    where:  { tenant_slug_no_rm: { tenant_slug: tenantSlug, no_rm: noRm } },
    update: {},
    create: {
      tenant_slug:     tenantSlug,
      no_rm:           noRm,
      name:            `(Menunggu data pasien) ${noRm}`,
      sumber:          'SIMRS',
      is_pasien_simrs: true,
      is_rintisan:     true,
      aktif:           true,
    },
    select: PILIH_RINGKAS,
  })
  return baru
}
