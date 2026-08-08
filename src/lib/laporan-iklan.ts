/**
 * Atribusi iklan → kunjungan, dihitung SEPENUHNYA di dalam CRM.
 *
 * KENAPA TIDAK DIKIRIM BALIK KE META. Cara lazimnya adalah mengirim event
 * konversi lewat Conversions API supaya algoritma Meta belajar. Untuk toko
 * sepatu itu wajar. Untuk rumah sakit, memberi tahu Meta bahwa "orang ini
 * konversi dari iklan Poli Jantung" berarti menyerahkan kesimpulan kesehatan
 * tentang orang yang dapat diidentifikasi — nomor telepon yang di-hash tetap
 * pengenal. UU PDP 27/2022 menggolongkan informasi kesehatan sebagai data
 * spesifik, dan kebijakan privasi RKZ sendiri menyatakan data ini tidak dipakai
 * untuk profil iklan. Jadi angkanya dihitung di sini dan berhenti di sini.
 *
 * RANTAINYA:
 *   AdReferral (ctwa_clid) → Conversation → Person → SimrsVisit dalam N hari
 *
 * Setiap sambungan bisa putus, dan laporan ini menyebutkan di mana putusnya
 * alih-alih menutupinya. Angka konversi yang membesar karena kegagalan
 * pencocokan disembunyikan jauh lebih berbahaya daripada angka yang kecil.
 */
import { getTenantDb } from './tenant'

/** Jendela atribusi bawaan. Keputusan berobat lambat — orang melihat iklan hari
 *  ini dan datang tiga pekan kemudian. Jendela 7 hari ala e-commerce akan
 *  melaporkan terlalu sedikit. */
export const JENDELA_BAWAAN_HARI = 30

export interface BarisIklan {
  source_id:      string | null
  headline:       string | null
  percakapan:     number
  /** Percakapan yang berhasil ditautkan ke seorang Person. */
  teridentifikasi: number
  /** Person unik — satu orang bisa mengklik lebih dari sekali. */
  orang:          number
  /** Person yang punya minimal satu kunjungan dalam jendela. */
  konversi:       number
  kunjungan:      number
  /** Poli yang paling sering muncul pada kunjungan hasil atribusi. */
  poliTeratas:    { nama: string; jumlah: number }[]
}

export interface HasilLaporanIklan {
  mulai:            string
  selesai:          string
  jendelaHari:      number
  totalPercakapan:  number
  /** Percakapan beriklan yang TIDAK bisa ditautkan ke Person mana pun. */
  tanpaPerson:      number
  totalOrang:       number
  totalKonversi:    number
  totalKunjungan:   number
  perIklan:         BarisIklan[]
  catatan:          string[]
}

export async function rakitLaporanIklan(
  slug: string,
  mulai: Date,
  selesai: Date,
  jendelaHari: number = JENDELA_BAWAAN_HARI,
): Promise<HasilLaporanIklan> {
  const db = await getTenantDb(slug)

  const referral = await db.adReferral.findMany({
    where:  { tenant_slug: slug, occurred_at: { gte: mulai, lte: selesai } },
    select: {
      source_id: true, headline: true, ctwa_clid: true, occurred_at: true,
      conversation: { select: { id: true, person_id: true } },
    },
    orderBy: { occurred_at: 'asc' },
  })

  // Kunjungan ditarik SEKALI untuk seluruh orang yang terlibat, bukan per baris.
  // Satu kueri per referral akan meledak begitu iklannya jalan beberapa bulan.
  const personIds = [...new Set(
    referral.map(r => r.conversation?.person_id).filter((v): v is string => !!v),
  )]

  const batasAkhir = new Date(selesai.getTime() + jendelaHari * 86_400_000)
  const kunjungan = personIds.length
    ? await db.simrsVisit.findMany({
        where: {
          person_id: { in: personIds },
          tanggal:   { gte: mulai, lte: batasAkhir },
          // Kunjungan yang batal bukan konversi. Memasukkannya akan membuat
          // iklan tampak berhasil justru ketika orangnya tidak jadi datang.
          NOT: { status_kunjungan: 'BATAL' },
        },
        select: { person_id: true, tanggal: true, poli: true },
      })
    : []

  const kunjunganPerOrang = new Map<string, { tanggal: Date; poli: string | null }[]>()
  for (const k of kunjungan) {
    const arr = kunjunganPerOrang.get(k.person_id) ?? []
    arr.push({ tanggal: k.tanggal, poli: k.poli })
    kunjunganPerOrang.set(k.person_id, arr)
  }

  interface Akun {
    headline: string | null
    percakapan: Set<string>
    teridentifikasi: Set<string>
    orang: Set<string>
    konversi: Set<string>
    kunjungan: number
    poli: Map<string, number>
  }
  const perIklan = new Map<string, Akun>()
  const orangSemua    = new Set<string>()
  const konversiSemua = new Set<string>()
  let kunjunganSemua  = 0
  let tanpaPerson     = 0

  for (const r of referral) {
    const kunci = r.source_id ?? '(tanpa id iklan)'
    let a = perIklan.get(kunci)
    if (!a) {
      a = { headline: r.headline, percakapan: new Set(), teridentifikasi: new Set(),
            orang: new Set(), konversi: new Set(), kunjungan: 0, poli: new Map() }
      perIklan.set(kunci, a)
    }
    if (!a.headline && r.headline) a.headline = r.headline

    const convId  = r.conversation?.id ?? ''
    const personId = r.conversation?.person_id ?? null
    if (convId) a.percakapan.add(convId)

    if (!personId) { tanpaPerson++; continue }

    if (convId) a.teridentifikasi.add(convId)
    a.orang.add(personId)
    orangSemua.add(personId)

    // Kunjungan hanya dihitung bila terjadi SESUDAH iklan diklik dan masih di
    // dalam jendela. Kunjungan yang mendahului kliknya jelas bukan akibatnya —
    // memasukkannya akan mengatribusikan pasien lama sebagai hasil iklan.
    const batas = new Date(r.occurred_at.getTime() + jendelaHari * 86_400_000)
    const cocok = (kunjunganPerOrang.get(personId) ?? [])
      .filter(k => k.tanggal >= r.occurred_at && k.tanggal <= batas)

    if (cocok.length) {
      a.konversi.add(personId)
      konversiSemua.add(personId)
      a.kunjungan     += cocok.length
      kunjunganSemua  += cocok.length
      for (const k of cocok) {
        const nama = k.poli || '(tanpa poli)'
        a.poli.set(nama, (a.poli.get(nama) ?? 0) + 1)
      }
    }
  }

  const baris: BarisIklan[] = [...perIklan.entries()]
    .map(([source_id, a]) => ({
      source_id:       source_id === '(tanpa id iklan)' ? null : source_id,
      headline:        a.headline,
      percakapan:      a.percakapan.size,
      teridentifikasi: a.teridentifikasi.size,
      orang:           a.orang.size,
      konversi:        a.konversi.size,
      kunjungan:       a.kunjungan,
      poliTeratas:     [...a.poli.entries()]
                         .map(([nama, jumlah]) => ({ nama, jumlah }))
                         .sort((x, y) => y.jumlah - x.jumlah)
                         .slice(0, 3),
    }))
    .sort((x, y) => y.konversi - x.konversi || y.percakapan - x.percakapan)

  // Catatan disusun dari keadaan data yang SEBENARNYA, bukan daftar peringatan
  // tetap. Peringatan yang selalu muncul akan berhenti dibaca orang.
  const catatan: string[] = []
  if (!referral.length) {
    catatan.push(
      'Belum ada jejak iklan pada periode ini. Penangkapan hanya bekerja pada jalur ' +
      'Meta Cloud API langsung — callback Wappin tidak membawa data referral sama sekali.',
    )
  }
  if (tanpaPerson) {
    catatan.push(
      `${tanpaPerson} percakapan beriklan belum tertaut ke data pasien, jadi kunjungannya ` +
      'tidak bisa dilacak. Umumnya karena nomor WhatsApp-nya belum pernah tercatat di SIMRS.',
    )
  }
  catatan.push(
    `Jendela atribusi ${jendelaHari} hari sejak iklan diklik. Kunjungan yang mendahului klik ` +
    'tidak dihitung, dan kunjungan berstatus BATAL dikeluarkan.',
  )
  catatan.push(
    'Angka ini tidak dikirim ke Meta. Atribusi dihitung dan berhenti di dalam CRM, ' +
    'karena mengirim konversi layanan kesehatan atas orang yang dapat diidentifikasi ' +
    'tergolong data pribadi spesifik menurut UU PDP 27/2022.',
  )

  return {
    mulai:           mulai.toISOString().slice(0, 10),
    selesai:         selesai.toISOString().slice(0, 10),
    jendelaHari,
    totalPercakapan: referral.length,
    tanpaPerson,
    totalOrang:      orangSemua.size,
    totalKonversi:   konversiSemua.size,
    totalKunjungan:  kunjunganSemua,
    perIklan:        baris,
    catatan,
  }
}
