import { Metadata } from 'next'
import LoginForm from './LoginForm'

export const metadata: Metadata = { title: 'Login' }

export default function LoginPage() {
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
        {/* Logo */}
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
            CRM Platform
          </h1>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
            Masuk ke akun Anda
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--c-surface)',
          borderRadius: 'var(--r-lg)',
          border: '1px solid var(--c-border)',
          padding: 'var(--sp-6)',
          boxShadow: 'var(--shadow-md)',
        }}>
          <LoginForm />
        </div>

        <p style={{ textAlign: 'center', fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', marginTop: 'var(--sp-6)' }}>
          Organisasi belum terdaftar?{' '}
          <a href="/register" style={{ color: 'var(--c-secondary)', fontWeight: 600, textDecoration: 'none' }}>
            Daftar sekarang
          </a>
        </p>
      </div>
    </div>
  )
}
