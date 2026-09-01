/**
 * Daftar & penetapan label percakapan.
 *
 * GET   — percakapan BESERTA SELURUH ISINYA dan usulan AI-nya, untuk ditinjau.
 * PATCH — menetapkan label. Hanya lewat sini angka laporan berubah.
 *
 * Seluruh percakapan dikirim, bukan satu baris pembuka. Menilai topik dari satu
 * pesan pertama tidak layak disebut meninjau — apalagi ketika pesan pembuka
 * rata-rata hanya berbunyi "halo". Biayanya kecil: rata-rata 4,5 pesan per
 * percakapan.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { semaiTopik } from '@/lib/percakapan-topik'
import { semaiPoli } from '@/lib/percakapan-poli'

type Ctx = { params: { slug: string } }

const MAKS_BARIS       = 60
const MAKS_PESAN       = 60
const MAKS_HURUF_PESAN = 2000

interface PesanMentah { direction: string; content: string | null; created_at: Date }
interface LabelMentah { dimensi: string; kode: string; disetujui: boolean; sumber: string; alasan: string | null }
interface BarisMentah {
  id: string
  channel: string
  channel_user_name: string | null
  last_message_at: Date
  messages: PesanMentah[]
  labels: LabelMentah[]
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewKanalPublik')
  if (error) return error

  // 'perlu'   = belum ada label yang disetujui (inilah pekerjaannya)
  // 'selesai' = sudah ada minimal satu label disetujui
  const saring = req.nextUrl.searchParams.get('saring') ?? 'perlu'

  try {
    const db = await getTenantDb(params.slug)
    await semaiTopik(db, params.slug)
    await semaiPoli(db, params.slug)

    const where: Record<string, unknown> = {
      tenant_slug: params.slug,
      messages: { some: { direction: 'incoming', is_internal_note: false } },
    }
    if (saring === 'perlu')        where.labels = { none: { disetujui: true } }
    else if (saring === 'selesai') where.labels = { some: { disetujui: true } }

    const [topik, poli, rows, jumlahPerlu] = await Promise.all([
      db.percakapanTopikLibrary.findMany({
        where:   { tenant_slug: params.slug, aktif: true },
        orderBy: [{ urutan: 'asc' }],
        select:  { kode: true, nama: true, warna: true, deskripsi: true },
      }),
      db.percakapanPoliLibrary.findMany({
        where:   { tenant_slug: params.slug, aktif: true },
        orderBy: [{ urutan: 'asc' }],
        select:  { kode: true, nama: true, warna: true, kelompok: true },
      }),
      db.conversation.findMany({
        where,
        orderBy: { last_message_at: 'desc' },
        take:    MAKS_BARIS,
        select: {
          id: true, channel: true, channel_user_name: true, last_message_at: true,
          messages: {
            where:   { is_internal_note: false },
            orderBy: { created_at: 'asc' },
            take:    MAKS_PESAN,
            select:  { direction: true, content: true, created_at: true },
          },
          labels: {
            select: { dimensi: true, kode: true, disetujui: true, sumber: true, alasan: true },
          },
        },
      }),
      db.conversation.count({
        where: {
          tenant_slug: params.slug,
          labels: { none: { disetujui: true } },
          messages: { some: { direction: 'incoming', is_internal_note: false } },
        },
      }),
    ])

    return NextResponse.json({
      success: true,
      topik,
      poli,
      jumlahPerlu,
      data: rows.map((r: BarisMentah) => {
        const label = (dimensi: string, disetujui: boolean) =>
          r.labels.filter(l => l.dimensi === dimensi && l.disetujui === disetujui).map(l => l.kode)
        return {
          id:           r.id,
          kanal:        r.channel,
          nama:         r.channel_user_name,
          terakhirPada: r.last_message_at,
          // Alasan AI mana pun sudah cukup — satu percakapan hanya punya satu.
          alasan:       r.labels.find(l => l.sumber === 'AI' && l.alasan)?.alasan ?? null,
          topik:        label('TOPIK', true),
          poli:         label('POLI',  true),
          topikUsulan:  label('TOPIK', false),
          poliUsulan:   label('POLI',  false),
          pesan: r.messages.map(m => ({
            masuk: m.direction === 'incoming',
            teks:  (m.content ?? '').slice(0, MAKS_HURUF_PESAN),
            pada:  m.created_at,
          })),
        }
      }),
    })
  } catch (e) {
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

  try {
    const db = await getTenantDb(params.slug)
    const [topikSah, poliSah] = await Promise.all([
      db.percakapanTopikLibrary.findMany({
        where: { tenant_slug: params.slug, aktif: true }, select: { kode: true },
      }),
      db.percakapanPoliLibrary.findMany({
        where: { tenant_slug: params.slug, aktif: true }, select: { kode: true },
      }),
    ])
    const sah: Record<string, Set<string>> = {
      TOPIK: new Set(topikSah.map((t: { kode: string }) => t.kode)),
      POLI:  new Set(poliSah.map((p: { kode: string }) => p.kode)),
    }

    // Terima semua usulan sekaligus. Ada karena riwayat pertama menumpuk puluhan
    // percakapan, dan memaksa satu per satu di situ hanya melahirkan klik tanpa
    // membaca. Hanya menyentuh percakapan yang BELUM punya label disetujui —
    // keputusan manusia yang sudah ada tidak pernah ditimpa dari sini.
    if (body.setujuiSemua === true) {
      const kandidat = await db.conversation.findMany({
        where: {
          tenant_slug: params.slug,
          labels: { none: { disetujui: true }, some: { disetujui: false } },
        },
        select: { id: true },
      })
      const r = await db.conversationLabel.updateMany({
        where: { conversation_id: { in: kandidat.map((k: { id: string }) => k.id) }, disetujui: false },
        data:  { disetujui: true },
      })
      return NextResponse.json({ success: true, disetujui: kandidat.length, label: r.count })
    }

    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) return NextResponse.json({ success: false, error: 'id wajib diisi.' }, { status: 400 })

    // Jangan percaya id dari klien — pastikan percakapannya milik tenant ini.
    const ada = await db.conversation.findFirst({
      where: { id, tenant_slug: params.slug }, select: { id: true },
    })
    if (!ada) return NextResponse.json({ success: false, error: 'Percakapan tidak ditemukan.' }, { status: 404 })

    // Penetapan MENGGANTI seluruh isi dimensi yang dikirim, bukan menambahi:
    // hanya dengan begitu mencabut satu label bisa dinyatakan dari UI. Dimensi
    // yang tidak dikirim tidak disentuh sama sekali.
    for (const dimensi of ['TOPIK', 'POLI'] as const) {
      const kunci = dimensi === 'TOPIK' ? 'topik' : 'poli'
      const nilai = body[kunci]
      if (!Array.isArray(nilai)) continue

      const kode  = [...new Set(nilai.filter((k): k is string => typeof k === 'string'))]
      const asing = kode.filter(k => !sah[dimensi].has(k))
      if (asing.length) {
        return NextResponse.json(
          { success: false, error: `Kode tidak dikenal pada ${kunci}: ${asing.join(', ')}` },
          { status: 400 })
      }

      await db.conversationLabel.deleteMany({ where: { conversation_id: id, dimensi } })
      for (const k of kode) {
        await db.conversationLabel.create({
          data: { conversation_id: id, dimensi, kode: k, sumber: 'MANUAL', disetujui: true },
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
