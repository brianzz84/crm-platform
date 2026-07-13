'use client'

import { useState } from 'react'

type UserRole = 'SUPER_ADMIN' | 'ADMIN_IT' | 'ADMIN_OPS' | 'SUPERVISOR' | 'AGEN'

interface AppUser {
  id: string; name: string; email: string
  roles: UserRole[]; aktif: boolean
  last_login_at: string | null; created_at: string
  invite_token: string | null
}

const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN_IT:    'Admin IT',
  ADMIN_OPS:   'Admin Ops',
  SUPERVISOR:  'Supervisor',
  AGEN:        'Agen',
}

const ROLE_COLORS: Record<UserRole, { bg: string; color: string }> = {
  SUPER_ADMIN: { bg: '#EDE9FE', color: '#7C3AED' },
  ADMIN_IT:    { bg: '#DBEAFE', color: '#1D4ED8' },
  ADMIN_OPS:   { bg: '#E0F4F4', color: '#006E89' },
  SUPERVISOR:  { bg: '#FEF3C7', color: '#92400E' },
  AGEN:        { bg: '#F3F4F6', color: '#374151' },
}

const ALL_ROLES: UserRole[] = ['ADMIN_IT', 'ADMIN_OPS', 'SUPERVISOR', 'AGEN']

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}

export default function UsersClient({
  slug,
  initialUsers,
  activeAdminItCount,
  currentUserId,
}: {
  slug: string
  initialUsers: AppUser[]
  activeAdminItCount: number
  currentUserId: string
}) {
  const [users, setUsers]           = useState(initialUsers)
  const [adminItCount, setAdminItCount] = useState(activeAdminItCount)
  const [showModal, setShowModal]   = useState(false)
  const [editUser, setEditUser]     = useState<AppUser | null>(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [toast, setToast]           = useState('')
  const [inviteResult, setInviteResult] = useState<{ email: string; url: string; emailSent: boolean; emailError?: string } | null>(null)

  // Form state
  const [form, setForm] = useState({ name: '', email: '', roles: [] as UserRole[] })

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function openInvite() {
    setEditUser(null)
    setForm({ name: '', email: '', roles: [] })
    setError('')
    setShowModal(true)
  }

  function openEdit(u: AppUser) {
    setEditUser(u)
    setForm({ name: u.name, email: u.email, roles: [...u.roles] })
    setError('')
    setShowModal(true)
  }

  function toggleRole(role: UserRole) {
    setForm(f => ({
      ...f,
      roles: f.roles.includes(role)
        ? f.roles.filter(r => r !== role)
        : [...f.roles, role],
    }))
  }

  async function handleSubmit() {
    if (!form.name.trim() || !form.email.trim() || form.roles.length === 0) {
      setError('Nama, email, dan minimal 1 role wajib diisi')
      return
    }
    setLoading(true); setError('')

    try {
      if (editUser) {
        // Update user
        const res  = await fetch(`/api/${slug}/pengaturan/users/${editUser.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ name: form.name, roles: form.roles }),
        })
        const json = await res.json()
        if (!json.success) throw new Error(json.error)
        setUsers(us => us.map(u => u.id === editUser.id ? { ...u, ...json.data } : u))
        setShowModal(false)
        showToast('Pengguna berhasil diperbarui')
      } else {
        // Undang user baru
        const res  = await fetch(`/api/${slug}/pengaturan/users`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ name: form.name, email: form.email, roles: form.roles }),
        })
        const json = await res.json()
        if (!json.success) throw new Error(json.error)
        setUsers(us => [json.data, ...us])
        setShowModal(false)
        setInviteResult({ email: form.email, url: json.inviteUrl, emailSent: !!json.emailSent, emailError: json.emailError })
        showToast(json.emailSent ? `Email undangan terkirim ke ${form.email}` : `User dibuat — email belum terkirim, salin link aktivasi`)
      }
    } catch (e: any) {
      setError(e.message || 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  async function toggleAktif(u: AppUser) {
    if (u.id === currentUserId) return
    try {
      const res  = await fetch(`/api/${slug}/pengaturan/users/${u.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ aktif: !u.aktif }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setUsers(us => us.map(x => x.id === u.id ? { ...x, aktif: !x.aktif } : x))
      // Recalculate admin IT count
      const updated = users.map(x => x.id === u.id ? { ...x, aktif: !x.aktif } : x)
      setAdminItCount(updated.filter(x => x.aktif && x.roles.includes('ADMIN_IT')).length)
      showToast(u.aktif ? 'Akun dinonaktifkan' : 'Akun diaktifkan')
    } catch (e: any) {
      showToast(`Gagal: ${e.message}`)
    }
  }

  async function resendInvite(u: AppUser) {
    try {
      const res  = await fetch(`/api/${slug}/pengaturan/users/${u.id}`, { method: 'POST' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      showToast('Link undangan baru telah dikirim')
    } catch (e: any) {
      showToast(`Gagal: ${e.message}`)
    }
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 200,
          background: 'var(--c-primary)', color: 'white',
          padding: '12px 20px', borderRadius: 'var(--r-md)',
          fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          {toast}
        </div>
      )}

      {/* Header aksi */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--sp-4)' }}>
        <button
          onClick={openInvite}
          style={{
            padding: '9px 18px', borderRadius: 'var(--r-md)',
            background: 'var(--c-secondary)', color: 'white',
            fontWeight: 600, fontSize: 'var(--font-size-sm)',
            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          + Undang Pengguna
        </button>
      </div>

      {/* Tabel */}
      <div style={{ background: 'var(--c-surface)', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
          <thead>
            <tr style={{ background: 'var(--c-bg)' }}>
              {['Nama', 'Email', 'Role', 'Status', 'Terakhir Login', 'Aksi'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--c-text-muted)', borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? '1px solid var(--c-border)' : 'none', background: u.id === currentUserId ? 'var(--c-primary-xlight)' : 'transparent' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                  {u.name}
                  {u.id === currentUserId && (
                    <span style={{ marginLeft: 6, fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)' }}>(Anda)</span>
                  )}
                </td>
                <td style={{ padding: '12px 16px', color: 'var(--c-text-muted)' }}>{u.email}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {u.roles.map(r => {
                      const c = ROLE_COLORS[r] ?? { bg: '#F3F4F6', color: '#374151' }
                      return (
                        <span key={r} style={{ padding: '2px 8px', borderRadius: 'var(--r-full)', fontSize: 'var(--font-size-xs)', fontWeight: 600, background: c.bg, color: c.color }}>
                          {ROLE_LABELS[r] ?? r}
                        </span>
                      )
                    })}
                  </div>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {u.invite_token ? (
                    <span style={{ fontSize: 'var(--font-size-xs)', color: '#92400E', background: '#FEF3C7', padding: '2px 8px', borderRadius: 'var(--r-full)', fontWeight: 600 }}>
                      Menunggu Aktivasi
                    </span>
                  ) : u.aktif ? (
                    <span style={{ fontSize: 'var(--font-size-xs)', color: '#278B58', background: 'var(--c-success-light)', padding: '2px 8px', borderRadius: 'var(--r-full)', fontWeight: 600 }}>
                      Aktif
                    </span>
                  ) : (
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', background: 'var(--c-border)', padding: '2px 8px', borderRadius: 'var(--r-full)', fontWeight: 600 }}>
                      Nonaktif
                    </span>
                  )}
                </td>
                <td style={{ padding: '12px 16px', color: 'var(--c-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                  {fmtDate(u.last_login_at)}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => openEdit(u)}
                      style={{ fontSize: 'var(--font-size-xs)', padding: '4px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)', background: 'white', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Edit Role
                    </button>
                    {u.invite_token && (
                      <button onClick={() => resendInvite(u)}
                        style={{ fontSize: 'var(--font-size-xs)', padding: '4px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--c-secondary)', color: 'var(--c-secondary)', background: 'white', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Kirim Ulang
                      </button>
                    )}
                    {!u.invite_token && u.id !== currentUserId && (
                      <button onClick={() => toggleAktif(u)}
                        style={{
                          fontSize: 'var(--font-size-xs)', padding: '4px 10px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit',
                          border: u.aktif ? '1px solid var(--c-error)' : '1px solid var(--c-success)',
                          color: u.aktif ? 'var(--c-error)' : '#278B58',
                          background: 'white',
                        }}>
                        {u.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--c-text-muted)' }}>
            Belum ada pengguna. Undang anggota tim sekarang.
          </div>
        )}
      </div>

      {/* Modal hasil undangan — tampilkan link aktivasi (fallback bila email gagal) */}
      {inviteResult && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setInviteResult(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 'var(--r-lg)', padding: 'var(--sp-6)', maxWidth: 480, width: '100%', boxShadow: 'var(--shadow-xl)' }}>
            <h3 style={{ fontWeight: 800, color: 'var(--c-primary)', marginBottom: 8 }}>Undangan Dibuat</h3>
            <div style={{ fontSize: 13, padding: '8px 12px', borderRadius: 'var(--r-md)', marginBottom: 12,
              background: inviteResult.emailSent ? '#F0FDF4' : '#FFFBEB', color: inviteResult.emailSent ? '#166534' : '#92400E' }}>
              {inviteResult.emailSent
                ? `✅ Email undangan terkirim ke ${inviteResult.email}.`
                : `⚠️ Email belum terkirim${inviteResult.emailError ? ` (${inviteResult.emailError})` : ''}. Bagikan link aktivasi di bawah secara manual.`}
            </div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-muted)' }}>Link Aktivasi (berlaku 7 hari)</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input readOnly value={inviteResult.url} onFocus={e => e.currentTarget.select()}
                style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', fontSize: 12, background: 'var(--c-bg)', color: 'var(--c-text)' }} />
              <button onClick={() => { navigator.clipboard?.writeText(inviteResult.url); showToast('Link disalin') }}
                style={{ padding: '8px 14px', borderRadius: 'var(--r-md)', border: 'none', background: 'var(--c-secondary)', color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Salin</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setInviteResult(null)} style={{ padding: '8px 18px', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)', background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Undang / Edit */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={{
            background: 'white', borderRadius: 'var(--r-xl)', padding: 'var(--sp-6)',
            width: '100%', maxWidth: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
          }}>
            <h2 style={{ fontWeight: 800, marginBottom: 'var(--sp-5)', color: 'var(--c-primary)' }}>
              {editUser ? 'Edit Pengguna' : 'Undang Pengguna Baru'}
            </h2>

            {error && (
              <div style={{ background: 'var(--c-error-light)', border: '1px solid var(--c-error)', borderRadius: 'var(--r-md)', padding: '10px 14px', marginBottom: 'var(--sp-4)', color: 'var(--c-error)', fontSize: 13 }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: 'var(--sp-4)' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Nama Lengkap</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nama lengkap pengguna"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--c-border)', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 'var(--sp-4)' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="email@rumahsakit.com"
                disabled={!!editUser}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 'var(--r-md)',
                  border: '1.5px solid var(--c-border)', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
                  background: editUser ? 'var(--c-bg)' : 'white', color: editUser ? 'var(--c-text-muted)' : 'var(--c-text)',
                }}
              />
            </div>

            <div style={{ marginBottom: 'var(--sp-5)' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                Role <span style={{ color: 'var(--c-text-muted)', fontWeight: 400 }}>(bisa lebih dari satu)</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ALL_ROLES.map(role => {
                  const c = ROLE_COLORS[role]
                  const selected = form.roles.includes(role)
                  return (
                    <button key={role} onClick={() => toggleRole(role)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                        border: selected ? `2px solid ${c.color}` : '1.5px solid var(--c-border)',
                        background: selected ? c.bg : 'white', fontFamily: 'inherit', textAlign: 'left',
                      }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: 4,
                        border: `2px solid ${selected ? c.color : 'var(--c-border)'}`,
                        background: selected ? c.color : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {selected && <span style={{ color: 'white', fontSize: 11, fontWeight: 800 }}>✓</span>}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: selected ? c.color : 'var(--c-text)' }}>
                          {ROLE_LABELS[role]}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>
                          {({
                            ADMIN_IT:    'Semua fitur + konfigurasi sistem & kelola user',
                            ADMIN_OPS:   'Import, tag, segmen, broadcast, sapaan terjadwal',
                            SUPERVISOR:  'Monitor semua inbox & assign percakapan',
                            AGEN:        'Balas chat pasien di inbox yang di-assign',
                          } as Record<string, string>)[role]}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
              <button onClick={() => setShowModal(false)}
                style={{ flex: 1, padding: '10px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--c-border)', background: 'white', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                Batal
              </button>
              <button onClick={handleSubmit} disabled={loading}
                style={{
                  flex: 2, padding: '10px', borderRadius: 'var(--r-md)',
                  background: loading ? 'var(--c-border)' : 'var(--c-secondary)', color: loading ? 'var(--c-text-muted)' : 'white',
                  fontWeight: 700, fontSize: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                }}>
                {loading ? 'Memproses...' : editUser ? 'Simpan Perubahan' : 'Kirim Undangan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
