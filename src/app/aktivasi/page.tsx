import { Metadata } from 'next'
import { Suspense } from 'react'
import AktivasiClient from './AktivasiClient'

export const metadata: Metadata = { title: 'Aktivasi Akun — CRM Platform' }

export default function AktivasiPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-muted)' }}>
        Memuat...
      </div>
    }>
      <AktivasiClient />
    </Suspense>
  )
}
