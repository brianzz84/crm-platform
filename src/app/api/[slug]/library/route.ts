import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'

type Ctx = { params: { slug: string } }

// GET /api/[slug]/library?tab=icd|layanan|unit&q=...&versi=ICD10&bab=...&terjemahan=id|en&page=1
export async function GET(req: NextRequest, { params }: Ctx) {
  // Sama dengan guard halamannya (/[slug]/library) — ADMIN_IT & SUPER_ADMIN
  const { error } = await requireTenantPermission(req, params.slug, 'icdLibrary')
  if (error) return error

  const url         = new URL(req.url)
  const tab         = url.searchParams.get('tab') ?? 'icd'
  const q           = url.searchParams.get('q')?.trim() ?? ''
  const page        = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'))
  const limit       = 50
  const skip        = (page - 1) * limit

  try {
    const db = await getTenantDb(params.slug)

    if (tab === 'sifat') {
      // Semai bawaan hanya bila tenant belum punya satu pun — lihat semaiSifat().
      const { semaiSifat } = await import('@/lib/social-sifat')
      await semaiSifat(db, params.slug)

      const where: any = { tenant_slug: params.slug }
      if (q) where.OR = [
        { nama: { contains: q, mode: 'insensitive' } },
        { kode: { contains: q, mode: 'insensitive' } },
      ]
      // Termasuk yang nonaktif: kategori lama tetap harus terlihat agar bisa
      // diaktifkan kembali dan agar admin paham riwayat mana yang memakainya.
      const rows = await db.socialSifatLibrary.findMany({
        where, orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
      })
      return NextResponse.json({ data: rows, total: rows.length, page: 1, totalPages: 1 })
    }

    if (tab === 'unit') {
      // Master unit per tenant — tampilkan semua (termasuk nonaktif) supaya
      // admin bisa mengaktifkan kembali lewat UI.
      const where: any = { tenant_slug: params.slug }
      if (q) where.OR = [
        { nama:     { contains: q, mode: 'insensitive' } },
        { kelompok: { contains: q, mode: 'insensitive' } },
      ]
      const kelompok = url.searchParams.get('kelompok')
      if (kelompok) where.kelompok = kelompok

      const [total, data] = await Promise.all([
        db.simrsUnitLibrary.count({ where }),
        db.simrsUnitLibrary.findMany({
          where,
          select: { id: true, nama: true, kelompok: true, warna: true, urutan: true, aktif: true },
          orderBy: [{ kelompok: 'asc' }, { urutan: 'asc' }, { nama: 'asc' }],
          skip, take: limit,
        }),
      ])
      // Daftar kelompok yang ada — untuk dropdown filter & form tambah
      const grup = await db.simrsUnitLibrary.groupBy({
        by: ['kelompok'],
        where: { tenant_slug: params.slug },
        _count: { _all: true },
        orderBy: { kelompok: 'asc' },
      })
      return NextResponse.json({
        data, total, page, limit,
        kelompokList: grup.map((g: any) => ({ nama: g.kelompok, jumlah: g._count._all })),
      })
    }

    if (tab === 'layanan') {
      const where: any = { aktif: true }
      if (q) where.OR = [
        { kode_barang:  { contains: q, mode: 'insensitive' } },
        { nama:         { contains: q, mode: 'insensitive' } },
        { nama_generik: { contains: q, mode: 'insensitive' } },
      ]
      const kelompok = url.searchParams.get('kelompok')
      if (kelompok) where.kelompok = kelompok
      const jenis = url.searchParams.get('jenis')
      if (jenis) where.jenis = jenis
      if (url.searchParams.get('belum_diisi') === '1') where.nama_generik = null

      const [total, data] = await Promise.all([
        db.simrsLayananLibrary.count({ where }),
        db.simrsLayananLibrary.findMany({
          where,
          select: { id: true, kode_barang: true, nama: true, nama_generik: true, kelompok: true, jenis: true, aktif: true },
          orderBy: [{ kelompok: 'asc' }, { nama: 'asc' }],
          skip, take: limit,
        }),
      ])
      return NextResponse.json({ data, total, page, limit })
    }

    // tab === 'icd'
    const where: any = { aktif: true }
    if (q) where.OR = [
      { kode:    { startsWith: q.toUpperCase() } },
      { nama_id: { contains: q, mode: 'insensitive' } },
      { nama:    { contains: q, mode: 'insensitive' } },
    ]
    const versi = url.searchParams.get('versi')
    if (versi) where.versi = versi

    const bab = url.searchParams.get('bab')
    if (bab) where.bab = { contains: bab, mode: 'insensitive' }


const [total, data] = await Promise.all([
      db.icdLibrary.count({ where }),
      db.icdLibrary.findMany({
        where,
        select: { kode: true, nama_id: true, nama: true, bab: true, versi: true },
        orderBy: [{ kode: 'asc' }],
        skip, take: limit,
      }),
    ])

    return NextResponse.json({ data, total, page, limit })
  } catch (e) {
    console.error('[GET /api/library]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST /api/[slug]/library?tab=unit — tambah unit baru secara manual
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'icdLibrary')
  if (error) return error

  const tab = new URL(req.url).searchParams.get('tab')

  if (tab === 'sifat') {
    const { kode, nama, deskripsi, warna, urutan } = await req.json()
    if (!kode?.trim()) return NextResponse.json({ error: 'Kode wajib diisi' }, { status: 400 })
    if (!nama?.trim()) return NextResponse.json({ error: 'Nama wajib diisi' }, { status: 400 })

    // Kode dinormalkan sekali di sini dan sesudahnya KEKAL. Ia dipakai sebagai
    // rujukan oleh SocialContent.sifat; mengubahnya membuat konten yang menunjuk
    // padanya menjadi yatim, jadi PATCH sengaja tidak menerima kolom ini.
    const kodeRapi = String(kode).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    if (!kodeRapi) return NextResponse.json({ error: 'Kode harus memuat huruf atau angka' }, { status: 400 })

    try {
      const db = await getTenantDb(params.slug)
      const row = await db.socialSifatLibrary.create({
        data: {
          tenant_slug: params.slug,
          kode:        kodeRapi,
          nama:        String(nama).trim(),
          deskripsi:   deskripsi?.trim() || null,
          warna:       warna?.trim() || '#0089A8',
          urutan:      Number.isInteger(urutan) ? urutan : 99,
        },
      })
      return NextResponse.json({ success: true, data: row })
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return NextResponse.json({ error: `Kode "${kodeRapi}" sudah dipakai` }, { status: 409 })
      }
      console.error('[POST /api/library?tab=sifat]', e)
      return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
  }

  if (tab !== 'unit') {
    return NextResponse.json({ error: 'Hanya tab=unit atau tab=sifat yang bisa ditambah manual' }, { status: 400 })
  }

  const { nama, kelompok, warna } = await req.json()
  if (!nama?.trim())     return NextResponse.json({ error: 'Nama unit wajib diisi' }, { status: 400 })
  if (!kelompok?.trim()) return NextResponse.json({ error: 'Kelompok wajib diisi' }, { status: 400 })

  try {
    const db = await getTenantDb(params.slug)
    const unit = await db.simrsUnitLibrary.create({
      data: {
        tenant_slug: params.slug,
        nama:        nama.trim(),
        kelompok:    kelompok.trim(),
        warna:       warna?.trim() || '#0089A8',
      },
      select: { id: true, nama: true, kelompok: true, warna: true, urutan: true, aktif: true },
    })
    return NextResponse.json({ success: true, data: unit })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'Unit dengan nama itu sudah ada' }, { status: 409 })
    }
    console.error('[POST /api/library]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH /api/[slug]/library — update nama_generik layanan, atau edit unit (tab=unit)
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'icdLibrary')
  if (error) return error

  const tab  = new URL(req.url).searchParams.get('tab')
  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: 'id wajib diisi' }, { status: 400 })

  try {
    const db = await getTenantDb(params.slug)

    if (tab === 'sifat') {
      const existing = await db.socialSifatLibrary.findUnique({ where: { id: body.id } })
      if (!existing || existing.tenant_slug !== params.slug) {
        return NextResponse.json({ error: 'Sifat tidak ditemukan' }, { status: 404 })
      }

      // `kode` sengaja TIDAK ada di sini meski klien mengirimkannya. Menyunting
      // nama berlaku surut ke seluruh riwayat — itu memang yang diinginkan saat
      // memperbaiki maksud yang sama. Untuk maksud yang berbeda, buat kode baru
      // dan nonaktifkan yang lama; riwayatnya tetap terbaca apa adanya.
      const data: any = {}
      if (body.nama      !== undefined) data.nama      = String(body.nama).trim()
      if (body.deskripsi !== undefined) data.deskripsi = String(body.deskripsi).trim() || null
      if (body.warna     !== undefined) data.warna     = String(body.warna).trim()
      if (body.urutan    !== undefined) data.urutan    = Number(body.urutan) || 0
      if (body.aktif     !== undefined) data.aktif     = !!body.aktif   // TIDAK PERNAH DELETE
      if (!Object.keys(data).length) {
        return NextResponse.json({ error: 'Tidak ada perubahan' }, { status: 400 })
      }

      const row = await db.socialSifatLibrary.update({ where: { id: body.id }, data })
      return NextResponse.json({ success: true, data: row })
    }

    if (tab === 'unit') {
      // Pastikan unit milik tenant ini — jangan percaya id dari klien
      const existing = await db.simrsUnitLibrary.findUnique({ where: { id: body.id } })
      if (!existing || existing.tenant_slug !== params.slug) {
        return NextResponse.json({ error: 'Unit tidak ditemukan' }, { status: 404 })
      }
      const data: any = {}
      if (body.nama     !== undefined) data.nama     = String(body.nama).trim()
      if (body.kelompok !== undefined) data.kelompok = String(body.kelompok).trim()
      if (body.warna    !== undefined) data.warna    = String(body.warna).trim()
      if (body.aktif    !== undefined) data.aktif    = !!body.aktif   // TIDAK PERNAH DELETE
      if (!Object.keys(data).length) {
        return NextResponse.json({ error: 'Tidak ada perubahan' }, { status: 400 })
      }
      const unit = await db.simrsUnitLibrary.update({
        where: { id: body.id }, data,
        select: { id: true, nama: true, kelompok: true, warna: true, urutan: true, aktif: true },
      })
      return NextResponse.json({ success: true, data: unit })
    }

    await db.simrsLayananLibrary.update({
      where: { id: body.id },
      data:  { nama_generik: body.nama_generik?.trim() || null },
    })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'Unit dengan nama itu sudah ada' }, { status: 409 })
    }
    console.error('[PATCH /api/library]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
