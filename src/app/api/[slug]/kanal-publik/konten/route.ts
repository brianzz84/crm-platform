/**
 * Konten terekam + penandaan sifat.
 *
 *   GET   — daftar konten dari tabel snapshot, beserta master sifat tenant
 *   PATCH — tandai sifat sebuah konten (atau setujui usulan AI)
 *
 * Daftarnya sengaja dibaca dari `SocialContent`, BUKAN langsung dari Meta seperti
 * halaman Kanal Publik lainnya. Alasannya: tag tersimpan per konten di basis data,
 * dan hanya di sanalah konten dari seluruh periode berkumpul — bukan cuma jendela
 * yang kebetulan sedang dilihat.
 *
 * Guard: viewKanalPublik — sama dengan halaman Kanal Publik.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { semaiSifat } from '@/lib/social-sifat'

type Ctx = { params: { slug: string } }

const PER_HAL = 40

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewKanalPublik')
  if (error) return error

  const q       = req.nextUrl.searchParams
  const kanal   = q.get('kanal')
  const status  = q.get('status') ?? 'semua'   // semua | belum | sudah
  const hal     = Math.max(1, parseInt(q.get('hal') ?? '1', 10) || 1)

  try {
    const db = await getTenantDb(params.slug)
    await semaiSifat(db, params.slug)

    const where: any = { tenant_slug: params.slug }
    if (kanal === 'IG' || kanal === 'FB') where.kanal = kanal
    if (status === 'belum') where.sifat = null
    if (status === 'sudah') where.sifat = { not: null }

    const [total, rows, sifat, belum] = await Promise.all([
      db.socialContent.count({ where }),
      db.socialContent.findMany({
        where,
        orderBy: { terbit_pada: 'desc' },
        skip: (hal - 1) * PER_HAL,
        take: PER_HAL,
        include: {
          // Baris berjalan (umur_hari = -1) memuat angka terkini konten.
          snapshots: { where: { umur_hari: -1 }, take: 1 },
        },
      }),
      db.socialSifatLibrary.findMany({
        where: { tenant_slug: params.slug, aktif: true },
        orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
        select: { kode: true, nama: true, deskripsi: true, warna: true },
      }),
      db.socialContent.count({ where: { tenant_slug: params.slug, sifat: null } }),
    ])

    return NextResponse.json({
      success: true,
      data: rows.map((r: any) => {
        const s = r.snapshots?.[0]
        return {
          id: r.id, kanal: r.kanal, jenis: r.jenis,
          tanggal: r.terbit_pada, teks: r.teks, permalink: r.permalink,
          sampul: r.sampul_url, sifat: r.sifat, sifat_usulan: r.sifat_usulan,
          jangkauan: s?.jangkauan ?? 0, tayangan: s?.tayangan ?? 0,
          interaksi: s?.interaksi ?? 0, suka: s?.suka ?? 0,
        }
      }),
      sifat,
      total,
      belumDitandai: belum,
      hal,
      totalHal: Math.max(1, Math.ceil(total / PER_HAL)),
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewKanalPublik')
  if (error) return error

  try {
    const { id, sifat, mode } = await req.json()
    const db = await getTenantDb(params.slug)

    // ── Setujui seluruh usulan yang masih menggantung ──
    //
    // Hanya menyentuh konten yang PUNYA usulan dan BELUM bersifat. Konten yang
    // sudah ditandai manusia tidak pernah ditimpa — kalau admin sudah menilai
    // sebuah konten, penilaian itu menang atas usulan mesin, selalu.
    if (mode === 'setujui_semua') {
      const menggantung = await db.socialContent.findMany({
        where: { tenant_slug: params.slug, sifat: null, sifat_usulan: { not: null } },
        select: { id: true, sifat_usulan: true },
      })

      const aktif = new Set(
        (await db.socialSifatLibrary.findMany({
          where: { tenant_slug: params.slug, aktif: true }, select: { kode: true },
        })).map((x: any) => x.kode),
      )

      let disetujui = 0, dilewati = 0
      for (const k of menggantung) {
        // Usulan yang menunjuk sifat tak dikenal atau sudah dinonaktifkan
        // dilewati, bukan dipaksakan — laporan tidak boleh memuat kategori hantu.
        if (!k.sifat_usulan || !aktif.has(k.sifat_usulan)) { dilewati++; continue }
        await db.socialContent.update({
          where: { id: k.id },
          data:  { sifat: k.sifat_usulan, sifat_usulan: null },
        })
        disetujui++
      }

      return NextResponse.json({ success: true, disetujui, dilewati })
    }

    if (!id) return NextResponse.json({ success: false, error: 'id wajib diisi' }, { status: 400 })

    const konten = await db.socialContent.findUnique({ where: { id } })
    if (!konten || konten.tenant_slug !== params.slug) {
      return NextResponse.json({ success: false, error: 'Konten tidak ditemukan' }, { status: 404 })
    }

    // Kosong = lepas tanda. Selain itu kode WAJIB ada di master milik tenant dan
    // masih aktif — kalau tidak, laporan akan memuat kategori hantu yang tidak
    // punya nama, warna, maupun uraian.
    let kode: string | null = null
    if (sifat) {
      const ada = await db.socialSifatLibrary.findUnique({
        where: { tenant_slug_kode: { tenant_slug: params.slug, kode: String(sifat) } },
      })
      if (!ada)       return NextResponse.json({ success: false, error: `Sifat "${sifat}" tidak dikenal` }, { status: 400 })
      if (!ada.aktif) return NextResponse.json({ success: false, error: `Sifat "${ada.nama}" sudah dinonaktifkan` }, { status: 400 })
      kode = ada.kode
    }

    // Usulan dibersihkan setelah keputusan diambil — supaya daftar "belum
    // diperiksa" benar-benar berarti belum diperiksa.
    const baru = await db.socialContent.update({
      where: { id },
      data:  { sifat: kode, sifat_usulan: null },
      select: { id: true, sifat: true, sifat_usulan: true },
    })

    return NextResponse.json({ success: true, data: baru })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
