'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { canDo } from '@/constants'

interface NavItem {
  href:    string
  label:   string
  icon:    string
  feature?: string
  badge?:  number
}

interface SidebarProps {
  tenantSlug: string
  tenantName: string
  logoUrl?:   string | null
  userName:   string
  userRoles:  string[]
}

export default function Sidebar({ tenantSlug, tenantName, logoUrl, userName, userRoles }: SidebarProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const base     = `/${tenantSlug}`

  const [mobileOpen,   setMobileOpen]   = useState(false)
  const [inboxUnread,  setInboxUnread]  = useState(0)

  // Tutup drawer saat navigasi
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Listen unread count dari InboxNotifier
  useEffect(() => {
    const handler = (e: Event) => setInboxUnread((e as CustomEvent).detail.total)
    window.addEventListener('inbox:unread', handler)
    return () => window.removeEventListener('inbox:unread', handler)
  }, [])

  const navGroups: { title: string; items: NavItem[] }[] = [
    {
      title: 'Menu Utama',
      items: [
        { href: `${base}/dashboard`, label: 'Dashboard',   icon: '📊' },
        { href: `${base}/pasien`,    label: 'Data Pasien', icon: '👥' },
        { href: `${base}/segmen`,    label: 'Segmentasi',  icon: '🎯', feature: 'manageSegments' },
        { href: `${base}/broadcast`, label: 'Broadcast',   icon: '📢', feature: 'manageBroadcast' },
        { href: `${base}/inbox`,     label: 'Inbox',       icon: '💬', feature: 'replyChat', badge: inboxUnread || undefined },
      ],
    },
    {
      title: 'Manajemen',
      items: [
        { href: `${base}/kegiatan`, label: 'Kegiatan', icon: '📅', feature: 'manageKegiatan' },
        { href: `${base}/tags`,     label: 'Tag',      icon: '🏷',  feature: 'manageTagRules' },
        { href: `${base}/sapaan`,   label: 'Sapaan',   icon: '🎉',  feature: 'manageSapaan' },
        { href: `${base}/library`,  label: 'Library',  icon: '📚',  feature: 'icdLibrary' },
      ],
    },
    {
      title: 'Sistem',
      items: [
        { href: `${base}/pengaturan`, label: 'Pengaturan', icon: '⚙️', feature: 'configSystem' },
      ],
    },
  ]

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const roleLabels: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin',
    ADMIN_IT:    'Admin IT',
    ADMIN_OPS:   'Admin Operasional',
    SUPERVISOR:  'Supervisor',
    AGEN:        'Agen',
  }
  const primaryRole = userRoles[0] || 'AGEN'
  const roleDisplay = userRoles.length > 1
    ? `${roleLabels[primaryRole] || primaryRole} +${userRoles.length - 1}`
    : (roleLabels[primaryRole] || primaryRole)

  const sidebarContent = (
    <aside style={{
      width: '100%',
      background: 'var(--c-primary)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflowY: 'auto',
    }}>
      {/* Brand */}
      <div style={{
        padding: 'var(--sp-5) var(--sp-4)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link href={`/${tenantSlug}/dashboard`} style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
          minWidth: 0, textDecoration: 'none', flex: 1,
        }}>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={tenantName}
              style={{
                width: 36, height: 36, borderRadius: 'var(--r-sm)',
                objectFit: 'contain', flexShrink: 0,
                background: 'rgba(255,255,255,0.15)',
              }}
            />
          ) : (
            <div style={{
              width: 36, height: 36,
              background: 'var(--c-secondary)',
              borderRadius: 'var(--r-sm)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{ color: 'white', fontWeight: 800, fontSize: 15 }}>
                {tenantName.slice(0, 1).toUpperCase()}
              </span>
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'white', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tenantName}
            </div>
            <div style={{
              fontSize: 10, color: 'rgba(255,255,255,0.55)',
              background: 'rgba(255,255,255,0.12)',
              padding: '1px 7px', borderRadius: 99, marginTop: 3,
              display: 'inline-block', letterSpacing: '0.3px',
            }}>
              CRM 360°
            </div>
          </div>
        </Link>
        {/* Tombol tutup — hanya tampil di mobile via CSS */}
        <button
          className="sidebar-close-btn"
          onClick={() => setMobileOpen(false)}
          style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)',
            fontSize: 22, cursor: 'pointer', padding: '4px 8px', flexShrink: 0,
          }}
        >✕</button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: 'var(--sp-4) 0' }}>
        {navGroups.map(group => {
          const visibleItems = group.items.filter(item =>
            !item.feature || canDo(userRoles, item.feature as any)
          )
          if (!visibleItems.length) return null
          return (
            <div key={group.title} style={{ marginBottom: 'var(--sp-4)' }}>
              <div style={{
                fontSize: 10, fontWeight: 700,
                color: 'rgba(255,255,255,0.3)',
                letterSpacing: '1px', textTransform: 'uppercase',
                padding: 'var(--sp-1) var(--sp-4)', marginBottom: 'var(--sp-1)',
              }}>
                {group.title}
              </div>
              {visibleItems.map(item => {
                const active = pathname.startsWith(item.href)
                return (
                  <Link key={item.href} href={item.href} style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
                    padding: '10px var(--sp-4)',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: active ? 600 : 500,
                    color: active ? 'white' : 'rgba(255,255,255,0.55)',
                    background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                    borderLeft: `3px solid ${active ? 'var(--c-secondary)' : 'transparent'}`,
                    transition: 'var(--transition)',
                    textDecoration: 'none',
                  }}>
                    <span style={{ fontSize: 18, width: 22, textAlign: 'center' }}>{item.icon}</span>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {item.badge ? (
                      <span style={{
                        background: 'var(--c-error)', color: 'white',
                        fontSize: 10, fontWeight: 700, padding: '1px 6px',
                        borderRadius: 99, minWidth: 18, textAlign: 'center',
                      }}>
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* User footer */}
      <div style={{ padding: 'var(--sp-4)', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'var(--c-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: 'white', flexShrink: 0,
          }}>
            {userName.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {userName}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{roleDisplay}</div>
          </div>
          <button onClick={handleLogout} title="Keluar" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.35)', fontSize: 16, padding: 4,
          }}>
            ⏏
          </button>
        </div>
      </div>
    </aside>
  )

  return (
    <>
      {/* ── Mobile top bar — tersembunyi di desktop via CSS ── */}
      <div className="sidebar-topbar">
        <button onClick={() => setMobileOpen(true)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'white', fontSize: 22, padding: '4px', display: 'flex', alignItems: 'center',
        }}>
          ☰
        </button>
        <Link href={`/${tenantSlug}/dashboard`} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          flex: 1, minWidth: 0, textDecoration: 'none',
        }}>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={tenantName}
              style={{
                width: 28, height: 28, borderRadius: 6,
                objectFit: 'contain', flexShrink: 0,
                background: 'rgba(255,255,255,0.15)',
              }}
            />
          ) : (
            <div style={{
              width: 28, height: 28, background: 'var(--c-secondary)',
              borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, color: 'white', flexShrink: 0,
            }}>
              {tenantName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tenantName}
            </div>
          </div>
        </Link>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.12)', padding: '2px 8px', borderRadius: 99, flexShrink: 0 }}>
          CRM 360°
        </div>
      </div>

      {/* ── Backdrop — hanya saat drawer terbuka ── */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.5)',
          }}
        />
      )}

      {/* ── Sidebar wrapper — sticky di desktop, fixed drawer di mobile via CSS ── */}
      <div
        className={`sidebar-wrapper${mobileOpen ? ' sidebar-open' : ''}`}
      >
        {sidebarContent}
      </div>
    </>
  )
}
