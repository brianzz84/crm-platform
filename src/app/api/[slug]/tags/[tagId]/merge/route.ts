import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { z } from 'zod'

type Ctx = { params: { slug: string; tagId: string } }

const Schema = z.object({
  source_ids: z.array(z.string().uuid()).min(1),
})

// POST /api/[slug]/tags/[tagId]/merge
// Gabungkan source_ids ke tagId (target). Source dinonaktifkan; nama & alias
// tag sumber disimpan sebagai alias baru di tag tujuan (riwayat penamaan tak hilang).
export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageTagRules')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Data tidak valid' }, { status: 400 })

    const targetId    = params.tagId
    const { source_ids } = parsed.data

    if (source_ids.includes(targetId)) {
      return NextResponse.json({ error: 'Tag sumber tidak boleh sama dengan tag tujuan' }, { status: 400 })
    }

    const db = await getTenantDb(params.slug)

    // Verifikasi semua tag milik tenant ini
    const allTags = await db.tag.findMany({
      where:   { id: { in: [targetId, ...source_ids] }, tenant_slug: params.slug },
      include: { aliases: { select: { alias: true } } },
    })
    if (allTags.length !== source_ids.length + 1) {
      return NextResponse.json({ error: 'Satu atau lebih tag tidak ditemukan' }, { status: 404 })
    }

    let totalDipindah = 0

    for (const srcId of source_ids) {
      const srcTag = allTags.find((t: any) => t.id === srcId)!

      // Simpan nama & alias tag sumber sebagai alias baru di tag tujuan
      const namaBaruSbgAlias = [srcTag.name, ...(srcTag.aliases?.map((a: any) => a.alias) ?? [])]
      for (const aliasText of namaBaruSbgAlias) {
        const sudahAda = await db.tagAlias.findFirst({
          where: { tag_id: targetId, alias: { equals: aliasText, mode: 'insensitive' } },
        })
        if (!sudahAda) {
          await db.tagAlias.create({ data: { tag_id: targetId, alias: aliasText } }).catch(() => null)
        }
      }
      // Ambil semua PersonTag dari tag sumber
      const srcPersonTags = await db.personTag.findMany({
        where: { tag_id: srcId, aktif: true },
        select: { person_id: true, sumber: true, confidence: true },
      })

      for (const pt of srcPersonTags) {
        // Cek apakah person sudah punya tag target
        const sudahAda = await db.personTag.findFirst({
          where: { person_id: pt.person_id, tag_id: targetId },
        })

        if (sudahAda) {
          // Jika sudah ada, nonaktifkan yang dari source saja
          await db.personTag.updateMany({
            where: { person_id: pt.person_id, tag_id: srcId },
            data:  { aktif: false },
          })
        } else {
          // Pindahkan ke target
          await db.personTag.updateMany({
            where: { person_id: pt.person_id, tag_id: srcId },
            data:  { tag_id: targetId },
          })
          totalDipindah++
        }
      }

      // Nonaktifkan tag rule sumber jika ada
      await db.tagRule.updateMany({
        where: { tag_id: srcId },
        data:  { aktif: false },
      })

      // Nonaktifkan tag sumber
      await db.tag.update({
        where: { id: srcId },
        data:  { aktif: false },
      })
    }

    const totalAkhir = await db.personTag.count({ where: { tag_id: targetId, aktif: true } })

    return NextResponse.json({
      success: true,
      data: { total_dipindah: totalDipindah, total_akhir: totalAkhir },
    })
  } catch (e) {
    console.error('[POST /api/[slug]/tags/[tagId]/merge]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
