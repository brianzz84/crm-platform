import { Metadata } from 'next'
import { getSessionFromHeaders } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import ImportExcelClient from './ImportExcelClient'

export const metadata: Metadata = { title: 'Import Excel Pasien' }

export default async function ImportPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'importExcel')) redirect(`/${params.slug}/dashboard`)

  const db = await getTenantDb(params.slug)
  const logs = await db.importLog.findMany({
    where:   { tenant_slug: params.slug },
    orderBy: { started_at: 'desc' },
    take:    10,
    select: {
      id:              true,
      filename:        true,
      status:          true,
      total_rows:      true,
      new_persons:     true,
      updated_persons: true,
      new_visits:      true,
      skipped_rows:    true,
      started_at:      true,
      finished_at:     true,
    },
  })

  return (
    <ImportExcelClient
      slug={params.slug}
      initialLogs={JSON.parse(JSON.stringify(logs))}
    />
  )
}
