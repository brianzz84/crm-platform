/**
 * Laporan percakapan — responsivitas Inbox lintas kanal.
 *
 * Sebelum ini, laporan triwulan sama sekali tidak menyebut Inbox: isinya hanya
 * konten yang diterbitkan dan Google Bisnis. Padahal di Inbox-lah pekerjaan
 * harian petugas terjadi, dan justru itu yang paling bisa dinilai.
 *
 * DUA KEHATI-HATIAN yang menentukan apakah angka ini layak dipercaya:
 *
 * 1. **Kedalaman riwayat tiap kanal berbeda.** WhatsApp punya riwayat penuh,
 *    Facebook sejak April 2026, Instagram baru sejak 30 Agu 2026. Menyajikannya
 *    tanpa keterangan akan membuat laporan menyatakan Instagram nyaris tanpa
 *    percakapan sepanjang kuartal lalu — dan itu bukan kekurangan data,
 *    melainkan kebohongan. Karena itu `terekamSejak` dikembalikan per kanal.
 *
 * 2. **Catatan internal bukan balasan.** `is_internal_note` dikecualikan dari
 *    seluruh perhitungan: catatan antar-petugas tidak pernah sampai ke pasien,
 *    dan menghitungnya sebagai jawaban membuat responsivitas tampak baik justru
 *    ketika tidak ada yang dijawab.
 */

import { getTenantDb } from './tenant'

export type KanalPercakapan = 'WA' | 'FB' | 'IG'
export const KANAL_PERCAKAPAN: KanalPercakapan[] = ['WA', 'FB', 'IG']

export interface SelPercakapan {
  percakapan:   number  // percakapan yang menerima setidaknya satu pesan masuk
  pesanMasuk:   number
  pesanKeluar:  number
  dijawab:      number  // giliran masuk yang akhirnya dibalas
  tidakDijawab: number
  medianMenit:  number | null
}

export interface BarisKanal {
  kanal:    KanalPercakapan
  perBulan: Record<string, SelPercakapan>
  total:    SelPercakapan
}

export interface LaporanPercakapan {
  bulan:        string[]
  terekamSejak: Record<string, string | null>
  perKanal:     BarisKanal[]
  /** Sebaran pesan masuk per jam WIB — dasar penjadwalan staf. */
  jamSibuk:     number[]
  ringkas: {
    pesanMasuk:   number
    pesanKeluar:  number
    dijawab:      number
    tidakDijawab: number
    medianMenit:  number | null
  }
}

const selKosong = (): SelPercakapan => ({
  percakapan: 0, pesanMasuk: 0, pesanKeluar: 0,
  dijawab: 0, tidakDijawab: 0, medianMenit: null,
})

function median(v: number[]): number | null {
  if (v.length === 0) return null
  const s = [...v].sort((a, b) => a - b)
  const t = Math.floor(s.length / 2)
  return s.length % 2 ? s[t] : Math.round((s[t - 1] + s[t]) / 2)
}

/** WIB, karena jam sibuk dibaca orang yang bekerja di Surabaya. */
const bulanWib = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 7)
const jamWib   = (d: Date) => new Date(d.getTime() + 7 * 3600_000).getUTCHours()

export async function rakitLaporanPercakapan(
  slug: string, mulai: string, selesai: string,
): Promise<LaporanPercakapan> {
  const db   = await getTenantDb(slug)
  const dari = new Date(`${mulai}T00:00:00.000Z`)
  // Sampai akhir hari: tanpa ini pesan yang datang pada tanggal terakhir hilang.
  const sampai = new Date(`${selesai}T23:59:59.999Z`)

  const [pesan, awalKanal] = await Promise.all([
    db.message.findMany({
      where: {
        created_at:       { gte: dari, lte: sampai },
        is_internal_note: false,
        conversation:     { tenant_slug: slug, channel: { in: KANAL_PERCAKAPAN } },
      },
      select: {
        conversation_id: true,
        direction:       true,
        created_at:      true,
        conversation:    { select: { channel: true } },
      },
      orderBy: { created_at: 'asc' },
    }),
    // Sejak kapan tiap kanal punya rekaman — dipakai menandai periode yang
    // memang belum terekam, bukan periode yang sepi.
    db.conversation.groupBy({
      by:     ['channel'],
      where:  { tenant_slug: slug, channel: { in: KANAL_PERCAKAPAN } },
      _min:   { created_at: true },
    }),
  ])

  const terekamSejak: Record<string, string | null> = {}
  for (const k of KANAL_PERCAKAPAN) {
    const b = awalKanal.find(a => a.channel === k)
    terekamSejak[k] = b?._min.created_at?.toISOString().slice(0, 10) ?? null
  }

  // ── Kelompokkan per percakapan, urut waktu ─────────────────────────────
  const perPercakapan = new Map<string, {
    kanal: KanalPercakapan
    pesan: { masuk: boolean; pada: Date }[]
  }>()

  const jamSibuk = new Array(24).fill(0)
  const bulanSet = new Set<string>()

  for (const p of pesan) {
    const kanal = p.conversation.channel as KanalPercakapan
    const masuk = p.direction === 'incoming'
    if (masuk) jamSibuk[jamWib(p.created_at)]++
    bulanSet.add(bulanWib(p.created_at))

    const g = perPercakapan.get(p.conversation_id) ?? { kanal, pesan: [] }
    g.pesan.push({ masuk, pada: p.created_at })
    perPercakapan.set(p.conversation_id, g)
  }

  // ── Hitung per kanal per bulan ─────────────────────────────────────────
  const peta = new Map<string, SelPercakapan>()          // `kanal|bulan`
  const jeda = new Map<string, number[]>()               // `kanal|bulan` → menit
  const kunci = (k: string, b: string) => `${k}|${b}`

  const ambil = (k: string, b: string) => {
    const kk = kunci(k, b)
    if (!peta.has(kk)) peta.set(kk, selKosong())
    return peta.get(kk)!
  }
  const catatJeda = (k: string, b: string, menit: number) => {
    const kk = kunci(k, b)
    if (!jeda.has(kk)) jeda.set(kk, [])
    jeda.get(kk)!.push(menit)
  }

  for (const g of perPercakapan.values()) {
    const bulanPertama = bulanWib(g.pesan[0].pada)
    ambil(g.kanal, bulanPertama).percakapan += g.pesan.some(p => p.masuk) ? 1 : 0

    // Menelusuri giliran: satu "giliran masuk" adalah rentetan pesan masuk yang
    // belum dijawab. Yang diukur jeda ke balasan pertama sesudahnya — bukan tiap
    // pesan, karena pengirim yang menulis lima pesan berturut-turut tidak
    // menciptakan lima kewajiban menjawab.
    let mulaiGiliran: Date | null = null

    for (const p of g.pesan) {
      const b = bulanWib(p.pada)
      const sel = ambil(g.kanal, b)

      if (p.masuk) {
        sel.pesanMasuk++
        if (!mulaiGiliran) mulaiGiliran = p.pada
      } else {
        sel.pesanKeluar++
        if (mulaiGiliran) {
          const menit = Math.max(0, Math.round((p.pada.getTime() - mulaiGiliran.getTime()) / 60_000))
          // Dicatat pada bulan giliran itu DIMULAI, bukan bulan balasannya —
          // kalau tidak, balasan terlambat lintas bulan akan memperbaiki angka
          // bulan berikutnya sekaligus memperburuk yang tidak bersalah.
          const bMulai = bulanWib(mulaiGiliran)
          ambil(g.kanal, bMulai).dijawab++
          catatJeda(g.kanal, bMulai, menit)
          mulaiGiliran = null
        }
      }
    }

    // Giliran yang masih terbuka di akhir percakapan = belum dijawab.
    if (mulaiGiliran) ambil(g.kanal, bulanWib(mulaiGiliran)).tidakDijawab++
  }

  for (const [kk, v] of jeda) {
    const sel = peta.get(kk)
    if (sel) sel.medianMenit = median(v)
  }

  const bulan = [...bulanSet].sort()

  const perKanal: BarisKanal[] = KANAL_PERCAKAPAN.map(kanal => {
    const perBulan: Record<string, SelPercakapan> = {}
    const semuaJeda: number[] = []
    const total = selKosong()

    for (const b of bulan) {
      const sel = peta.get(kunci(kanal, b)) ?? selKosong()
      perBulan[b] = sel
      total.percakapan   += sel.percakapan
      total.pesanMasuk   += sel.pesanMasuk
      total.pesanKeluar  += sel.pesanKeluar
      total.dijawab      += sel.dijawab
      total.tidakDijawab += sel.tidakDijawab
      semuaJeda.push(...(jeda.get(kunci(kanal, b)) ?? []))
    }
    total.medianMenit = median(semuaJeda)
    return { kanal, perBulan, total }
  })

  const seluruhJeda = [...jeda.values()].flat()

  return {
    bulan,
    terekamSejak,
    perKanal,
    jamSibuk,
    ringkas: {
      pesanMasuk:   perKanal.reduce((n, k) => n + k.total.pesanMasuk, 0),
      pesanKeluar:  perKanal.reduce((n, k) => n + k.total.pesanKeluar, 0),
      dijawab:      perKanal.reduce((n, k) => n + k.total.dijawab, 0),
      tidakDijawab: perKanal.reduce((n, k) => n + k.total.tidakDijawab, 0),
      medianMenit:  median(seluruhJeda),
    },
  }
}
