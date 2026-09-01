/**
 * Pengelolaan kategori label percakapan — topik dan poli.
 *
 * BERDIRI SENDIRI, tidak menumpang /api/[slug]/library, semata karena izinnya
 * berbeda: rute Library dijaga `icdLibrary` yang hanya dipegang SUPER_ADMIN dan
 * ADMIN_IT. Akibatnya admin medsos — satu-satunya orang yang benar-benar
 * meninjau percakapan tiap hari — justru tidak boleh memperbaiki kategorinya,
 * dan harus menunggu admin IT untuk menambah satu baris.
 *
 * Konsekuensinya diakui: pemegang `viewKanalPublik` kini bisa mengubah taksonomi
 * yang membentuk laporan triwulan. Yang menjaganya bukan izin, melainkan aturan
 * yang sama seperti di Library — kode KEKAL, dan kategori tidak pernah dihapus,
 * hanya dinonaktifkan. Laporan periode lampau karena itu tidak pernah berubah
 * arti akibat suntingan hari ini.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'

type Ctx = { params: { slug: string } }

/** Kode dinormalkan sekali lalu kekal — aturannya disamakan dengan API Library. */
function rapikanKode(kode: string): string {
  return kode.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function pilihModel(db: any, dimensi: unknown) {
  if (dimensi === 'TOPIK') return db.percakapanTopikLibrary
  if (dimensi === 'POLI')  return db.percakapanPoliLibrary
  return null
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewKanalPublik')
  if (error) return error

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Body bukan JSON.' }, { status: 400 })
  }

  const nama = String(body.nama ?? '').trim()
  if (!nama) return NextResponse.json({ success: false, error: 'Nama wajib diisi.' }, { status: 400 })

  // Kode boleh dikosongkan — diturunkan dari nama. Orang yang sedang meninjau
  // percakapan tidak seharusnya dipaksa memikirkan pengenal teknis.
  const kode = rapikanKode(String(body.kode ?? '') || nama)
  if (!kode) {
    return NextResponse.json({ success: false, error: 'Nama harus memuat huruf atau angka.' }, { status: 400 })
  }

  try {
    const db    = await getTenantDb(params.slug)
    const model = pilihModel(db, body.dimensi)
    if (!model) {
      return NextResponse.json({ success: false, error: 'Dimensi harus TOPIK atau POLI.' }, { status: 400 })
    }

    // Ditaruh di ekor daftar: kategori baru belum punya tempat yang dipikirkan
    // dalam urutan, dan menebak-nebak posisinya hanya menggeser yang sudah mapan.
    const terakhir = await model.findFirst({
      where: { tenant_slug: params.slug }, orderBy: { urutan: 'desc' }, select: { urutan: true },
    })

    const row = await model.create({
      data: {
        tenant_slug: params.slug,
        kode,
        nama,
        deskripsi:   String(body.deskripsi ?? '').trim() || null,
        warna:       String(body.warna ?? '').trim() || '#0089A8',
        urutan:      (terakhir?.urutan ?? 0) + 1,
      },
    })
    return NextResponse.json({ success: true, data: row })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ success: false, error: `Kode "${kode}" sudah dipakai.` }, { status: 409 })
    }
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewKanalPublik')
  if (error) return error

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Body bukan JSON.' }, { status: 400 })
  }

  const kode = String(body.kode ?? '').trim()
  if (!kode) return NextResponse.json({ success: false, error: 'kode wajib diisi.' }, { status: 400 })

  try {
    const db    = await getTenantDb(params.slug)
    const model = pilihModel(db, body.dimensi)
    if (!model) {
      return NextResponse.json({ success: false, error: 'Dimensi harus TOPIK atau POLI.' }, { status: 400 })
    }

    // `kode` sengaja TIDAK bisa disunting meski klien mengirimkannya: ia dirujuk
    // ConversationLabel, dan mengubahnya membuat seluruh label yang menunjuk
    // padanya menjadi yatim. Menyunting NAMA berlaku surut ke seluruh riwayat —
    // itu memang yang diinginkan saat memperbaiki penyebutan untuk maksud yang
    // sama. Untuk maksud yang berbeda, buat kategori baru lalu nonaktifkan.
    const data: Record<string, unknown> = {}
    if (body.nama      !== undefined) data.nama      = String(body.nama).trim()
    if (body.deskripsi !== undefined) data.deskripsi = String(body.deskripsi).trim() || null
    if (body.warna     !== undefined) data.warna     = String(body.warna).trim()
    if (body.aktif     !== undefined) data.aktif     = !!body.aktif   // TIDAK PERNAH DELETE
    if (!Object.keys(data).length) {
      return NextResponse.json({ success: false, error: 'Tidak ada perubahan.' }, { status: 400 })
    }

    // Jangan percaya klien — pastikan kategorinya milik tenant ini.
    const r = await model.updateMany({ where: { tenant_slug: params.slug, kode }, data })
    if (!r.count) {
      return NextResponse.json({ success: false, error: 'Kategori tidak ditemukan.' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
