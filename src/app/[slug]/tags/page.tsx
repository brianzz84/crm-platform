import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import TagsClient from './TagsClient'

export const metadata: Metadata = { title: 'Manajemen Tag' }

export default async function TagsPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'manageTagRules')) redirect(`/${params.slug}/dashboard`)

  const db   = await getTenantDb(params.slug)
  const tags = await db.tag.findMany({
    where:   { tenant_slug: params.slug },
    orderBy: [{ aktif: 'desc' }, { name: 'asc' }],
    include: {
      _count:  { select: { person_tags: { where: { aktif: true } }, tag_rules: { where: { aktif: true } } } },
      aliases: { orderBy: { alias: 'asc' } },
    },
  })

  const tagIds     = tags.map(t => t.id)
  const breakdown  = tagIds.length
    ? await db.personTag.groupBy({
        by:     ['tag_id', 'sumber'],
        where:  { tag_id: { in: tagIds }, aktif: true },
        _count: { _all: true },
      })
    : []

  const bdMap: Record<string, Record<string, number>> = {}
  for (const b of breakdown) {
    if (!bdMap[b.tag_id]) bdMap[b.tag_id] = {}
    bdMap[b.tag_id][b.sumber as string] = b._count._all
  }

  const initialTags = tags.map(t => ({
    id:           t.id,
    name:         t.name,
    kategori:     t.kategori,
    warna:        t.warna,
    keterangan:   t.keterangan ?? '',
    aktif:        t.aktif,
    created_at:   t.created_at.toISOString(),
    total_pasien: t._count.person_tags,
    has_rule:     t._count.tag_rules > 0,
    breakdown:    bdMap[t.id] ?? {},
    aliases:      t.aliases.map(a => ({ id: a.id, alias: a.alias })),
  }))

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1 }}>
      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
          Manajemen Tag
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
          Kelola label pasien untuk segmentasi dan AI auto-tag.
        </p>
      </div>
      <TagsClient slug={params.slug} initialTags={initialTags} />
    </div>
  )
}
