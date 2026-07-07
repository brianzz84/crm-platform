'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Jenis = 'ULTAH' | 'HARI_RAYA' | 'KONTROL_REMINDER'

interface ConfigData {
  aktif:     boolean
  template:  string
  jam_kirim: number
}

interface Props {
  slug:           string
  wappinAktif:    boolean
  initialConfigs: Record<Jenis, ConfigData | null>
  statsMap:       Record<string, Record<string, number>>
}

const JENIS_META: Record<Jenis, {
  icon: string; label: string; desc: string
  accent: string; placeholderTemplate: string; varsAvail: string[]
}> = {
  ULTAH: {
    icon:  '🎂',
    label: 'Ucapan Ulang Tahun',
    desc:  'Dikirim otomatis setiap hari ke pasien yang berulang tahun hari itu.',
    accent: '#E8A800',
    placeholderTemplate:
`Halo {{nama}} 🎂

Kami dari {{nama_rs}} mengucapkan Selamat Ulang Tahun! Semoga selalu diberikan kesehatan dan kebahagiaan.

Jangan lupa jaga kesehatan ya 🏥`,
    varsAvail: ['{{nama}}', '{{hari_ini}}', '{{nama_rs}}'],
  },
  HARI_RAYA: {
    icon:  '🌙',
    label: 'Ucapan Hari Raya',
    desc:  'Dikirim pada hari raya yang dikonfigurasi. Admin menentukan tanggal pengiriman secara manual.',
    accent: '#7C3AED',
    placeholderTemplate:
`Assalamu'alaikum {{nama}} 🌙

Tim {{nama_rs}} mengucapkan Selamat {{hari_raya}}. Mohon maaf lahir dan batin.

Semoga senantiasa diberi kesehatan 🙏`,
    varsAvail: ['{{nama}}', '{{hari_raya}}', '{{nama_rs}}'],
  },
  KONTROL_REMINDER: {
    icon:  '📅',
    label: 'Pengingat Kontrol',
    desc:  'Dikirim H-3 dan H-1 sebelum jadwal kontrol pasien berdasarkan data jadwal dari SIMRS.',
    accent: '#0089A8',
    placeholderTemplate:
`Halo {{nama}} 👋

Mengingatkan jadwal kontrol Anda:
📅 {{tanggal_kontrol}}
🏥 {{poli}}
👨‍⚕️ {{dokter}}

Harap datang 15 menit sebelum jadwal — {{nama_rs}}`,
    varsAvail: ['{{nama}}', '{{tanggal_kontrol}}', '{{poli}}', '{{dokter}}', '{{nama_rs}}'],
  },
}

const JAM_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${String(i).padStart(2, '0')}:00 WIB`,
}))

function SapaanCard({
  slug, jenis, wappinAktif, initialConfig, stats,
}: {
  slug: string; jenis: Jenis; wappinAktif: boolean
  initialConfig: ConfigData | null; stats: Record<string, number>
}) {
  const meta   = JENIS_META[jenis]
  const router = useRouter()

  const [aktif,      setAktif]     = useState(initialConfig?.aktif     ?? false)
  const [template,   setTemplate]  = useState(initialConfig?.template  ?? meta.placeholderTemplate)
  const [jamKirim,   setJamKirim]  = useState(initialConfig?.jam_kirim ?? 7)
  const [preview,    setPreview]   = useState<string | null>(null)
  const [loadingPv,  setLoadingPv] = useState(false)
  const [saving,     setSaving]    = useState(false)
  const [saved,      setSaved]     = useState(false)
  const [error,      setError]     = useState('')
  const [expanded,   setExpanded]  = useState(false)
  const [showLog,    setShowLog]   = useState(false)
  const [logs,       setLogs]      = useState<any[]>([])
  const [loadingLog, setLoadingLog]= useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const sent30   = stats['SENT']   || 0
  const failed30 = stats['FAILED'] || 0
  const total30  = sent30 + failed30

  useEffect(() => {
    clearTimeout(debounceRef.current)
    setPreview(null)
    if (!template.trim()) return
    debounceRef.current = setTimeout(async () => {
      setLoadingPv(true)
      try {
        const res  = await fetch(`/api/${slug}/sapaan/preview`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body:   JSON.stringify({ template, jenis }),
        })
        const json = await res.json()
        if (json.success) setPreview(json.preview)
      } finally { setLoadingPv(false) }
    }, 700)
    return () => clearTimeout(debounceRef.current)
  }, [template, jenis, slug])

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const res  = await fetch(`/api/${slug}/sapaan`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ jenis, aktif, template, jam_kirim: jamKirim }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Gagal menyimpan'); return }
      setSaved(true); setTimeout(() => setSaved(false), 3000)
      router.refresh()  // invalidate cache server component agar reload dari DB
    } finally { setSaving(false) }
  }

  async function loadLog() {
    if (showLog) { setShowLog(false); return }
    setShowLog(true); setLoadingLog(true)
    try {
      const res  = await fetch(`/api/${slug}/sapaan/log?jenis=${jenis}&page=1`)
      const json = await res.json()
      setLogs(json.data || [])
    } finally { setLoadingLog(false) }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontFamily: 'inherit',
    fontSize: 'var(--font-size-sm)', border: '1.5px solid var(--c-border)',
    borderRadius: 'var(--r-sm)', background: 'var(--c-bg)', color: 'var(--c-text)',
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{
      background: 'var(--c-surface)', border: '1px solid var(--c-border)',
      borderRadius: 'var(--r-xl)', overflow: 'hidden',
    }}>
      {/* Header — selalu tampil, klik untuk expand */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
          padding: 'var(--sp-5)', cursor: 'pointer',
          borderLeft: `4px solid ${meta.accent}`,
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 26, flexShrink: 0, lineHeight: 1 }}>{meta.icon}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 'var(--font-size-md)', color: 'var(--c-primary)' }}>
              {meta.label}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99,
              background: aktif ? meta.accent + '1A' : '#F1F5F9',
              color:      aktif ? meta.accent         : '#94A3B8',
            }}>
              {aktif ? 'Aktif' : 'Nonaktif'}
            </span>
          </div>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', margin: '3px 0 0' }}>
            {meta.desc}
          </p>
        </div>

        {total30 > 0 && (
          <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 'var(--font-size-lg)', color: '#22C55E', lineHeight: 1 }}>{sent30}</div>
              <div style={{ fontSize: 10, color: 'var(--c-text-faint)', marginTop: 2 }}>terkirim/30h</div>
            </div>
            {failed30 > 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: 'var(--font-size-lg)', color: '#EF4444', lineHeight: 1 }}>{failed30}</div>
                <div style={{ fontSize: 10, color: 'var(--c-text-faint)', marginTop: 2 }}>gagal</div>
              </div>
            )}
          </div>
        )}

        <span style={{ color: 'var(--c-text-faint)', fontSize: 12, flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Body — expandable */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--c-border)' }}>

          {/* KONTROL_REMINDER: banner pending SIMRS */}
          {jenis === 'KONTROL_REMINDER' && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '14px var(--sp-5)',
              background: '#FFF7ED', borderBottom: '1px solid #FED7AA',
            }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>⏳</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: '#92400E' }}>
                  Fitur ini menunggu integrasi SIMRS
                </div>
                <div style={{ fontSize: 12, color: '#B45309', marginTop: 3 }}>
                  Pengingat kontrol H-3 / H-1 membutuhkan data <strong>jadwal kontrol</strong> dari SIMRS
                  — bukan dari riwayat kunjungan. Konfigurasi template bisa disimpan sekarang, tetapi
                  pesan belum akan dikirim sampai integrasi SIMRS selesai.
                </div>
              </div>
            </div>
          )}

          {/* Toggle aktif */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: 'var(--sp-4) var(--sp-5)',
            background: 'var(--c-bg)', borderBottom: '1px solid var(--c-border)',
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--c-text)' }}>
                Aktifkan pengiriman otomatis
              </div>
              <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 2 }}>
                {aktif
                  ? 'Sapaan akan dikirim sesuai jadwal yang ditentukan'
                  : 'Tidak akan dikirim meski ada pasien yang memenuhi syarat'}
              </div>
            </div>
            <div
              onClick={() => setAktif(a => !a)}
              style={{
                width: 48, height: 26, borderRadius: 99, cursor: 'pointer', flexShrink: 0,
                background: aktif ? meta.accent : '#CBD5E1',
                position: 'relative', transition: 'background 0.2s',
              }}
            >
              <div style={{
                position: 'absolute', width: 20, height: 20, borderRadius: '50%',
                background: 'white', top: 3, left: aktif ? 25 : 3,
                transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              }} />
            </div>
          </div>

          <div style={{ padding: 'var(--sp-5)' }}>
            {/* Jam kirim */}
            <div style={{ marginBottom: 'var(--sp-5)' }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text)', marginBottom: 4 }}>
                Jam Kirim
              </label>
              <select value={jamKirim} onChange={e => setJamKirim(parseInt(e.target.value))}
                style={{ ...inp, maxWidth: 200 }}>
                {JAM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 4 }}>
                {jenis === 'KONTROL_REMINDER'
                  ? 'Dikirim H-3 dan H-1 sebelum jadwal kontrol pada jam ini'
                  : 'Sistem scan dan kirim pada jam ini setiap hari'}
              </div>
            </div>

            {/* Template + Preview */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 'var(--sp-5)', marginBottom: 'var(--sp-5)' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text)', marginBottom: 4 }}>
                  Template Pesan *
                </label>
                <textarea
                  value={template}
                  onChange={e => setTemplate(e.target.value)}
                  rows={10}
                  style={{ ...inp, resize: 'vertical', lineHeight: 1.65 }}
                />
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    Klik variabel untuk sisipkan
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {meta.varsAvail.map(v => (
                      <button key={v} type="button"
                        onClick={() => setTemplate(t => t + v)}
                        style={{
                          padding: '3px 10px', borderRadius: 99, fontSize: 11, cursor: 'pointer',
                          fontFamily: 'monospace', fontWeight: 600,
                          background: meta.accent + '18', border: `1px solid ${meta.accent}40`,
                          color: meta.accent,
                        }}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text)', marginBottom: 8 }}>
                  Preview (data contoh)
                </div>
                <div style={{
                  background: '#ECF7EA', borderRadius: 'var(--r-lg)',
                  padding: 'var(--sp-4)', minHeight: 240, position: 'relative',
                }}>
                  <div style={{
                    background: 'white', borderRadius: '0 12px 12px 12px',
                    padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: '#111',
                  }}>
                    {loadingPv
                      ? <span style={{ color: '#94A3B8', fontStyle: 'italic', fontSize: 12 }}>Memuat preview…</span>
                      : preview
                        ? <>{preview}<div style={{ fontSize: 10, color: '#94A3B8', textAlign: 'right', marginTop: 4 }}>
                            {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} ✓✓
                          </div></>
                        : <span style={{ color: '#94A3B8', fontStyle: 'italic', fontSize: 12 }}>Ketik template untuk melihat preview</span>
                    }
                  </div>
                  <div style={{ position: 'absolute', bottom: 8, right: 12, fontSize: 10, color: '#94A3B8' }}>
                    WhatsApp preview
                  </div>
                </div>

                {total30 > 0 && (
                  <div style={{
                    marginTop: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)',
                    background: 'var(--c-bg)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-faint)', textTransform: 'uppercase', marginBottom: 8 }}>
                      30 hari terakhir
                    </div>
                    <div style={{ display: 'flex', gap: 20 }}>
                      {[
                        { label: 'Terkirim', val: sent30, color: '#22C55E' },
                        ...(failed30 ? [{ label: 'Gagal', val: failed30, color: '#EF4444' }] : []),
                        { label: 'Sukses', val: `${total30 ? Math.round(sent30 / total30 * 100) : 0}%`, color: 'var(--c-text)' },
                      ].map(s => (
                        <div key={s.label}>
                          <div style={{ fontWeight: 800, fontSize: 'var(--font-size-xl)', color: s.color, lineHeight: 1 }}>{s.val}</div>
                          <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 2 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div style={{
                background: '#FEF2F2', color: '#B91C1C', padding: 'var(--sp-3) var(--sp-4)',
                borderRadius: 'var(--r-sm)', fontSize: 'var(--font-size-sm)',
                marginBottom: 'var(--sp-4)', borderLeft: '3px solid #EF4444',
              }}>{error}</div>
            )}

            {/* Footer */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              paddingTop: 'var(--sp-4)', borderTop: '1px solid var(--c-border)', flexWrap: 'wrap', gap: 'var(--sp-3)',
            }}>
              <button onClick={loadLog} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', fontFamily: 'inherit',
              }}>
                {showLog ? '▲ Sembunyikan riwayat' : '▼ Lihat riwayat kirim'}
              </button>

              <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
                {!wappinAktif && (
                  <span style={{ fontSize: 12, color: '#F59E0B', fontWeight: 600 }}>
                    ⚠ Wappin belum aktif
                  </span>
                )}
                {saved && (
                  <span style={{ fontSize: 'var(--font-size-sm)', color: '#22C55E', fontWeight: 600 }}>✓ Tersimpan</span>
                )}
                <button onClick={handleSave} disabled={saving} style={{
                  padding: '9px 24px', borderRadius: 'var(--r-md)',
                  background: saving ? '#94A3B8' : 'var(--c-secondary)',
                  border: 'none', color: 'white', fontFamily: 'inherit',
                  fontSize: 'var(--font-size-sm)', fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}>
                  {saving ? 'Menyimpan…' : 'Simpan'}
                </button>
              </div>
            </div>

            {/* Riwayat kirim */}
            {showLog && (
              <div style={{ marginTop: 'var(--sp-4)', borderTop: '1px solid var(--c-border)', paddingTop: 'var(--sp-4)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                  Riwayat Kirim Terakhir
                </div>
                {loadingLog ? (
                  <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>Memuat…</div>
                ) : logs.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>Belum ada riwayat kirim.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        {['Nama', 'No HP', 'Status', 'Tanggal'].map(h => (
                          <th key={h} style={{
                            padding: '6px 10px', textAlign: 'left', fontWeight: 700,
                            color: 'var(--c-text-faint)', fontSize: 11,
                            borderBottom: '1px solid var(--c-border)',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((l, i) => (
                        <tr key={l.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--c-bg)' }}>
                          <td style={{ padding: '7px 10px', fontWeight: 600, color: 'var(--c-text)', borderBottom: '1px solid var(--c-border)' }}>{l.person_name}</td>
                          <td style={{ padding: '7px 10px', color: 'var(--c-text-muted)', fontFamily: 'monospace', borderBottom: '1px solid var(--c-border)' }}>{l.person_hp}</td>
                          <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--c-border)' }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700,
                              background: l.status === 'SENT' ? '#F0FDF4' : '#FEF2F2',
                              color:      l.status === 'SENT' ? '#22C55E' : '#EF4444',
                            }}>{l.status}</span>
                          </td>
                          <td style={{ padding: '7px 10px', color: 'var(--c-text-faint)', borderBottom: '1px solid var(--c-border)' }}>
                            {new Date(l.sent_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function SapaanClient({ slug, wappinAktif, initialConfigs, statsMap }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      {(['ULTAH', 'HARI_RAYA', 'KONTROL_REMINDER'] as Jenis[]).map(jenis => (
        <SapaanCard
          key={jenis}
          slug={slug}
          jenis={jenis}
          wappinAktif={wappinAktif}
          initialConfig={initialConfigs[jenis]}
          stats={statsMap[jenis] ?? {}}
        />
      ))}
    </div>
  )
}
