/**
 * GET /api/[slug]/kanal-publik
 *   ?kanal=youtube|ga4|instagram|facebook
 *   &mulai=YYYY-MM-DD&selesai=YYYY-MM-DD
 *   [&bandingMulai=YYYY-MM-DD&bandingSelesai=YYYY-MM-DD]
 *
 * Menarik data kanal publik langsung dari sumbernya saat diminta. Dipisah per kanal
 * supaya satu kanal yang bermasalah (mis. Business Profile yang masih menunggu
 * allowlist) tidak menggagalkan tampilan kanal lain yang sudah hidup. Kanal Google
 * memakai GoogleConfig, kanal Meta memakai MetaConfig — dua integrasi terpisah yang
 * sengaja tidak saling bergantung.
 *
 * Tanggal WAJIB divalidasi di sini: nilainya datang dari URL, dan tanpa penjagaan
 * ia langsung menjadi kueri ke API luar — rentang bertahun-tahun bisa menghabiskan
 * kuota API tenant hanya karena satu URL yang diubah-ubah.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { periksaRentang, ringkasGa4, ringkasYouTube, type Rentang } from '@/lib/google-kanal'
import { ringkasFacebook, ringkasInstagram } from '@/lib/meta-kanal'
import { tambalDariSnapshot } from '@/lib/kanal-tambal'

type Ctx = { params: { slug: string } }

const KANAL = ['ga4', 'youtube', 'instagram', 'facebook'] as const
type Kanal = typeof KANAL[number]

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewKanalPublik')
  if (error) return error

  const q      = req.nextUrl.searchParams
  const minta  = q.get('kanal') ?? ''
  const kanal: Kanal = (KANAL as readonly string[]).includes(minta) ? minta as Kanal : 'youtube'

  const cekUtama = periksaRentang(q.get('mulai') ?? '', q.get('selesai') ?? '')
  if (!cekUtama.ok) {
    return NextResponse.json({ success: false, error: `Periode: ${cekUtama.pesan}` }, { status: 400 })
  }

  // Pembanding opsional — hanya diproses bila KEDUA batasnya dikirim.
  let banding: Rentang | null = null
  const bMulai = q.get('bandingMulai'), bSelesai = q.get('bandingSelesai')
  if (bMulai && bSelesai) {
    const cekBanding = periksaRentang(bMulai, bSelesai)
    if (!cekBanding.ok) {
      return NextResponse.json({ success: false, error: `Pembanding: ${cekBanding.pesan}` }, { status: 400 })
    }
    banding = cekBanding.rentang
  }

  try {
    const db = await getTenantDb(params.slug)

    if (kanal === 'instagram' || kanal === 'facebook') {
      const meta = await db.metaConfig.findUnique({ where: { tenant_slug: params.slug } })
      if (!meta) {
        return NextResponse.json({
          success: false,
          error: 'Config Meta belum ada. Buka Pengaturan → Integrasi Meta lalu isi bagian "Analitik Media Sosial".',
        }, { status: 400 })
      }

      const konfigMeta = {
        page_id:        meta.page_id,
        ig_business_id: meta.ig_business_id,
        insights_token: meta.insights_token,
        access_token:   meta.access_token,
      }

      const data = kanal === 'instagram'
        ? await ringkasInstagram(konfigMeta, cekUtama.rentang, banding)
        : await ringkasFacebook(konfigMeta, cekUtama.rentang, banding)

      // Menambal periode pembanding dari catatan cron ketika Meta sudah tidak
      // menyediakan deret hariannya.
      //
      // PER METRIK untuk Instagram, bukan satu bendera untuk semuanya. Batas
      // riwayat tiap metrik berbeda jauh: `follower_count` hanya 30 hari,
      // sedangkan `reach` masih dilayani setidaknya 73 hari. Memakai bendera
      // gabungan akan membiarkan follower baru terbaca NOL — dan nol yang salah
      // melahirkan "▲ tumbuh" yang sepenuhnya palsu, persis kekeliruan yang
      // dulu memunculkan penanda ini.
      //
      // Facebook masih memakai bendera gabungan: batas per metriknya belum
      // pernah diukur, dan menebaknya hanya akan mengulang kesalahan yang sama.
      let tambal: Awaited<ReturnType<typeof tambalDariSnapshot>> = null
      const kosongIg = kanal === 'instagram' ? (data as { bandingMetrikKosong?: string[] }).bandingMetrikKosong ?? [] : []
      const perluTambal = kanal === 'instagram' ? kosongIg.length > 0 : data.bandingSeriKosong

      if (banding && perluTambal && data.banding) {
        tambal = await tambalDariSnapshot(params.slug, kanal === 'instagram' ? 'IG' : 'FB', banding)
        if (tambal) {
          if (kanal === 'instagram') {
            if (kosongIg.includes('reach')) {
              (data.banding as { jangkauan: number }).jangkauan = tambal.jangkauan
            }
            if (kosongIg.includes('follower_count')) data.banding.followerBaru = tambal.followerBaru
          } else {
            const fb = data.banding as {
              interaksi: number; kunjunganProfil: number; tayanganVideo: number
              tayanganMedia: number; penontonUnik: number
            }
            data.banding.followerBaru = tambal.followerBaru
            fb.interaksi       = tambal.interaksi
            fb.kunjunganProfil = tambal.kunjunganProfil
            fb.tayanganVideo   = tambal.tayanganVideo
            fb.tayanganMedia   = tambal.tayanganMedia
            fb.penontonUnik    = tambal.penontonUnik
          }
        }
      }

      return NextResponse.json({
        success: true, kanal, periode: cekUtama.rentang, banding, data, tambal,
      })
    }

    const cfg = await db.googleConfig.findUnique({ where: { tenant_slug: params.slug } })

    if (!cfg?.aktif || !cfg.refresh_token) {
      return NextResponse.json({
        success: false,
        error: 'Belum tersambung ke Google. Buka Pengaturan → Integrasi Google Business lalu klik "Hubungkan dengan Google".',
      }, { status: 400 })
    }

    const konfig = {
      client_id:          cfg.client_id,
      client_secret:      cfg.client_secret,
      refresh_token:      cfg.refresh_token,
      ga4_property_id:    cfg.ga4_property_id,
      youtube_channel_id: cfg.youtube_channel_id,
    }

    const data = kanal === 'ga4'
      ? await ringkasGa4(params.slug, konfig, cekUtama.rentang, banding)
      : await ringkasYouTube(params.slug, konfig, cekUtama.rentang, banding)

    return NextResponse.json({ success: true, kanal, periode: cekUtama.rentang, banding, data })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 },
    )
  }
}
