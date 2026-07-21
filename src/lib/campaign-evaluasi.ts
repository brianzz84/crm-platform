/**
 * Evaluasi hasil campaign broadcast: funnel pengiriman, sentimen balasan chat, dan
 * konversi kunjungan sesudahnya.
 *
 * Tiga hal yang menentukan bentuk kode di bawah — jangan diubah tanpa memahami
 * alasannya, karena masing-masing memperbaiki cara berpikir yang keliru:
 *
 * 1. FUNNEL TIDAK DIBATASI JENDELA WAKTU. Terkirim/dibaca/dibalas adalah hitungan
 *    seumur hidup campaign — orang bisa membalas kapan saja, dan membatasi funnel ke
 *    jendela 30 hari berarti balasan di hari ke-31 hilang dari hitungan tanpa alasan.
 *    Yang DIBATASI jendela waktu hanya KONVERSI dan BASELINE, karena keduanya soal
 *    atribusi ("apakah kunjungan ini wajar dianggap akibat campaign"), bukan soal
 *    "apakah orangnya pernah merespons".
 *
 * 2. KONVERSI MENGECUALIKAN YANG SUDAH TERJADWAL. Kalau seseorang sudah punya
 *    jadwal_kontrol dari kunjungan SEBELUM campaign dikirim, dan jadwal itu jatuh di
 *    dalam jendela evaluasi, kedatangannya bukan hasil campaign — itu jadwal yang
 *    memang sudah ada. Tanpa pengecualian ini, angka konversi menyesatkan ke arah
 *    optimistis.
 *
 * 3. BASELINE BUKAN BUKTI SEBAB-AKIBAT. Ia cuma pembanding kasar: berapa banyak
 *    penerima yang berkunjung SEBELUM campaign vs SESUDAH, dalam rentang hari yang
 *    sama. Dengan jumlah penerima kecil, selisihnya bisa kebetulan — UI wajib
 *    menyatakan ini secara eksplisit, bukan menyembunyikannya di balik angka rapi.
 */
import type { PrismaClient } from '../generated/prisma/client'
import { getAiProviderForTenant } from './ai-provider'

const HARI_MS = 86_400_000

export interface FunnelEvaluasi {
  totalPenerima: number
  terkirim: number
  diterima: number
  dibaca: number
  dibalas: number
  // terkirim - dibalas. AMAN dihitung begini (bukan lewat query terpisah) karena
  // inbox-handler.ts hanya men-set replied_at pada baris berstatus SENT/DELIVERED/
  // READ, tidak pernah pada FAILED — jadi dibalas selalu subset dari terkirim,
  // hasilnya tidak akan pernah negatif.
  tidakMembalas: number
  gagal: number
  errorBreakdown: { kode: string; jumlah: number }[]
}

export type KategoriSentimen = 'tertarik' | 'tanya' | 'menolak' | 'komplain' | 'salah_sasaran' | 'lainnya'

export interface SentimenRekap {
  kategori: KategoriSentimen
  jumlah: number
}

export interface KonversiRow {
  personId: string
  nama: string
  tanggal: Date
  hariSetelahKirim: number
  layanan: string
  jenis: 'langsung' | 'produk_lain'
  pernahMembalas: boolean
}

export interface SudahTerjadwalRow {
  personId: string
  nama: string
  jadwalKontrol: Date
}

export interface BaselineEvaluasi {
  sebelum: number   // orang dengan kunjungan apa pun, N hari SEBELUM kirim
  sesudah: number   // orang dengan kunjungan apa pun, N hari SESUDAH kirim
  selisih: number
}

/** Dihitung per ORANG (bukan per kunjungan) — satu orang yang datang beberapa kali
 * tidak boleh menggandakan hitungan "berapa orang yang konversi". */
export interface RingkasanKonversi {
  orangBerkunjung: number
  orangAmbilPromo: number
  orangProdukLain: number
  orangTanpaBalas: number
}

export interface EvaluasiCampaignResult {
  belumDikirim: boolean
  hariWindow: number
  windowMulai: Date | null
  windowSelesai: Date | null
  funnel: FunnelEvaluasi
  sentimenRekap: SentimenRekap[]
  belumDihitungSentimen: number   // sudah_membalas tapi sentimen belum pernah dihitung
  konversi: KonversiRow[]         // satu baris PER KUNJUNGAN, bukan per orang — lihat catatan di hitungEvaluasiCampaign
  ringkasanKonversi: RingkasanKonversi
  sudahTerjadwal: SudahTerjadwalRow[]
  baseline: BaselineEvaluasi
}

const KATEGORI_VALID: KategoriSentimen[] = ['tertarik', 'tanya', 'menolak', 'komplain', 'salah_sasaran', 'lainnya']

function kosongkanFunnel(): FunnelEvaluasi {
  return { totalPenerima: 0, terkirim: 0, diterima: 0, dibaca: 0, dibalas: 0, tidakMembalas: 0, gagal: 0, errorBreakdown: [] }
}

function kosongkanRingkasanKonversi(): RingkasanKonversi {
  return { orangBerkunjung: 0, orangAmbilPromo: 0, orangProdukLain: 0, orangTanpaBalas: 0 }
}

export async function hitungEvaluasiCampaign(
  db: PrismaClient, tenantSlug: string, campaignId: string, hariWindow: number,
): Promise<EvaluasiCampaignResult> {
  if (!Number.isFinite(hariWindow) || hariWindow < 1 || hariWindow > 730) {
    throw new Error('hariWindow harus antara 1 dan 730 hari.')
  }

  const campaign = await db.campaign.findFirst({ where: { id: campaignId, tenant_slug: tenantSlug } })
  if (!campaign) throw new Error('Campaign tidak ditemukan.')

  // Titik awal (anchor) untuk atribusi HARUS started_at, bukan jadwal_kirim: campaign
  // yang dikirim langsung (bukan dijadwalkan) tidak selalu punya jadwal_kirim, tapi
  // started_at selalu terisi begitu proses kirim benar-benar dimulai.
  const anchor = campaign.started_at ?? campaign.jadwal_kirim
  if (!anchor) {
    return {
      belumDikirim: true, hariWindow, windowMulai: null, windowSelesai: null,
      funnel: kosongkanFunnel(), sentimenRekap: [], belumDihitungSentimen: 0,
      konversi: [], ringkasanKonversi: kosongkanRingkasanKonversi(),
      sudahTerjadwal: [], baseline: { sebelum: 0, sesudah: 0, selisih: 0 },
    }
  }

  const windowMulai   = anchor
  const windowSelesai = new Date(anchor.getTime() + hariWindow * HARI_MS)
  const baselineMulai = new Date(anchor.getTime() - hariWindow * HARI_MS)

  const recipients = await db.campaignRecipient.findMany({
    where:  { campaign_id: campaignId },
    select: {
      id: true, person_id: true, nama: true, status: true, no_hp: true,
      delivered_at: true, read_at: true, replied_at: true, error_code: true,
      sentimen: true, sentimen_at: true,
    },
  })

  // ── Funnel (seumur hidup, tidak dibatasi jendela) ──
  const errMap = new Map<string, number>()
  for (const r of recipients) {
    if (r.error_code) errMap.set(r.error_code, (errMap.get(r.error_code) ?? 0) + 1)
  }
  const funnel: FunnelEvaluasi = {
    totalPenerima:  recipients.length,
    terkirim:       recipients.filter(r => r.status !== 'FAILED').length,
    diterima:       recipients.filter(r => !!r.delivered_at).length,
    dibaca:         recipients.filter(r => !!r.read_at).length,
    dibalas:        recipients.filter(r => !!r.replied_at).length,
    // Dihitung langsung dari baris (bukan terkirim - dibalas) supaya tidak bergantung
    // pada definisi "terkirim" di atas tetap sama persis — tetap benar walau salah
    // satunya berubah nanti.
    tidakMembalas:  recipients.filter(r => r.status !== 'FAILED' && !r.replied_at).length,
    gagal:          recipients.filter(r => r.status === 'FAILED').length,
    errorBreakdown: Array.from(errMap, ([kode, jumlah]) => ({ kode, jumlah })),
  }

  // ── Sentimen (dari nilai TERSIMPAN — tidak memanggil AI di sini, lihat hitungUlangSentimenCampaign) ──
  const sentimenMap = new Map<KategoriSentimen, number>()
  let belumDihitungSentimen = 0
  for (const r of recipients) {
    if (!r.replied_at) continue
    if (!r.sentimen) { belumDihitungSentimen++; continue }
    const kat = (KATEGORI_VALID as string[]).includes(r.sentimen) ? (r.sentimen as KategoriSentimen) : 'lainnya'
    sentimenMap.set(kat, (sentimenMap.get(kat) ?? 0) + 1)
  }
  const sentimenRekap = Array.from(sentimenMap, ([kategori, jumlah]) => ({ kategori, jumlah }))

  const personIds = Array.from(new Set(recipients.map(r => r.person_id)))
  const namaByPerson = new Map(recipients.map(r => [r.person_id, r.nama]))
  const pernahMembalasByPerson = new Set(recipients.filter(r => r.replied_at).map(r => r.person_id))

  if (personIds.length === 0) {
    return {
      belumDikirim: false, hariWindow, windowMulai, windowSelesai,
      funnel, sentimenRekap, belumDihitungSentimen,
      konversi: [], ringkasanKonversi: kosongkanRingkasanKonversi(),
      sudahTerjadwal: [], baseline: { sebelum: 0, sesudah: 0, selisih: 0 },
    }
  }

  // ── Kecualikan yang SUDAH DIJADWALKAN kontrol sebelum campaign, jatuh DI DALAM jendela ──
  // Rencana kontrol kini entitas sendiri (SimrsRencanaKontrol), bukan kolom di kunjungan.
  // Syarat "sebelum campaign": created_at < anchor — artinya rencana ini sudah kita
  // ketahui saat campaign dikirim, jadi kedatangannya bukan hasil campaign. Rencana yang
  // MUNCUL setelah campaign justru bisa jadi buah campaign, maka TIDAK dikecualikan.
  const rencanaSebelum = await db.simrsRencanaKontrol.findMany({
    where: {
      person_id:       { in: personIds },
      tanggal_rencana: { gte: windowMulai, lte: windowSelesai },
      status:          { in: ['terjadwal', 'terpenuhi'] },
      created_at:      { lt: anchor },
    },
    select: { person_id: true, tanggal_rencana: true },
    orderBy: { tanggal_rencana: 'asc' },
  })
  const sudahTerjadwalMap = new Map<string, Date>()
  for (const r of rencanaSebelum) {
    if (!sudahTerjadwalMap.has(r.person_id)) sudahTerjadwalMap.set(r.person_id, r.tanggal_rencana)
  }
  const sudahTerjadwal: SudahTerjadwalRow[] = Array.from(sudahTerjadwalMap, ([personId, jadwalKontrol]) => ({
    personId, nama: namaByPerson.get(personId) ?? '(tidak diketahui)', jadwalKontrol,
  }))

  // ── Kunjungan di dalam jendela, untuk person yang TIDAK dikecualikan ──
  const personIdsDinilai = personIds.filter(id => !sudahTerjadwalMap.has(id))
  const kunjunganWindow = personIdsDinilai.length === 0 ? [] : await db.simrsVisit.findMany({
    where: {
      person_id: { in: personIdsDinilai },
      tanggal:   { gte: windowMulai, lte: windowSelesai },
      aktif:     true,
    },
    select: { person_id: true, tanggal: true, tindakan_kode: true, tindakan: true, unit: true, poli: true },
    orderBy: { tanggal: 'asc' },
  })

  // PENTING: tampilkan SETIAP kunjungan apa adanya, satu baris per kunjungan — jangan
  // menciutkan ke satu "kunjungan wakil" per orang. Percobaan pertama menciutkan ke
  // kunjungan PALING AWAL kalau tidak ada yang cocok kode promo, dan itu terbukti
  // salah saat diuji: orang yang datang dua kali (sekali kunjungan tak terkait lebih
  // dulu, baru kemudian benar-benar konversi ke produk lain) — kunjungan konversi
  // yang sebenarnya malah tertutupi oleh kunjungan yang tidak relevan. Menampilkan
  // semuanya menghindari kelas bug ini sepenuhnya: tidak ada tebakan mana yang
  // "mewakili", cukup tampilkan fakta kunjungannya.
  const promoSet = new Set(campaign.kode_layanan_promo)
  const konversi: KonversiRow[] = kunjunganWindow.map(v => ({
    personId:         v.person_id,
    nama:             namaByPerson.get(v.person_id) ?? '(tidak diketahui)',
    tanggal:          v.tanggal,
    hariSetelahKirim: Math.round((v.tanggal.getTime() - anchor.getTime()) / HARI_MS),
    layanan:          v.tindakan || v.poli || v.unit,
    jenis:            (promoSet.size > 0 && !!v.tindakan_kode && promoSet.has(v.tindakan_kode)) ? 'langsung' as const : 'produk_lain' as const,
    pernahMembalas:   pernahMembalasByPerson.has(v.person_id),
  }))
  konversi.sort((a, b) => a.hariSetelahKirim - b.hariSetelahKirim)

  // Ringkasan PER ORANG (bukan per kunjungan) — supaya orang yang datang beberapa
  // kali tidak menggandakan hitungan "berapa orang yang konversi".
  const personIdsBerkunjung = Array.from(new Set(konversi.map(k => k.personId)))
  const personsLangsung = new Set(konversi.filter(k => k.jenis === 'langsung').map(k => k.personId))
  const ringkasanKonversi: RingkasanKonversi = {
    orangBerkunjung:    personIdsBerkunjung.length,
    orangAmbilPromo:    personsLangsung.size,
    orangProdukLain:    personIdsBerkunjung.length - personsLangsung.size,
    orangTanpaBalas:    personIdsBerkunjung.filter(id => !pernahMembalasByPerson.has(id)).length,
  }

  // ── Baseline pre/post — PEMBANDING KASAR, bukan atribusi. Dihitung atas SELURUH
  // penerima (tidak menerapkan pengecualian "sudah terjadwal" di atas), karena yang
  // diukur di sini murni "apakah tingkat kunjungan berubah", bukan "siapa yang
  // konversinya bisa dikreditkan ke campaign". ──
  const [kunjunganSebelum, kunjunganSesudah] = await Promise.all([
    db.simrsVisit.findMany({
      where:  { person_id: { in: personIds }, tanggal: { gte: baselineMulai, lt: windowMulai }, aktif: true },
      select: { person_id: true }, distinct: ['person_id'],
    }),
    db.simrsVisit.findMany({
      where:  { person_id: { in: personIds }, tanggal: { gte: windowMulai, lte: windowSelesai }, aktif: true },
      select: { person_id: true }, distinct: ['person_id'],
    }),
  ])
  const baseline: BaselineEvaluasi = {
    sebelum: kunjunganSebelum.length,
    sesudah: kunjunganSesudah.length,
    selisih: kunjunganSesudah.length - kunjunganSebelum.length,
  }

  return {
    belumDikirim: false, hariWindow, windowMulai, windowSelesai,
    funnel, sentimenRekap, belumDihitungSentimen, konversi, ringkasanKonversi, sudahTerjadwal, baseline,
  }
}

// ─────────────────────────────────────────────────────────
// Sentimen — klasifikasi AI, dipanggil hanya lewat tombol "Hitung ulang"
// ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT_SENTIMEN = `Kamu menganalisis balasan chat WhatsApp pasien terhadap pesan promosi rumah sakit.

Klasifikasikan isi balasan ke SATU kategori:
- tertarik: menunjukkan minat, ingin ikut/mendaftar
- tanya: bertanya info (harga, jadwal, syarat) tanpa menyatakan minat atau penolakan jelas
- menolak: menolak dengan sopan, tidak berminat
- komplain: keberatan, nada negatif, atau minta berhenti dikirimi pesan promosi
- salah_sasaran: pesan sepertinya bukan untuk dia / salah kirim / dia bukan pasiennya
- lainnya: tidak cocok kategori manapun di atas

Balas HANYA JSON valid, tanpa markdown, tanpa komentar:
{"kategori": "salah satu dari 6 nilai di atas", "alasan": "1 kalimat singkat kenapa kategori ini dipilih"}`

async function klasifikasiSentimen(
  provider: { generateJson(system: string, messages: { role: 'user'; content: string }[]): Promise<string> },
  teksPercakapan: string,
): Promise<{ kategori: KategoriSentimen; alasan: string }> {
  const raw = await provider.generateJson(SYSTEM_PROMPT_SENTIMEN, [{ role: 'user', content: teksPercakapan }])
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI tidak mengembalikan JSON yang valid untuk klasifikasi sentimen.')

  const parsed = JSON.parse(match[0])
  const kategori: KategoriSentimen = (KATEGORI_VALID as string[]).includes(parsed.kategori) ? parsed.kategori : 'lainnya'
  const alasan = typeof parsed.alasan === 'string' && parsed.alasan.trim() ? parsed.alasan.trim() : '(tidak ada alasan dari AI)'
  return { kategori, alasan }
}

export interface HasilHitungUlangSentimen {
  totalMembalas:   number
  diproses:        number
  dilewatiKosong:  number   // sudah membalas tapi tidak ada pesan masuk ditemukan (data tidak konsisten)
  gagal:           number
}

/**
 * Hitung ulang sentimen SEMUA penerima yang pernah membalas — selalu menimpa nilai
 * lama. Dipanggil hanya lewat tombol "Hitung ulang" di UI, tidak otomatis saat
 * halaman dibuka, supaya tidak memanggil AI berulang tanpa perlu.
 */
export async function hitungUlangSentimenCampaign(
  db: PrismaClient, tenantSlug: string, campaignId: string,
): Promise<HasilHitungUlangSentimen> {
  const campaign = await db.campaign.findFirst({ where: { id: campaignId, tenant_slug: tenantSlug }, select: { id: true } })
  if (!campaign) throw new Error('Campaign tidak ditemukan.')

  const recipients = await db.campaignRecipient.findMany({
    where:  { campaign_id: campaignId, replied_at: { not: null } },
    select: { id: true, no_hp: true },
  })

  const hasil: HasilHitungUlangSentimen = { totalMembalas: recipients.length, diproses: 0, dilewatiKosong: 0, gagal: 0 }
  if (recipients.length === 0) return hasil

  const provider = await getAiProviderForTenant(tenantSlug)

  for (const r of recipients) {
    try {
      // Percakapan spesifik untuk NOMOR baris ini (bukan cuma person_id) — satu
      // orang bisa punya 2 baris recipient (utama & alternatif) dari 2 nomor
      // berbeda, dan kita ingin balasan dari nomor yang tepat.
      const conv = await db.conversation.findUnique({
        where: { tenant_slug_channel_channel_user_id: { tenant_slug: tenantSlug, channel: 'WA', channel_user_id: r.no_hp } },
        select: { id: true },
      })
      if (!conv) { hasil.dilewatiKosong++; continue }

      const pesanMasuk = await db.message.findMany({
        where:   { conversation_id: conv.id, direction: 'incoming' },
        orderBy: { created_at: 'asc' },
        select:  { content: true },
        take:    20,
      })
      const teks = pesanMasuk.map(m => m.content).filter(Boolean).join('\n').slice(0, 4000)
      if (!teks.trim()) { hasil.dilewatiKosong++; continue }

      const klas = await klasifikasiSentimen(provider, teks)
      await db.campaignRecipient.update({
        where: { id: r.id },
        data:  { sentimen: klas.kategori, sentimen_alasan: klas.alasan, sentimen_at: new Date() },
      })
      hasil.diproses++
    } catch (e) {
      console.error(`[hitungUlangSentimenCampaign] gagal untuk recipient ${r.id}:`, e)
      hasil.gagal++
    }
  }

  return hasil
}
