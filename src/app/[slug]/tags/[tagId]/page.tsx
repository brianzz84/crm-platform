import { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import TagRuleEditor from './TagRuleEditor'

export const metadata: Metadata = { title: 'Aturan AI Tag' }

export default async function TagDetailPage({ params }: { params: { slug: string; tagId: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'manageTagRules')) redirect(`/${params.slug}/dashboard`)

  const db  = await getTenantDb(params.slug)
  const tag = await db.tag.findFirst({
    where:   { id: params.tagId, tenant_slug: params.slug },
    include: {
      tag_rules:  { where: { aktif: true }, take: 1 },
      _count:     { select: { person_tags: { where: { aktif: true } } } },
    },
  })
  if (!tag) notFound()

  // Sample pasien dengan tag ini (untuk konteks)
  const samplePersons = await db.personTag.findMany({
    where: { tag_id: params.tagId, aktif: true, sumber: 'auto_ai' },
    take:  5,
    include: { person: { select: { name: true, no_rm: true } } },
    orderBy: { confidence: 'desc' },
  })

  const rule        = tag.tag_rules[0] ?? null
  const totalManual = await db.personTag.count({ where: { tag_id: params.tagId, aktif: true, sumber: 'manual' } })
  const totalAI     = await db.personTag.count({ where: { tag_id: params.tagId, aktif: true, sumber: 'auto_ai' } })

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1, maxWidth: 900 }}>

      {/* Breadcrumb */}
      <div style={{ marginBottom: 'var(--sp-4)', fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
        <Link href={`/${params.slug}/tags`} style={{ color: 'var(--c-secondary)', textDecoration: 'none', fontWeight: 600 }}>
          Manajemen Tag
        </Link>
        {' / '}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: tag.warna, display: 'inline-block' }} />
          {tag.name}
        </span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--sp-6)', flexWrap: 'wrap', gap: 'var(--sp-4)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <span style={{ width: 18, height: 18, borderRadius: '50%', background: tag.warna, display: 'inline-block', flexShrink: 0 }} />
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', margin: 0 }}>
              {tag.name}
            </h1>
            {!tag.aktif && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#F1F5F9', color: '#94A3B8' }}>Nonaktif</span>
            )}
          </div>
          {tag.keterangan && (
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', margin: 0, paddingLeft: 30 }}>
              {tag.keterangan}
            </p>
          )}
        </div>

        {/* Stat chips */}
        <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
          <div style={{ textAlign: 'center', background: 'var(--c-bg)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', padding: '6px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-text-faint)', textTransform: 'uppercase' }}>Total</div>
            <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--c-primary)' }}>{tag._count.person_tags}</div>
          </div>
          <div style={{ textAlign: 'center', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 'var(--r-sm)', padding: '6px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#3B82F6', textTransform: 'uppercase' }}>Manual</div>
            <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: '#1D4ED8' }}>{totalManual}</div>
          </div>
          <div style={{ textAlign: 'center', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 'var(--r-sm)', padding: '6px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#22C55E', textTransform: 'uppercase' }}>AI Auto</div>
            <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: '#15803D' }}>{totalAI}</div>
          </div>
        </div>
      </div>

      {/* Sample pasien AI (jika ada) */}
      {samplePersons.length > 0 && (
        <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', padding: 'var(--sp-4) var(--sp-5)', marginBottom: 'var(--sp-5)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--c-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Contoh pasien AI auto-tag (confidence tertinggi)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {samplePersons.map(sp => (
              <div key={sp.person_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--c-bg)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', padding: '4px 12px', fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>{sp.person.name}</span>
                {sp.person.no_rm && <span style={{ color: 'var(--c-text-faint)' }}>RM {sp.person.no_rm}</span>}
                {sp.confidence != null && (
                  <span style={{ color: '#22C55E', fontWeight: 700 }}>{Math.round(sp.confidence * 100)}%</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rule Editor */}
      <TagRuleEditor slug={params.slug} tagId={params.tagId} tagName={tag.name} initialRule={rule as any} />
    </div>
  )
}
