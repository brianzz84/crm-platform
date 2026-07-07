import { Metadata } from 'next'
import { Suspense } from 'react'
import ResetPasswordClient from './ResetPasswordClient'

export const metadata: Metadata = { title: 'Reset Password — CRM Platform' }

export default function ResetPasswordPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--c-bg)',
      padding: 'var(--sp-4)',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--sp-8)' }}>
          <div style={{
            width: 48, height: 48,
            background: 'var(--c-primary)',
            borderRadius: 'var(--r-lg)',
            margin: '0 auto var(--sp-4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: 'white', fontWeight: 800, fontSize: 20 }}>C</span>
          </div>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
            Reset Password
          </h1>
        </div>

        <div style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--r-xl)',
          boxShadow: 'var(--shadow-md)',
          padding: 'var(--sp-8)',
        }}>
          <Suspense>
            <ResetPasswordClient />
          </Suspense>
        </div>

        <p style={{ textAlign: 'center', marginTop: 'var(--sp-6)', fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
          <a href="/login" style={{ color: 'var(--c-secondary)', fontWeight: 600, textDecoration: 'none' }}>
            Kembali ke Login
          </a>
        </p>
      </div>
    </div>
  )
}
