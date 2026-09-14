/**
 * Graf jaringan akun — siapa menyebut RKZ, dan siapa lagi yang mereka sebut.
 *
 * ══ MENGAPA INI DITUNDA SAMPAI SEKARANG, DAN APA YANG MEMBUATNYA SIAP ══
 *
 * Graf ini sengaja tidak dibangun bersama penariknya. Alasannya satu: tanpa
 * kategori, akun promosi yang menandai lima usaha sekaligus akan tampil sebagai
 * simpul PALING SENTRAL — dan graf yang menempatkan iklan properti di pusat
 * jaringan rumah sakit bukan cuma tidak berguna, ia menyesatkan.
 *
 * Pelajaran itu bukan teori. Graf ASIGTA atas RS Darmo memperlihatkan puluhan
 * klaster padat yang dibaca tim sebagai "komunitas aktif", sementara isinya
 * mengulang frasa identik ("jawabannya b", "ikutan yuk") — ciri kuis berhadiah,
 * bukan komunitas. Grafnya digambar dengan benar; yang keliru penafsirannya.
 *
 * Karena itu SPAM dibuang secara BAWAAN di sini, bukan sebagai pilihan yang
 * harus diingat orang. Dan karena pembuangan itu bergantung pada label yang
 * sudah ditetapkan manusia, cakupan pelabelan ikut dilaporkan — graf yang
 * berdiri di atas 5% label harus mengatakannya sendiri.
 *
 * ══ JENDELA WAKTU ══
 *
 * Riwayat sebutan mundur sampai Desember 2015. Tanpa batas waktu, akun yang
 * aktif pada 2016 tampil setara dengan akun yang aktif pekan ini, dan graf itu
 * menggambarkan sejarah alih-alih keadaan. Bawaan 12 bulan.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'

type Ctx = { params: { slug: string } }

const BULAN_DEFAULT = 12
/** Simpul maksimum. Lebih dari ini berubah jadi gumpalan tak terbaca, dan ekor
 *  akun yang menyebut sekali saja tidak menambah pemahaman apa pun. */
const MAKS_SIMPUL = 80

/** Nama pengguna Instagram: huruf, angka, titik, garis bawah. */
const POLA_SEBUTAN = /@([A-Za-z0-9._]{2,30})/g

interface BarisSebutan {
  username: string | null
  teks: string | null
  terbit_pada: Date
  labels: { dimensi: string; kode: string }[]
}

/**
 * Segmentasi akun — inilah yang mengubah "267 titik" menjadi kalimat yang bisa
 * ditindaklanjuti.
 *
 * Urutan pemeriksaannya penting: SPAM diperiksa lebih dulu, lalu ledakan, baru
 * kesetiaan. Akun promosi yang menandai lima usaha dalam sehari memenuhi syarat
 * "ledakan" DAN "spam" sekaligus, dan yang lebih berguna diketahui adalah bahwa
 * ia spam.
 */
const HARI_LEDAKAN  = 14
const HARI_SETIA    = 90
const MIN_BERULANG  = 3

function segmenAkun(
  jumlah: number, rentangHari: number, spam: boolean,
): 'menumpang' | 'ledakan' | 'pendukung' | 'berulang' | 'sekali' {
  if (spam) return 'menumpang'
  if (jumlah === 1) return 'sekali'
  if (jumlah >= MIN_BERULANG && rentangHari <= HARI_LEDAKAN) return 'ledakan'
  if (jumlah >= MIN_BERULANG && rentangHari >= HARI_SETIA)   return 'pendukung'
  return 'berulang'
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewKanalPublik')
  if (error) return error

  const q     = req.nextUrl.searchParams
  const bulan = Math.min(120, Math.max(1, Number(q.get('bulan')) || BULAN_DEFAULT))
  // Spam disertakan hanya bila DIMINTA secara tegas. Bawaannya membuang, karena
  // itulah satu-satunya alasan graf ini menunggu label.
  const denganSpam = q.get('spam') === '1'

  try {
    const db = await getTenantDb(params.slug)
    const sejak = new Date(Date.now() - bulan * 30 * 86_400_000)

    const baris = await db.sebutan.findMany({
      where: {
        tenant_slug: params.slug,
        sumber: 'IG_TAG',
        terbit_pada: { gte: sejak },
      },
      select: {
        username: true, teks: true, terbit_pada: true,
        labels: { where: { disetujui: true }, select: { dimensi: true, kode: true } },
      },
    })

    const akunSendiri = ((await db.metaConfig.findUnique({
      where: { tenant_slug: params.slug }, select: { ig_msg_username: true },
    }))?.ig_msg_username ?? '').trim().toLowerCase()

    let dibuangSpam = 0, tanpaLabel = 0
    // simpul -> berapa kali ia menyebut RKZ
    const bobot  = new Map<string, number>()
    // simpul -> tanggal sebutan pertama & terakhir. Dipakai membedakan akun yang
    // setia (tersebar berbulan-bulan) dari ledakan kampanye (terkumpul dalam
    // hitungan hari) — pelajaran dari graf RS Darmo, yang klaster padatnya
    // dibaca sebagai komunitas padahal berisi jawaban kuis berhadiah.
    const waktu  = new Map<string, { pertama: Date; terakhir: Date }>()
    // simpul -> topik yang paling sering ditetapkan padanya
    const topik  = new Map<string, Map<string, number>>()
    // sisi antar-akun, dikunci "a|b"
    const sisi   = new Map<string, number>()

    for (const r of baris as BarisSebutan[]) {
      const dari = (r.username ?? '').trim().toLowerCase()
      if (!dari || dari === akunSendiri) continue

      const kodeTopik = r.labels.filter(l => l.dimensi === 'TOPIK').map(l => l.kode)
      if (!r.labels.length) tanpaLabel++
      if (!denganSpam && kodeTopik.includes('SPAM')) { dibuangSpam++; continue }

      bobot.set(dari, (bobot.get(dari) ?? 0) + 1)
      const w   = waktu.get(dari)
      const saat = r.terbit_pada
      waktu.set(dari, {
        pertama:  !w || saat < w.pertama  ? saat : w.pertama,
        terakhir: !w || saat > w.terakhir ? saat : w.terakhir,
      })

      const petaTopik = topik.get(dari) ?? new Map<string, number>()
      for (const k of kodeTopik) petaTopik.set(k, (petaTopik.get(k) ?? 0) + 1)
      topik.set(dari, petaTopik)

      // @sebutan di dalam takarir — inilah yang memberi graf ini TEPI SUNGGUHAN,
      // bukan sekadar bintang berpusat RKZ. Diukur 9 Sep: 38% takarir memuatnya.
      for (const m of (r.teks ?? '').matchAll(POLA_SEBUTAN)) {
        const ke = m[1].toLowerCase()
        if (ke === dari || ke === akunSendiri) continue
        const kunci = `${dari}|${ke}`
        sisi.set(kunci, (sisi.get(kunci) ?? 0) + 1)
      }
    }

    // Simpul teratas menurut jumlah sebutan. Akun yang HANYA muncul sebagai
    // sasaran @sebutan ikut masuk bila terhubung ke simpul terpilih — tanpa itu,
    // separuh tepi akan menggantung tanpa ujung.
    const terpilih = new Set(
      [...bobot.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAKS_SIMPUL).map(([k]) => k))

    const sisiTampil = [...sisi.entries()]
      .map(([k, n]) => { const [dari, ke] = k.split('|'); return { dari, ke, bobot: n } })
      .filter(e => terpilih.has(e.dari))

    for (const e of sisiTampil) terpilih.add(e.ke)

    const dominan = (u: string) => {
      const t = topik.get(u)
      if (!t?.size) return null
      return [...t.entries()].sort((a, b) => b[1] - a[1])[0][0]
    }

    // Derajat: berapa akun LAIN yang menyebut akun ini di takarirnya. Sengaja
    // TIDAK disebut sentralitas — pada 267 simpul dengan tepi yang sebagian
    // besar muncul sekali, sentralitas akan terlihat ilmiah tanpa menjadi benar.
    // Derajat hanya menghitung, dan hitungan tidak bisa disalahtafsirkan.
    const derajat = new Map<string, number>()
    for (const e of sisiTampil) derajat.set(e.ke, (derajat.get(e.ke) ?? 0) + 1)

    const hariAntara = (a: Date, b: Date) =>
      Math.round((b.getTime() - a.getTime()) / 86_400_000)

    // Seluruh akun — bukan hanya yang tergambar. Tabel dan angka ringkasan harus
    // berdiri di atas populasi penuh; grafnya boleh disaring, angkanya tidak.
    const semuaAkun = [...bobot.entries()].map(([id, jumlah]) => {
      const w = waktu.get(id)!
      const rentangHari = hariAntara(w.pertama, w.terakhir)
      const kodeDominan = dominan(id)
      return {
        id, jumlah, rentangHari,
        topik:    kodeDominan,
        pertama:  w.pertama,
        terakhir: w.terakhir,
        derajat:  derajat.get(id) ?? 0,
        segmen:   segmenAkun(jumlah, rentangHari, kodeDominan === 'SPAM'),
      }
    }).sort((a, b) => b.jumlah - a.jumlah || b.terakhir.getTime() - a.terakhir.getTime())

    const setahunLalu = new Date(Date.now() - 365 * 86_400_000)
    const hitungSegmen = (k: string) => semuaAkun.filter(a => a.segmen === k).length

    return NextResponse.json({
      success: true,
      bulan,

      /**
       * Angka ringkasan — dihitung, bukan ditulis, sehingga selalu benar dan
       * tidak perlu ditinjau siapa pun. Inilah yang mengubah gambar menjadi
       * temuan; grafnya sendiri tidak pernah bisa mengatakan "88% sudah diam".
       */
      ringkasan: {
        totalAkun:     semuaAkun.length,
        sekaliSaja:    semuaAkun.filter(a => a.jumlah === 1).length,
        berulang:      semuaAkun.filter(a => a.jumlah >= 3).length,
        aktifSetahun:  semuaAkun.filter(a => a.terakhir >= setahunLalu).length,
        totalTepi:     sisiTampil.length,
      },

      segmen: [
        { kunci: 'pendukung',  nama: 'Pendukung',   jumlah: hitungSegmen('pendukung'),
          arti: `Menyebut ${MIN_BERULANG}+ kali dan tersebar lebih dari ${HARI_SETIA} hari — kembali karena memang berhubungan, bukan karena satu peristiwa.` },
        { kunci: 'ledakan',    nama: 'Ledakan',     jumlah: hitungSegmen('ledakan'),
          arti: `Menyebut ${MIN_BERULANG}+ kali tetapi terkumpul dalam ${HARI_LEDAKAN} hari — ciri kampanye, undian, atau satu kegiatan. Ramai sesaat, bukan hubungan.` },
        { kunci: 'berulang',   nama: 'Sesekali',    jumlah: hitungSegmen('berulang'),
          arti: 'Menyebut lebih dari sekali, tetapi belum cukup sering atau belum cukup lama untuk disebut pendukung.' },
        { kunci: 'sekali',     nama: 'Sekali lewat', jumlah: hitungSegmen('sekali'),
          arti: 'Menyebut satu kali saja, lalu tidak pernah lagi.' },
        { kunci: 'menumpang',  nama: 'Menumpang',   jumlah: hitungSegmen('menumpang'),
          arti: 'Berlabel SPAM — menandai RKZ demi jangkauan, bukan karena berhubungan.' },
      ],

      akun: semuaAkun.slice(0, 60),

      simpul: [...terpilih].map(u => ({
        id: u,
        // 0 berarti akun ini hanya disebut orang lain, tidak pernah menandai RKZ
        // sendiri — dibedakan supaya layar tidak menampilkannya setara.
        sebutan: bobot.get(u) ?? 0,
        topik:   dominan(u),
        segmen:  semuaAkun.find(a => a.id === u)?.segmen ?? 'sekali',
      })),
      sisi: sisiTampil,
      // Cakupan dilaporkan, seperti di seluruh modul ini: graf yang berdiri di
      // atas label yang belum ditinjau tidak boleh tampak sama meyakinkannya
      // dengan graf yang berdiri di atas label yang sudah ditetapkan.
      totalSebutan: baris.length,
      tanpaLabel,
      dibuangSpam,
      denganSpam,
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
