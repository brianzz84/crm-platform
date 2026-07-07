import { NextRequest, NextResponse } from 'next/server'
import { masterDb } from '@/lib/tenant'
import { getTenantDb } from '@/lib/tenant'
import { z } from 'zod'

type Ctx = { params: { token: string } }

// GET /api/kegiatan/[token] — ambil info kegiatan publik dari qr_token
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    // Cari tenant yang punya kegiatan dengan qr_token ini
    const tenants = await masterDb.tenant.findMany({ select: { slug: true } })

    for (const tenant of tenants) {
      const db = await getTenantDb(tenant.slug)
      const kegiatan = await db.kegiatan.findUnique({
        where: { qr_token: params.token },
        include: { _count: { select: { peserta: true } } },
      })
      if (!kegiatan) continue

      const profile = await db.tenantProfile.findUnique({
        where: { tenant_slug: tenant.slug },
      })

      return NextResponse.json({
        id:              kegiatan.id,
        nama:            kegiatan.nama,
        jenis:           kegiatan.jenis,
        tanggal_mulai:   kegiatan.tanggal_mulai.toISOString(),
        tanggal_selesai: kegiatan.tanggal_selesai?.toISOString() ?? null,
        lokasi:          kegiatan.lokasi,
        penyelenggara:   kegiatan.penyelenggara,
        keterangan:      kegiatan.keterangan,
        status:          kegiatan.status,
        totalPeserta:    kegiatan._count.peserta,
        tenant: {
          slug:        tenant.slug,
          nama_klinik: profile?.nama_klinik ?? tenant.slug,
          nama_rs:     profile?.nama_rs ?? tenant.slug,
          logo_url:    profile?.logo_url ?? null,
        },
      })
    }

    return NextResponse.json({ error: 'Kegiatan tidak ditemukan' }, { status: 404 })
  } catch (e) {
    console.error('[GET /api/kegiatan/token]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

const DaftarSchema = z.object({
  nama:  z.string().min(2, 'Nama minimal 2 karakter').max(100),
  no_hp: z.string().min(8, 'No HP minimal 8 digit').max(20).regex(/^[0-9+\-() ]+$/, 'Format HP tidak valid'),
})

// POST /api/kegiatan/[token] — daftar sebagai peserta via QR
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const body   = await req.json()
    const parsed = DaftarSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Data tidak valid' }, { status: 400 })
    }

    const { nama, no_hp } = parsed.data
    const noHpClean = no_hp.replace(/[^0-9+]/g, '')

    const tenants = await masterDb.tenant.findMany({ select: { slug: true } })

    for (const tenant of tenants) {
      const db = await getTenantDb(tenant.slug)
      const kegiatan = await db.kegiatan.findUnique({ where: { qr_token: params.token } })
      if (!kegiatan) continue

      if (kegiatan.status !== 'aktif') {
        return NextResponse.json({ error: 'Pendaftaran kegiatan ini sudah ditutup' }, { status: 400 })
      }

      // Cari Person by no_hp (exact atau normalisasi 08xx → 628xx)
      const noHpAlt = noHpClean.startsWith('0')
        ? '62' + noHpClean.slice(1)
        : noHpClean.startsWith('62')
          ? '0' + noHpClean.slice(2)
          : null

      const person = await db.person.findFirst({
        where: {
          tenant_slug: tenant.slug,
          OR: [
            { no_hp: noHpClean },
            ...(noHpAlt ? [{ no_hp: noHpAlt }] : []),
          ],
        },
      })

      if (!person) {
        // Buat person baru (minimal data)
        const newPerson = await db.person.create({
          data: {
            tenant_slug: tenant.slug,
            name:        nama,
            no_hp:       noHpClean,
          },
        })

        await db.kegiatanPeserta.create({
          data: {
            kegiatan_id: kegiatan.id,
            person_id:   newPerson.id,
            tenant_slug: tenant.slug,
            sumber:      'self',
          },
        })

        return NextResponse.json({ ok: true, nama: newPerson.name, isNew: true })
      }

      // Cek sudah terdaftar
      const sudahDaftar = await db.kegiatanPeserta.findFirst({
        where: { kegiatan_id: kegiatan.id, person_id: person.id },
      })
      if (sudahDaftar) {
        return NextResponse.json({ ok: true, nama: person.name, sudahDaftar: true })
      }

      await db.kegiatanPeserta.create({
        data: {
          kegiatan_id: kegiatan.id,
          person_id:   person.id,
          tenant_slug: tenant.slug,
          sumber:      'self',
        },
      })

      return NextResponse.json({ ok: true, nama: person.name, isNew: false })
    }

    return NextResponse.json({ error: 'Kegiatan tidak ditemukan' }, { status: 404 })
  } catch (e) {
    console.error('[POST /api/kegiatan/token]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
