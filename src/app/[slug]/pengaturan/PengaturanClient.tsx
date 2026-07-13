'use client'

import { useEffect, useState } from 'react'

interface Profile {
  nama_klinik: string
  nama_rs:     string
  logo_url:    string
  alamat:      string
  telp:        string
  email:       string
  website:     string
}

interface Meta {
  wappinAktif:  boolean
  wappinTested: boolean
  eflyerAktif:  boolean
  userCount:    number
  tenantName:   string
  plan:         string
  joinedAt:     string
}

interface Props {
  slug:           string
  userRoles:      string[]
  initialProfile: Profile | null
  meta:           Meta
}

const PLAN_LABEL: Record<string, string> = {
  TRIAL:      'Trial',
  STARTER:    'Starter',
  PROFESSIONAL: 'Professional',
  ENTERPRISE: 'Enterprise',
}

const PLAN_COLOR: Record<string, { bg: string; color: string }> = {
  TRIAL:        { bg: '#F1F5F9', color: '#64748B' },
  STARTER:      { bg: '#EFF6FF', color: '#3B82F6' },
  PROFESSIONAL: { bg: '#F0FDF4', color: '#22C55E' },
  ENTERPRISE:   { bg: '#FDF4FF', color: '#A21CAF' },
}

const SUB_MENUS = [
  {
    key:   'users',
    icon:  '👥',
    label: 'Pengguna & Akses',
    desc:  'Kelola akun pengguna, undang staf baru, dan atur role akses.',
    href:  (slug: string) => `/${slug}/pengaturan/users`,
    badge: (meta: Meta) => `${meta.userCount} pengguna aktif`,
    badgeColor: '#0089A8',
  },
  {
    key:   'integrasi',
    icon:  '🔗',
    label: 'Integrasi Wappin',
    desc:  'Konfigurasi WhatsApp Business API via Wappin untuk broadcast dan sapaan otomatis.',
    href:  (slug: string) => `/${slug}/pengaturan/integrasi`,
    badge: (meta: Meta) => meta.wappinAktif ? 'Terhubung' : meta.wappinTested ? 'Gagal koneksi' : 'Belum dikonfigurasi',
    badgeColor: (meta: Meta) => meta.wappinAktif ? '#22C55E' : '#F59E0B',
  },
  {
    key:   'meta',
    icon:  '🟢',
    label: 'Integrasi Meta Cloud API',
    desc:  'Konfigurasi WhatsApp Business langsung via Meta Cloud API tanpa pihak ketiga.',
    href:  (slug: string) => `/${slug}/pengaturan/meta`,
    badge: () => 'Direct API',
    badgeColor: () => '#1D4ED8',
  },
  {
    key:   'eflyer',
    icon:  '🖼️',
    label: 'Integrasi E-Flyer',
    desc:  'Aktifkan katalog flyer publik agar staf dapat mengirim flyer langsung dari chat.',
    href:  (slug: string) => `/${slug}/pengaturan/eflyer`,
    badge: (meta: Meta) => meta.eflyerAktif ? 'Aktif' : 'Nonaktif',
    badgeColor: (meta: Meta) => meta.eflyerAktif ? '#22C55E' : '#94A3B8',
  },
  {
    key:   'simrs',
    icon:  '🏥',
    label: 'Integrasi SIMRS',
    desc:  'Sinkronisasi data kunjungan pasien dari Sistem Informasi Manajemen RS secara otomatis.',
    href:  (slug: string) => `/${slug}/pengaturan/simrs`,
    badge: () => 'Konfigurasi',
    badgeColor: () => '#7C3AED',
  },
]

export default function PengaturanClient({ slug, userRoles, initialProfile, meta }: Props) {
  const empty: Profile = { nama_klinik: '', nama_rs: '', logo_url: '', alamat: '', telp: '', email: '', website: '' }
  const [form,     setForm]     = useState<Profile>(initialProfile ?? empty)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [error,    setError]    = useState('')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  function setField(k: keyof Profile, v: string) {
    setForm(f => ({ ...f, [k]: v }))
    setSaved(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(''); setSaved(false)
    try {
      const res  = await fetch(`/api/${slug}/pengaturan/profile`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Gagal menyimpan'); return }
      setSaved(true)
    } finally { setSaving(false) }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontFamily: 'inherit',
    fontSize: 'var(--font-size-sm)', border: '1.5px solid var(--c-border)',
    borderRadius: 'var(--r-sm)', background: 'var(--c-bg)', color: 'var(--c-text)',
    outline: 'none', boxSizing: 'border-box',
  }

  const planStyle = PLAN_COLOR[meta.plan] ?? PLAN_COLOR['TRIAL']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>

      {/* ── Info tenant ── */}
      <div style={{
        background: 'var(--c-surface)', border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-xl)', padding: 'var(--sp-5)',
        display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap',
      }}>
        {/* Logo / avatar */}
        <div style={{
          width: 64, height: 64, borderRadius: 'var(--r-lg)', flexShrink: 0,
          background: form.logo_url ? 'transparent' : 'var(--c-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', border: '1px solid var(--c-border)',
        }}>
          {form.logo_url
            ? <img src={form.logo_url} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 28, color: 'white', fontWeight: 800 }}>
                {(form.nama_klinik || meta.tenantName)[0]?.toUpperCase()}
              </span>
          }
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontWeight: 800, fontSize: 'var(--font-size-lg)', color: 'var(--c-primary)' }}>
              {form.nama_klinik || meta.tenantName}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99,
              background: planStyle.bg, color: planStyle.color,
            }}>
              {PLAN_LABEL[meta.plan] ?? meta.plan}
            </span>
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)' }}>
            Tenant ID: <code style={{ fontFamily: 'monospace', background: 'var(--c-bg)', padding: '1px 6px', borderRadius: 4 }}>{slug}</code>
            {meta.joinedAt && (
              <span style={{ marginLeft: 12 }}>
                Bergabung {new Date(meta.joinedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Sub-menu cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 'var(--sp-3)' }}>
        {SUB_MENUS.map(m => {
          const badgeColor = typeof m.badgeColor === 'function' ? m.badgeColor(meta) : m.badgeColor
          const badgeText  = m.badge(meta)
          return (
            <a key={m.key} href={m.href(slug)} style={{ textDecoration: 'none' }}>
              <div style={{
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                borderRadius: 'var(--r-xl)', padding: 'var(--sp-5)',
                display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                cursor: 'pointer',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement
                el.style.borderColor = 'var(--c-secondary)'
                el.style.boxShadow   = '0 2px 12px rgba(0,0,0,0.07)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement
                el.style.borderColor = 'var(--c-border)'
                el.style.boxShadow   = 'none'
              }}>
                <span style={{ fontSize: 28, flexShrink: 0, lineHeight: 1 }}>{m.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--c-primary)' }}>
                      {m.label}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 99,
                      background: badgeColor + '18', color: badgeColor,
                    }}>
                      {badgeText}
                    </span>
                  </div>
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', margin: 0, lineHeight: 1.5 }}>
                    {m.desc}
                  </p>
                </div>
                <span style={{ color: 'var(--c-text-faint)', fontSize: 16, flexShrink: 0, alignSelf: 'center' }}>→</span>
              </div>
            </a>
          )
        })}
      </div>

      {/* ── Profil Klinik ── */}
      <div style={{
        background: 'var(--c-surface)', border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-xl)', overflow: 'hidden',
      }}>
        <div style={{
          padding: 'var(--sp-5)', borderBottom: '1px solid var(--c-border)',
          background: 'var(--c-bg)',
        }}>
          <h2 style={{ fontWeight: 800, fontSize: 'var(--font-size-md)', color: 'var(--c-primary)', margin: 0 }}>
            Profil Klinik
          </h2>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', marginTop: 4, marginBottom: 0 }}>
            Informasi ini dipakai di template sapaan dan broadcast. Pastikan <strong>Nama RS</strong> sesuai dengan yang ingin tampil di pesan WhatsApp.
          </p>
        </div>

        <form onSubmit={handleSave} style={{ padding: 'var(--sp-5)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text)', marginBottom: 4 }}>
                Nama Klinik / Faskes *
              </label>
              <input required value={form.nama_klinik} onChange={e => setField('nama_klinik', e.target.value)}
                placeholder="cth: Rumah Sakit Meditech" style={inp} />
              <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 3 }}>Tampil di sidebar dan header sistem</div>
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text)', marginBottom: 4 }}>
                Nama RS (untuk template pesan) *
              </label>
              <input required value={form.nama_rs} onChange={e => setField('nama_rs', e.target.value)}
                placeholder="cth: RS Meditech" style={inp} />
              <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 3 }}>
                Dipakai untuk variabel <code style={{ fontFamily: 'monospace', background: 'var(--c-bg)', padding: '1px 5px', borderRadius: 3 }}>{'{{nama_rs}}'}</code> di template WhatsApp
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 'var(--sp-4)' }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text)', marginBottom: 4 }}>
              URL Logo
            </label>
            <input value={form.logo_url} onChange={e => setField('logo_url', e.target.value)}
              placeholder="https://..." style={inp} />
            <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 3 }}>
              Upload ke CDN/storage terlebih dahulu, lalu paste URL-nya di sini.
              URL ini juga digunakan sebagai <strong>icon PWA</strong> saat app di-install di HP.
            </div>
            {form.logo_url && (
              <img src={form.logo_url} alt="Preview logo"
                style={{ marginTop: 8, width: 64, height: 64, objectFit: 'contain', borderRadius: 10, border: '1px solid var(--c-border)', background: '#f8fafc', padding: 4 }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            )}
          </div>

          <div style={{ marginBottom: 'var(--sp-4)' }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text)', marginBottom: 4 }}>
              Alamat
            </label>
            <textarea value={form.alamat} onChange={e => setField('alamat', e.target.value)}
              rows={2} placeholder="Jl. ..." style={{ ...inp, resize: 'vertical' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 'var(--sp-4)', marginBottom: 'var(--sp-5)' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text)', marginBottom: 4 }}>Telepon</label>
              <input value={form.telp} onChange={e => setField('telp', e.target.value)}
                placeholder="021-xxxx" style={inp} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text)', marginBottom: 4 }}>Email</label>
              <input type="email" value={form.email} onChange={e => setField('email', e.target.value)}
                placeholder="info@klinik.com" style={inp} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text)', marginBottom: 4 }}>Website</label>
              <input value={form.website} onChange={e => setField('website', e.target.value)}
                placeholder="https://..." style={inp} />
            </div>
          </div>

          {error && (
            <div style={{
              background: '#FEF2F2', color: '#B91C1C', padding: 'var(--sp-3) var(--sp-4)',
              borderRadius: 'var(--r-sm)', fontSize: 'var(--font-size-sm)',
              marginBottom: 'var(--sp-4)', borderLeft: '3px solid #EF4444',
            }}>{error}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 'var(--sp-3)' }}>
            {saved && <span style={{ fontSize: 'var(--font-size-sm)', color: '#22C55E', fontWeight: 600 }}>✓ Tersimpan</span>}
            <button type="submit" disabled={saving} style={{
              padding: '9px 24px', borderRadius: 'var(--r-md)',
              background: saving ? '#94A3B8' : 'var(--c-secondary)',
              border: 'none', color: 'white', fontFamily: 'inherit',
              fontSize: 'var(--font-size-sm)', fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}>
              {saving ? 'Menyimpan…' : 'Simpan Profil'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
