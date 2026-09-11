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
  labels: { dimensi: string; kode: string }[]
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
        username: true, teks: true,
        labels: { where: { disetujui: true }, select: { dimensi: true, kode: true } },
      },
    })

    const akunSendiri = ((await db.metaConfig.findUnique({
      where: { tenant_slug: params.slug }, select: { ig_msg_username: true },
    }))?.ig_msg_username ?? '').trim().toLowerCase()

    let dibuangSpam = 0, tanpaLabel = 0
    // simpul -> berapa kali ia menyebut RKZ
    const bobot  = new Map<string, number>()
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
      const t = topik.get(dari) ?? new Map<string, number>()
      for (const k of kodeTopik) t.set(k, (t.get(k) ?? 0) + 1)
      topik.set(dari, t)

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

    return NextResponse.json({
      success: true,
      bulan,
      simpul: [...terpilih].map(u => ({
        id: u,
        // 0 berarti akun ini hanya disebut orang lain, tidak pernah menandai RKZ
        // sendiri — dibedakan supaya layar tidak menampilkannya setara.
        sebutan: bobot.get(u) ?? 0,
        topik:   dominan(u),
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
