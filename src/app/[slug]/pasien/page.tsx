import { Metadata } from 'next'
import Link from 'next/link'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import PasienTable from './PasienTable'

export const metadata: Metadata = { title: 'Data Pasien' }

export default function PasienPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  const canImport = session ? canDo(session.roles, 'importExcel') : false

  return (
    <div className="pasien-list-page" style={{ padding: 'var(--sp-6)', flex: 1 }}>
      <div className="pasien-list-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--sp-4)', marginBottom: 'var(--sp-5)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
            Data Pasien
          </h1>
          <p className="pasien-list-subtitle" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
            Data gabungan dari SIMRS dan sistem AKAR. Disinkronkan otomatis setiap jam.
          </p>
        </div>
        <div className="pasien-list-actions" style={{ display: 'flex', gap: 'var(--sp-2)', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Link
            href={`/${params.slug}/pasien/tambah`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '9px 16px', borderRadius: 'var(--r-md)',
              background: 'var(--c-primary)', color: 'white',
              fontWeight: 600, fontSize: 'var(--font-size-sm)',
              textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            + Tambah Pasien
          </Link>
          {canImport && (
            <Link
              href={`/${params.slug}/pasien/import`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 16px', borderRadius: 'var(--r-md)',
                border: '1.5px solid var(--c-secondary)', background: 'white', color: 'var(--c-secondary)',
                fontWeight: 600, fontSize: 'var(--font-size-sm)',
                textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >
              ⬆ Import Excel
            </Link>
          )}
        </div>
      </div>
      <PasienTable slug={params.slug} />
    </div>
  )
}
