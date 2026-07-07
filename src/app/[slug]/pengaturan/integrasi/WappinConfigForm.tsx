'use client'

import { useState } from 'react'

interface WappinData {
  api_version: string; username: string; base_url: string
  login_url: string; messages_url: string; namespace: string
  aktif: boolean; tested_at: string | null; has_password: boolean
  client_id: string; project_id: string; has_secret_key: boolean
}

interface Props { slug: string; initialData: WappinData | null }

const ERROR_CODES = [
  { code: '400', label: 'No Input Received',           cause: 'Payload kosong atau field wajib tidak dikirim',         fix: 'Periksa template_name, to, dan components tidak kosong' },
  { code: '401', label: 'Invalid Credential',           cause: 'Username/password salah atau token expired',            fix: 'Pastikan kredensial benar; token akan di-refresh otomatis' },
  { code: '404', label: 'Template Not Found/Inactive',  cause: 'Nama template tidak ada di akun Wappin atau nonaktif',  fix: 'Buka dashboard Wappin, pastikan template aktif dan nama sama persis' },
  { code: '406', label: 'Auth Not Recognized',          cause: 'Format Authorization header salah',                     fix: 'Format harus: Bearer {token}' },
  { code: '407', label: 'IP Address Not Allowed',       cause: 'IP server tidak ada di whitelist Wappin',               fix: 'Tambahkan IP server ke whitelist di dashboard Wappin' },
  { code: '601', label: 'Contact Invalid',              cause: 'Nomor HP tidak terdaftar di WhatsApp',                  fix: 'Verifikasi nomor HP pasien; status otomatis FAILED di sistem' },
]

const DELIVERY_STATUSES = [
  { status: 'sent',        label: 'SENT',      color: '#0089A8', desc: 'Pesan berhasil diterima server Wappin, menunggu delivery ke HP' },
  { status: 'delivered',   label: 'DELIVERED',  color: '#7C3AED', desc: 'Pesan sudah masuk ke HP penerima (centang dua abu-abu)' },
  { status: 'read',        label: 'READ',       color: '#22C55E', desc: 'Pesan sudah dibaca penerima (centang dua biru)' },
  { status: 'failed',      label: 'FAILED',     color: '#EF4444', desc: 'Pengiriman gagal — lihat error_code untuk penyebab' },
]

const CALLBACK_TYPES = [
  { type: 'delivery_report / message_status', desc: 'Update status pengiriman (sent → delivered → read). Sistem update kolom status, delivered_at, read_at di CampaignRecipient dan increment counter campaign.' },
  { type: 'incoming_message / inbound',       desc: 'Pesan masuk dari pasien. Sistem buat atau update Conversation di Inbox, tambah Message baru, dan cek apakah ini balasan dari campaign aktif.' },
]

export default function WappinConfigForm({ slug, initialData }: Props) {
  const [refOpen, setRefOpen] = useState(false)
  const [apiVersion,   setApiVersion]   = useState(initialData?.api_version || 'v2')
  const [username,     setUsername]     = useState(initialData?.username || '')
  const [password,     setPassword]     = useState('')
  const [baseUrl,      setBaseUrl]      = useState(initialData?.base_url || 'https://api.chat.wappin.app')
  const [loginUrl,     setLoginUrl]     = useState(initialData?.login_url || '/auth/login')
  const [messagesUrl,  setMessagesUrl]  = useState(initialData?.messages_url || '/v1/messages')
  const [namespace,    setNamespace]    = useState(initialData?.namespace || '')
  const [clientId,     setClientId]     = useState(initialData?.client_id || '')
  const [projectId,    setProjectId]    = useState(initialData?.project_id || '')
  const [secretKey,    setSecretKey]    = useState('')
  const [aktif,        setAktif]        = useState(initialData?.aktif ?? true)
  const [saving,       setSaving]       = useState(false)
  const [testing,      setTesting]      = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [error,        setError]        = useState('')
  const [testResult,   setTestResult]   = useState<{ ok: boolean; msg: string } | null>(null)
  const hasData = !!initialData

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontFamily: 'inherit',
    fontSize: 'var(--font-size-sm)', border: '1.5px solid var(--c-border)',
    borderRadius: 'var(--r-sm)', outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 700,
    color: 'var(--c-text)', marginBottom: 4,
  }
  const sectionStyle: React.CSSProperties = {
    background: 'var(--c-surface)', border: '1px solid var(--c-border)',
    borderRadius: 'var(--r-lg)', padding: 'var(--sp-5)', marginBottom: 'var(--sp-5)',
  }

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const body: any = { api_version: apiVersion, base_url: baseUrl, login_url: loginUrl, messages_url: messagesUrl, namespace, aktif }
      if (apiVersion === 'v2') { body.username = username; if (password) body.password = password }
      if (apiVersion === 'v1') { body.client_id = clientId; body.project_id = projectId; if (secretKey) body.secret_key = secretKey }

      const res  = await fetch(`/api/${slug}/pengaturan/wappin`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Gagal menyimpan'); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally { setSaving(false) }
  }

  async function handleTest() {
    setTesting(true); setTestResult(null)
    try {
      const res  = await fetch(`/api/${slug}/pengaturan/wappin`, { method: 'POST' })
      const json = await res.json()
      setTestResult({ ok: !!json.success, msg: json.message || json.error || 'Unknown' })
    } finally { setTesting(false) }
  }

  return (
    <div>
      {/* Status badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'var(--sp-5)', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer' }}>
          <input type="checkbox" checked={aktif} onChange={e => setAktif(e.target.checked)} />
          Aktifkan integrasi Wappin
        </label>
        {initialData?.tested_at && (
          <span style={{ fontSize: 11, color: '#22C55E', fontWeight: 600 }}>
            ✓ Terakhir diuji: {new Date(initialData.tested_at).toLocaleDateString('id-ID')}
          </span>
        )}
      </div>

      {/* API Version */}
      <div style={sectionStyle}>
        <div style={{ fontWeight: 700, fontSize: 'var(--font-size-md)', color: 'var(--c-primary)', marginBottom: 'var(--sp-4)' }}>
          Versi API
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {(['v2', 'v1'] as const).map(v => (
            <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 'var(--font-size-sm)', fontWeight: apiVersion === v ? 700 : 400 }}>
              <input type="radio" checked={apiVersion === v} onChange={() => setApiVersion(v)} />
              <div>
                <div>{v === 'v2' ? 'V2 — api.chat.wappin.app (Rekomendasi)' : 'V1 — api.wappin.id (Legacy)'}</div>
                <div style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>
                  {v === 'v2' ? 'Login via username/password, support template components' : 'Auth via ClientID/SecretKey, template params flat map'}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Credentials */}
      <div style={sectionStyle}>
        <div style={{ fontWeight: 700, fontSize: 'var(--font-size-md)', color: 'var(--c-primary)', marginBottom: 'var(--sp-4)' }}>
          Kredensial {apiVersion.toUpperCase()}
        </div>

        {apiVersion === 'v2' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
            <div>
              <label style={labelStyle}>Username *</label>
              <input value={username} onChange={e => setUsername(e.target.value)} placeholder="wappin username" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Password {initialData?.has_password ? '(kosongkan jika tidak diubah)' : '*'}</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={initialData?.has_password ? '••••••••' : 'wappin password'} style={inputStyle} />
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
            <div>
              <label style={labelStyle}>Client ID *</label>
              <input value={clientId} onChange={e => setClientId(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Project ID *</label>
              <input value={projectId} onChange={e => setProjectId(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Secret Key {initialData?.has_secret_key ? '(kosongkan jika tidak diubah)' : '*'}</label>
              <input type="password" value={secretKey} onChange={e => setSecretKey(e.target.value)} placeholder={initialData?.has_secret_key ? '••••••••' : 'secret key'} style={inputStyle} />
            </div>
          </div>
        )}
      </div>

      {/* Endpoint config */}
      <div style={sectionStyle}>
        <div style={{ fontWeight: 700, fontSize: 'var(--font-size-md)', color: 'var(--c-primary)', marginBottom: 'var(--sp-4)' }}>
          Konfigurasi Endpoint
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--sp-4)' }}>
          <div>
            <label style={labelStyle}>Base URL</label>
            <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
            <div>
              <label style={labelStyle}>Login URL (path)</label>
              <input value={loginUrl} onChange={e => setLoginUrl(e.target.value)} placeholder="/auth/login" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Messages URL (path)</label>
              <input value={messagesUrl} onChange={e => setMessagesUrl(e.target.value)} placeholder="/v1/messages" style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Namespace (opsional — dari akun Wappin/Meta)</label>
            <input value={namespace} onChange={e => setNamespace(e.target.value)} placeholder="xxxxxxxx_xxxx_xxxx_xxxx_xxxxxxxxxxxx" style={inputStyle} />
          </div>
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div style={{
          background:  testResult.ok ? '#F0FDF4' : '#FEF2F2',
          border:      `1px solid ${testResult.ok ? '#BBF7D0' : '#FECACA'}`,
          borderLeft:  `3px solid ${testResult.ok ? '#22C55E' : '#EF4444'}`,
          borderRadius: 'var(--r-sm)', padding: 'var(--sp-3) var(--sp-4)',
          fontSize: 'var(--font-size-sm)', marginBottom: 'var(--sp-4)',
          color: testResult.ok ? '#15803D' : '#B91C1C',
        }}>
          {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
        </div>
      )}

      {error && (
        <div style={{ background: '#FEF2F2', color: '#B91C1C', borderRadius: 'var(--r-sm)', padding: 'var(--sp-3) var(--sp-4)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--sp-4)', borderLeft: '3px solid #EF4444' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <button onClick={handleTest} disabled={testing || !hasData} style={{
          padding: '10px 20px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--c-border)',
          background: 'var(--c-bg)', fontFamily: 'inherit', fontSize: 'var(--font-size-sm)',
          cursor: (testing || !hasData) ? 'not-allowed' : 'pointer', opacity: !hasData ? 0.5 : 1,
        }}>
          {testing ? 'Menguji...' : 'Test Koneksi'}
        </button>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
          {saved && <span style={{ fontSize: 'var(--font-size-sm)', color: '#22C55E', fontWeight: 600 }}>✓ Tersimpan</span>}
          <button onClick={handleSave} disabled={saving} style={{
            padding: '10px 24px', borderRadius: 'var(--r-md)',
            background: saving ? '#94A3B8' : 'var(--c-secondary)',
            border: 'none', color: 'white', fontFamily: 'inherit',
            fontSize: 'var(--font-size-sm)', fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}>
            {saving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
          </button>
        </div>
      </div>

      {/* ── Referensi Teknis (accordion) ── */}
      <div style={{ marginTop: 'var(--sp-6)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
        <button
          onClick={() => setRefOpen(o => !o)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: 'var(--sp-4) var(--sp-5)', background: 'var(--c-bg)',
            border: 'none', borderBottom: refOpen ? '1px solid var(--c-border)' : 'none',
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--c-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🔧</span> Referensi Teknis — Webhook & Error Codes
          </span>
          <span style={{ fontSize: 18, color: 'var(--c-text-faint)', transform: refOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
            ↓
          </span>
        </button>

        {refOpen && (
          <div style={{ padding: 'var(--sp-5)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>

            {/* Callback Types */}
            <div>
              <div style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Jenis Callback (callback_type) dari Wappin
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {CALLBACK_TYPES.map(c => (
                  <div key={c.type} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, alignItems: 'flex-start' }}>
                    <code style={{ fontSize: 11, background: '#EFF6FF', color: '#1D4ED8', padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {c.type}
                    </code>
                    <span style={{ fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.5 }}>{c.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Status Delivery */}
            <div>
              <div style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Status Delivery Report (status_messages)
              </div>
              <div style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--c-bg)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--c-text-faint)', fontSize: 11, textTransform: 'uppercase' }}>Nilai dari Wappin</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--c-text-faint)', fontSize: 11, textTransform: 'uppercase' }}>Status di Sistem</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--c-text-faint)', fontSize: 11, textTransform: 'uppercase' }}>Arti</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DELIVERY_STATUSES.map((s, i) => (
                      <tr key={s.status} style={{ borderTop: i > 0 ? '1px solid var(--c-border)' : 'none' }}>
                        <td style={{ padding: '8px 12px' }}>
                          <code style={{ fontSize: 11, color: '#64748B' }}>{s.status}</code>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: s.color + '18', color: s.color }}>
                            {s.label}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', color: 'var(--c-text-muted)' }}>{s.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Error Codes */}
            <div>
              <div style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Kode Error Wappin & Cara Penanganan
              </div>
              <div style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--c-bg)' }}>
                      {['Kode', 'Label', 'Penyebab', 'Penanganan'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--c-text-faint)', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ERROR_CODES.map((e, i) => (
                      <tr key={e.code} style={{ borderTop: i > 0 ? '1px solid var(--c-border)' : 'none' }}>
                        <td style={{ padding: '8px 12px' }}>
                          <code style={{ fontSize: 11, fontWeight: 700, color: '#EF4444' }}>{e.code}</code>
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--c-text)', whiteSpace: 'nowrap' }}>{e.label}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--c-text-muted)' }}>{e.cause}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--c-text-muted)' }}>{e.fix}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 8, marginBottom: 0 }}>
                Error code 601 (Contact Invalid) adalah yang paling umum — artinya nomor HP pasien tidak punya akun WhatsApp aktif. Status campaign recipient akan otomatis menjadi FAILED dengan error_code "601".
              </p>
            </div>

            {/* Payload referensi */}
            <div>
              <div style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Contoh Payload Callback dari Wappin
              </div>
              <pre style={{
                background: '#0F172A', color: '#E2E8F0', borderRadius: 'var(--r-md)',
                padding: 'var(--sp-4)', fontSize: 11, lineHeight: 1.7,
                overflowX: 'auto', margin: 0,
              }}>{`{
  "message_id":      "wamid.xxx...",       // kunci korelasi — dicocokkan dgn wappin_message_id
  "callback_type":   "delivery_report",    // atau "incoming_message"
  "status_messages": "delivered",          // sent | delivered | read | failed
  "sender_number":   "6281234567890",      // nomor HP pasien
  "message_content": "Terima kasih dok",   // isi pesan (untuk incoming_message)
  "timestamp":       "2026-07-04T10:30:00+07:00",
  "client_id":       "...",
  "project_id":      "..."
}`}</pre>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
