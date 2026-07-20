/**
 * Penggabungan dua Person yang ternyata orang yang sama, plus deteksi calon duplikat.
 *
 * Kenapa ini perlu: data pasien dan data kunjungan datang dari dua API SIMRS yang
 * berbeda, dijahit lewat no_rm. RKZ SELALU menerbitkan RM baru, dan satu orang bisa
 * terlanjur punya beberapa RM (mis. kasir keliru membuat RM baru untuk pasien lama).
 * SIMRS tidak memberi tahu kita saat hal itu ketahuan, jadi penyatuannya dilakukan
 * MANUAL di sistem ini. Sistem ini tidak pernah menulis balik ke SIMRS.
 *
 * Dua prinsip yang menentukan bentuk kode di bawah:
 *
 * 1. TIDAK ADA OPERASI MERUSAK. Baris yang kalah tidak dihapus — ia jadi baris nisan
 *    yang menunjuk ke penyintas. Baris anak yang BENTROK (mis. tag yang sama sudah
 *    dimiliki penyintas) dibiarkan tertinggal, bukan dihapus: bentrok justru berarti
 *    penyintas sudah punya padanannya, jadi tidak ada informasi yang hilang. Efeknya
 *    pembatalan cukup memindahkan balik daftar id — tanpa perlu menyusun ulang baris.
 *
 * 2. TIDAK ADA PENGGABUNGAN OTOMATIS. Deteksi hanya mengusulkan; petugas yang
 *    memutuskan. Di rumah sakit, satu nomor HP lazim dipakai bersama (ibu dan anak),
 *    sehingga menggabungkan hanya berdasar nomor akan mencampur riwayat kunjungan dan
 *    diagnosis dua orang berbeda. Salah gabung jauh lebih mahal daripada telat gabung.
 *
 * Nomor lama tetap bisa dihubungi tanpa perlu menyalin apa pun: baris nisan masih
 * memegang nomornya, dan cariPersonByNomor() di person-identity.ts mengikuti penunjuk
 * gabungan sampai ke penyintas.
 */
import type { PrismaClient } from '../generated/prisma/client'

/**
 * Batas waktu transaksi. Bawaan Prisma 5 detik terlalu pendek: penggabungan
 * menjalankan belasan query berurutan, dan pasien lama bisa punya ratusan kunjungan.
 * Ini operasi manual yang jarang, jadi menunggu lebih lama jauh lebih baik daripada
 * gagal di tengah jalan.
 */
const OPSI_TRANSAKSI = { maxWait: 15_000, timeout: 60_000 } as const

/** Ringkasan apa saja yang berpindah — disimpan di PersonMergeLog untuk pembatalan. */
export interface RincianPindah {
  visits:              string[]
  conversations:       string[]
  campaign_recipients: string[]
  person_tags:         string[]
  kegiatan_peserta:    string[]
  kontak_langsung:     string[]
  loyalty:             string[]
  sapaan_logs:         string[]
  /** Baris yang sengaja DIBIARKAN di baris nisan karena bentrok kunci unik. */
  tertinggal: { tabel: string; jumlah: number }[]
}

const KOSONG = (): RincianPindah => ({
  visits: [], conversations: [], campaign_recipients: [], person_tags: [],
  kegiatan_peserta: [], kontak_langsung: [], loyalty: [], sapaan_logs: [], tertinggal: [],
})

export interface HasilGabung {
  mergeLogId: string
  dipindahkan: RincianPindah
}

/**
 * Gabungkan `sumberId` ke dalam `tujuanId`.
 *
 * Seluruh operasi berada dalam satu transaksi: kalau ada satu langkah gagal, tidak
 * ada perubahan separuh jalan yang tertinggal.
 */
export async function gabungkanPerson(
  db: PrismaClient,
  opsi: { tenantSlug: string; sumberId: string; tujuanId: string; alasan: string; olehUserId: string },
): Promise<HasilGabung> {
  const { tenantSlug, sumberId, tujuanId, alasan, olehUserId } = opsi

  if (sumberId === tujuanId) throw new Error('Tidak bisa menggabungkan orang dengan dirinya sendiri.')
  if (!alasan.trim())        throw new Error('Alasan penggabungan wajib diisi.')

  return db.$transaction(async (tx) => {
    const [sumber, tujuan] = await Promise.all([
      tx.person.findFirst({ where: { id: sumberId, tenant_slug: tenantSlug } }),
      tx.person.findFirst({ where: { id: tujuanId, tenant_slug: tenantSlug } }),
    ])
    if (!sumber) throw new Error('Person sumber tidak ditemukan di tenant ini.')
    if (!tujuan) throw new Error('Person tujuan tidak ditemukan di tenant ini.')
    if (sumber.digabung_ke_person_id) throw new Error('Person sumber sudah pernah digabungkan.')
    if (tujuan.digabung_ke_person_id) throw new Error('Person tujuan sendiri sudah digabungkan ke orang lain.')

    const pindah = KOSONG()

    // ── Tabel tanpa kunci unik ber-person_id: semua baris bisa langsung berpindah ──
    for (const [key, model] of [
      ['conversations',   tx.conversation],
      ['kontak_langsung', tx.kontakLangsung],
      ['loyalty',         tx.loyaltyTransaction],
      ['sapaan_logs',     tx.sapaanLog],
    ] as const) {
      const baris = await (model as any).findMany({ where: { person_id: sumberId }, select: { id: true } })
      if (baris.length) {
        await (model as any).updateMany({ where: { person_id: sumberId }, data: { person_id: tujuanId } })
        ;(pindah as any)[key] = baris.map((b: { id: string }) => b.id)
      }
    }

    // ── Tabel dengan kunci unik ber-person_id: pindahkan hanya yang tidak bentrok ──

    // SimrsVisit: unik (person_id, simrs_visit_id). NULL tidak pernah bentrok di Postgres.
    const visitTujuan = await tx.simrsVisit.findMany({
      where: { person_id: tujuanId, simrs_visit_id: { not: null } }, select: { simrs_visit_id: true },
    })
    const idVisitTujuan = visitTujuan.map(v => v.simrs_visit_id!)
    const visitPindah = await tx.simrsVisit.findMany({
      where: {
        person_id: sumberId,
        OR: [{ simrs_visit_id: null }, { simrs_visit_id: { notIn: idVisitTujuan } }],
      },
      select: { id: true },
    })
    const totalVisitSumber = await tx.simrsVisit.count({ where: { person_id: sumberId } })
    if (visitPindah.length) {
      await tx.simrsVisit.updateMany({
        where: { id: { in: visitPindah.map(v => v.id) } }, data: { person_id: tujuanId },
      })
      pindah.visits = visitPindah.map(v => v.id)
    }
    catatTertinggal(pindah, 'crm_simrs_visits', totalVisitSumber - visitPindah.length)

    // CampaignRecipient: unik (campaign_id, person_id, no_hp)
    const rcpTujuan = await tx.campaignRecipient.findMany({
      where: { person_id: tujuanId }, select: { campaign_id: true, no_hp: true },
    })
    const kunciTujuan = new Set(rcpTujuan.map(r => `${r.campaign_id}|${r.no_hp}`))
    const rcpSumber = await tx.campaignRecipient.findMany({
      where: { person_id: sumberId }, select: { id: true, campaign_id: true, no_hp: true },
    })
    const rcpPindah = rcpSumber.filter(r => !kunciTujuan.has(`${r.campaign_id}|${r.no_hp}`))
    if (rcpPindah.length) {
      await tx.campaignRecipient.updateMany({
        where: { id: { in: rcpPindah.map(r => r.id) } }, data: { person_id: tujuanId },
      })
      pindah.campaign_recipients = rcpPindah.map(r => r.id)
    }
    catatTertinggal(pindah, 'crm_campaign_recipients', rcpSumber.length - rcpPindah.length)

    // PersonTag: unik (person_id, tag_id)
    const tagTujuan = await tx.personTag.findMany({ where: { person_id: tujuanId }, select: { tag_id: true } })
    const idTagTujuan = tagTujuan.map(t => t.tag_id)
    const tagSumber = await tx.personTag.findMany({ where: { person_id: sumberId }, select: { id: true, tag_id: true } })
    const tagPindah = tagSumber.filter(t => !idTagTujuan.includes(t.tag_id))
    if (tagPindah.length) {
      await tx.personTag.updateMany({
        where: { id: { in: tagPindah.map(t => t.id) } }, data: { person_id: tujuanId },
      })
      pindah.person_tags = tagPindah.map(t => t.id)
    }
    catatTertinggal(pindah, 'crm_person_tags', tagSumber.length - tagPindah.length)

    // KegiatanPeserta: unik (kegiatan_id, person_id)
    const kegTujuan = await tx.kegiatanPeserta.findMany({ where: { person_id: tujuanId }, select: { kegiatan_id: true } })
    const idKegTujuan = kegTujuan.map(k => k.kegiatan_id)
    const kegSumber = await tx.kegiatanPeserta.findMany({ where: { person_id: sumberId }, select: { id: true, kegiatan_id: true } })
    const kegPindah = kegSumber.filter(k => !idKegTujuan.includes(k.kegiatan_id))
    if (kegPindah.length) {
      await tx.kegiatanPeserta.updateMany({
        where: { id: { in: kegPindah.map(k => k.id) } }, data: { person_id: tujuanId },
      })
      pindah.kegiatan_peserta = kegPindah.map(k => k.id)
    }
    catatTertinggal(pindah, 'crm_kegiatan_peserta', kegSumber.length - kegPindah.length)

    // ── Jadikan sumber sebagai baris nisan ──
    // no_rm-nya SENGAJA dipertahankan: SIMRS akan terus mengirim kunjungan memakai RM
    // lama, dan baris inilah yang membuat kunjungan itu tetap ketemu jalannya.
    await tx.person.update({
      where: { id: sumberId },
      data: {
        digabung_ke_person_id: tujuanId,
        digabung_at:           new Date(),
        digabung_oleh:         olehUserId,
        digabung_alasan:       alasan.trim(),
        aktif:                 false,
      },
    })

    const log = await tx.personMergeLog.create({
      data: {
        tenant_slug:      tenantSlug,
        person_sumber_id: sumberId,
        person_tujuan_id: tujuanId,
        alasan:           alasan.trim(),
        dipindahkan:      pindah as unknown as object,
        dilakukan_oleh:   olehUserId,
      },
    })

    return { mergeLogId: log.id, dipindahkan: pindah }
  }, OPSI_TRANSAKSI)
}

function catatTertinggal(pindah: RincianPindah, tabel: string, jumlah: number) {
  if (jumlah > 0) pindah.tertinggal.push({ tabel, jumlah })
}

/**
 * Batalkan penggabungan: kembalikan baris yang tadi berpindah, hidupkan lagi baris nisan.
 *
 * Hanya baris yang tercatat di `dipindahkan` yang dikembalikan — baris yang sejak awal
 * memang milik penyintas tidak ikut tersentuh. Itulah gunanya mencatat id, bukan sekadar
 * "pindahkan semua milik penyintas kembali ke sumber".
 */
export async function batalkanPenggabungan(
  db: PrismaClient,
  opsi: { tenantSlug: string; mergeLogId: string; olehUserId: string },
): Promise<void> {
  const { tenantSlug, mergeLogId, olehUserId } = opsi

  await db.$transaction(async (tx) => {
    const log = await tx.personMergeLog.findFirst({ where: { id: mergeLogId, tenant_slug: tenantSlug } })
    if (!log)               throw new Error('Catatan penggabungan tidak ditemukan.')
    if (log.dibatalkan_at)  throw new Error('Penggabungan ini sudah pernah dibatalkan.')

    const d = log.dipindahkan as unknown as RincianPindah
    const kembali = async (model: any, ids: string[] | undefined) => {
      if (ids?.length) await model.updateMany({ where: { id: { in: ids } }, data: { person_id: log.person_sumber_id } })
    }

    await kembali(tx.simrsVisit,         d.visits)
    await kembali(tx.conversation,       d.conversations)
    await kembali(tx.campaignRecipient,  d.campaign_recipients)
    await kembali(tx.personTag,          d.person_tags)
    await kembali(tx.kegiatanPeserta,    d.kegiatan_peserta)
    await kembali(tx.kontakLangsung,     d.kontak_langsung)
    await kembali(tx.loyaltyTransaction, d.loyalty)
    await kembali(tx.sapaanLog,          d.sapaan_logs)

    await tx.person.update({
      where: { id: log.person_sumber_id },
      data: {
        digabung_ke_person_id: null, digabung_at: null, digabung_oleh: null, digabung_alasan: null,
        aktif: true,
      },
    })

    await tx.personMergeLog.update({
      where: { id: log.id },
      data:  { dibatalkan_at: new Date(), dibatalkan_oleh: olehUserId },
    })
  }, OPSI_TRANSAKSI)
}

// ─────────────────────────────────────────────────────────
// Deteksi calon duplikat — MENGUSULKAN saja, tidak menggabungkan
// ─────────────────────────────────────────────────────────

export type TingkatKeyakinan = 'tinggi' | 'sedang' | 'rendah'

export interface CalonDuplikat {
  person_a_id: string
  person_b_id: string
  a_nama: string; a_no_rm: string | null; a_no_hp: string | null; a_tanggal_lahir: Date | null
  b_nama: string; b_no_rm: string | null; b_no_hp: string | null; b_tanggal_lahir: Date | null
  dasar: string
  keyakinan: TingkatKeyakinan
}

/**
 * Cari pasangan Person yang mungkin orang yang sama.
 *
 * Aturannya sengaja bertingkat, dan nomor HP saja TIDAK PERNAH cukup untuk keyakinan
 * tinggi — di rumah sakit satu nomor lazim dipakai satu keluarga.
 *
 * Baris nisan dan baris rintisan dikecualikan, begitu juga pasangan yang sudah
 * dinilai petugas sebagai bukan duplikat.
 */
export async function cariCalonDuplikat(
  db: PrismaClient, tenantSlug: string, batas = 100,
): Promise<CalonDuplikat[]> {
  const rows = await db.$queryRawUnsafe<CalonDuplikat[]>(
    `
    WITH hidup AS (
      SELECT id, name, no_rm, no_hp, no_hp_2, nik, tanggal_lahir
      FROM crm_persons
      WHERE tenant_slug = $1
        AND digabung_ke_person_id IS NULL
        AND is_rintisan = false
    ),
    pasangan AS (
      SELECT
        a.id AS person_a_id, b.id AS person_b_id,
        a.name AS a_nama, a.no_rm AS a_no_rm, a.no_hp AS a_no_hp, a.tanggal_lahir AS a_tanggal_lahir,
        b.name AS b_nama, b.no_rm AS b_no_rm, b.no_hp AS b_no_hp, b.tanggal_lahir AS b_tanggal_lahir,
        CASE
          WHEN a.nik IS NOT NULL AND a.nik = b.nik                       THEN 'NIK sama'
          WHEN a.tanggal_lahir IS NOT NULL AND a.tanggal_lahir = b.tanggal_lahir
               AND lower(a.name) = lower(b.name)                         THEN 'Nama & tanggal lahir sama'
          WHEN a.tanggal_lahir IS NOT NULL AND a.tanggal_lahir = b.tanggal_lahir
               AND (a.no_hp = b.no_hp OR a.no_hp = b.no_hp_2 OR a.no_hp_2 = b.no_hp)
                                                                         THEN 'Nomor HP & tanggal lahir sama'
          WHEN lower(a.name) = lower(b.name)
               AND (a.no_hp = b.no_hp OR a.no_hp = b.no_hp_2 OR a.no_hp_2 = b.no_hp)
                                                                         THEN 'Nama & nomor HP sama'
          ELSE 'Nomor HP sama'
        END AS dasar,
        CASE
          WHEN a.nik IS NOT NULL AND a.nik = b.nik                       THEN 'tinggi'
          WHEN a.tanggal_lahir IS NOT NULL AND a.tanggal_lahir = b.tanggal_lahir
               AND lower(a.name) = lower(b.name)                         THEN 'tinggi'
          WHEN a.tanggal_lahir IS NOT NULL AND a.tanggal_lahir = b.tanggal_lahir
                                                                         THEN 'sedang'
          WHEN lower(a.name) = lower(b.name)                             THEN 'sedang'
          ELSE 'rendah'
        END AS keyakinan
      FROM hidup a
      JOIN hidup b
        ON a.id < b.id                       -- tiap pasangan sekali saja, urutan tetap
       AND (
             (a.nik IS NOT NULL AND a.nik = b.nik)
          OR (a.no_hp IS NOT NULL AND (a.no_hp = b.no_hp OR a.no_hp = b.no_hp_2))
          OR (a.no_hp_2 IS NOT NULL AND a.no_hp_2 = b.no_hp)
          OR (a.tanggal_lahir IS NOT NULL AND a.tanggal_lahir = b.tanggal_lahir
              AND lower(a.name) = lower(b.name))
       )
    )
    SELECT p.* FROM pasangan p
    WHERE NOT EXISTS (
      SELECT 1 FROM crm_person_duplikat_diabaikan d
      WHERE d.tenant_slug = $1 AND d.person_a_id = p.person_a_id AND d.person_b_id = p.person_b_id
    )
    ORDER BY CASE p.keyakinan WHEN 'tinggi' THEN 1 WHEN 'sedang' THEN 2 ELSE 3 END, p.a_nama
    LIMIT ${Number(batas) || 100}
    `,
    tenantSlug,
  )
  return rows
}

/** Susun pasangan dalam urutan tetap supaya (A,B) dan (B,A) tidak tercatat dua kali. */
export function urutkanPasangan(id1: string, id2: string): [string, string] {
  return id1 < id2 ? [id1, id2] : [id2, id1]
}
