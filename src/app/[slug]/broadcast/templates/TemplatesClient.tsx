'use client'

import { useState } from 'react'

interface ComponentParam {
  param_key: string
  example:   string
}

interface Component {
  type:        'header' | 'body' | 'footer' | 'button'
  format?:     'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
  sub_type?:   string
  text?:       string
  media_url?:  string
  index?:      number
  parameters:  ComponentParam[]
}

type MetaStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | null

interface Template {
  id:                 string
  nama:               string
  template_name:      string
  template_language:  string
  meta_category:      string | null
  meta_status:        MetaStatus
  meta_template_id:   string | null
  components_schema:  Component[]
  preview_text:       string
  aktif:              boolean
  created_at:         string
  campaign_count:     number
}

interface Props {
  slug:             string
  initialTemplates: Template[]
}

const LANG_OPTIONS = [
  { value: 'id',    label: 'Bahasa Indonesia' },
  { value: 'en',    label: 'English' },
  { value: 'en_US', label: 'English (US)' },
]

const COMP_TYPES: Array<{ value: Component['type']; label: string; desc: string }> = [
  { value: 'header', label: 'Header',  desc: 'Teks di bagian atas pesan' },
  { value: 'body',   label: 'Body',    desc: 'Isi utama pesan (wajib)' },
  { value: 'button', label: 'Button',  desc: 'Tombol quick reply atau URL' },
]

function EmptyState({ onAdd, onSync, syncing }: { onAdd: () => void; onSync: () => void; syncing: boolean }) {
  return (
    <div style={{ textAlign: 'center', padding: 'var(--sp-6) var(--sp-4)', color: 'var(--c-text-muted)' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
      <h3 style={{ fontWeight: 700, color: 'var(--c-text)', marginBottom: 8 }}>Belum ada template</h3>
      <p style={{ fontSize: 'var(--font-size-sm)', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
        Buat template pertama langsung dari CRM, atau sync jika sudah ada template approved di Meta.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={onAdd} style={{
          padding: '10px 24px', background: 'var(--c-secondary)', color: 'white',
          border: 'none', borderRadius: 'var(--r-md)', fontFamily: 'inherit',
          fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer',
        }}>
          + Buat Template Baru
        </button>
        <button onClick={onSync} disabled={syncing} style={{
          padding: '10px 24px', background: 'var(--c-bg)', color: 'var(--c-text)',
          border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-md)', fontFamily: 'inherit',
          fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer',
        }}>
          {syncing ? '⏳ Sync…' : '🔄 Sync dari Meta'}
        </button>
      </div>
    </div>
  )
}

function ComponentEditor({
  components, onChange,
}: { components: Component[]; onChange: (c: Component[]) => void }) {
  const usedTypes = new Set(components.map(c => c.type))
  const allTypes: Component['type'][] = ['header', 'body', 'footer', 'button']
  const availableTypes = allTypes.filter(t => !usedTypes.has(t))

  function addComp() {
    if (availableTypes.length === 0) return
    onChange([...components, { type: availableTypes[0], parameters: [] }])
  }
  function removeComp(i: number) {
    onChange(components.filter((_, idx) => idx !== i))
  }
  function updateComp(i: number, patch: Partial<Component>) {
    onChange(components.map((c, idx) => idx === i ? { ...c, ...patch } : c))
  }
  function addParam(ci: number) {
    const c = components[ci]
    updateComp(ci, { parameters: [...c.parameters, { param_key: '', example: '' }] })
  }
  function removeParam(ci: number, pi: number) {
    const c = components[ci]
    updateComp(ci, { parameters: c.parameters.filter((_, idx) => idx !== pi) })
  }
  function updateParam(ci: number, pi: number, patch: Partial<ComponentParam>) {
    const c = components[ci]
    updateComp(ci, {
      parameters: c.parameters.map((p, idx) => idx === pi ? { ...p, ...patch } : p),
    })
  }

  const inp: React.CSSProperties = {
    padding: '7px 10px', border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-sm)',
    fontSize: 'var(--font-size-xs)', fontFamily: 'inherit', background: 'var(--c-bg)',
    color: 'var(--c-text)', outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--c-text)' }}>
          Struktur Pesan
        </label>
        <button type="button" onClick={addComp} disabled={availableTypes.length === 0} style={{
          fontSize: 11, padding: '4px 10px', border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-sm)', background: 'var(--c-bg)', cursor: availableTypes.length === 0 ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', color: availableTypes.length === 0 ? 'var(--c-text-faint)' : 'var(--c-text)',
        }}>
          + Component
        </button>
      </div>

      {components.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--c-text-faint)', padding: '8px 0' }}>
          Minimal satu component Body diperlukan. Header dan Footer bersifat opsional.
        </div>
      )}

      {components.map((comp, ci) => (
        <div key={ci} style={{
          border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)',
          padding: 'var(--sp-3)', marginBottom: 8,
          background: comp.type === 'body' ? 'var(--c-bg)' : 'var(--c-surface)',
        }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <select value={comp.type} onChange={e => updateComp(ci, { type: e.target.value as any })}
              style={{ ...inp, width: 100, flexShrink: 0 }}>
              {COMP_TYPES.map(t => (
                <option key={t.value} value={t.value}
                  disabled={t.value !== comp.type && usedTypes.has(t.value)}>
                  {t.label}
                </option>
              ))}
            </select>
            {comp.type === 'button' && (
              <input placeholder="sub_type (e.g. quick_reply)" value={comp.sub_type ?? ''}
                onChange={e => updateComp(ci, { sub_type: e.target.value })}
                style={{ ...inp, flex: 1 }} />
            )}
            {comp.type === 'button' && (
              <input placeholder="index (0, 1, 2...)" type="number" value={comp.index ?? 0}
                onChange={e => updateComp(ci, { index: parseInt(e.target.value) || 0 })}
                style={{ ...inp, width: 80, flexShrink: 0 }} />
            )}
            <button type="button" onClick={() => removeComp(ci)} style={{
              marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
              color: '#EF4444', fontSize: 16, flexShrink: 0, lineHeight: 1,
            }}>×</button>
          </div>

          {comp.type === 'header' && (
            <div style={{ marginBottom: 8 }}>
              <select
                value={comp.format ?? 'TEXT'}
                onChange={e => updateComp(ci, { format: e.target.value as any, text: '', media_url: '' })}
                style={{ ...inp, marginBottom: 6 }}
              >
                <option value="TEXT">Teks</option>
                <option value="IMAGE">Gambar (IMAGE)</option>
                <option value="VIDEO">Video (VIDEO)</option>
                <option value="DOCUMENT">Dokumen (DOCUMENT)</option>
              </select>
              {(!comp.format || comp.format === 'TEXT') ? (
                <input placeholder="Teks header" value={comp.text ?? ''}
                  onChange={e => updateComp(ci, { text: e.target.value })}
                  style={inp} />
              ) : (
                <input placeholder={`URL ${comp.format === 'IMAGE' ? 'gambar' : comp.format === 'VIDEO' ? 'video' : 'dokumen'} (https://...)`}
                  value={comp.media_url ?? ''}
                  onChange={e => updateComp(ci, { media_url: e.target.value })}
                  style={inp} />
              )}
            </div>
          )}

          {comp.type === 'body' && (
            <textarea
              placeholder={'Isi pesan (gunakan {{1}} {{2}} untuk variabel)\n\nContoh:\nHalo {{1}}, terima kasih telah bergabung!'}
              value={comp.text ?? ''}
              onChange={e => updateComp(ci, { text: e.target.value })}
              rows={6}
              style={{ ...inp, marginBottom: 8, resize: 'vertical', lineHeight: 1.6 }}
            />
          )}

          {/* Parameters */}
          <div style={{ paddingLeft: 8, borderLeft: '2px solid var(--c-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>Parameters ({comp.parameters.length})</span>
              <button type="button" onClick={() => addParam(ci)} style={{
                fontSize: 11, padding: '2px 8px', border: '1px solid var(--c-border)',
                borderRadius: 'var(--r-sm)', background: 'white', cursor: 'pointer', fontFamily: 'inherit',
              }}>+ param</button>
            </div>
            {comp.parameters.map((p, pi) => (
              <div key={pi} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                <input placeholder="param_key (e.g. nama)" value={p.param_key}
                  onChange={e => updateParam(ci, pi, { param_key: e.target.value })}
                  style={{ ...inp, flex: 1, fontFamily: 'monospace', fontSize: 11 }} />
                <input placeholder="contoh nilai" value={p.example}
                  onChange={e => updateParam(ci, pi, { example: e.target.value })}
                  style={{ ...inp, flex: 1, fontSize: 11 }} />
                <button type="button" onClick={() => removeParam(ci, pi)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 14, flexShrink: 0,
                }}>×</button>
              </div>
            ))}
            {comp.parameters.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--c-text-faint)', fontStyle: 'italic' }}>Tidak ada parameter variabel</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

const CATEGORY_OPTIONS = [
  { value: 'MARKETING',      label: 'Marketing',       desc: 'Promo, broadcast umum, ucapan' },
  { value: 'UTILITY',        label: 'Utility',         desc: 'Reminder, konfirmasi, notifikasi' },
  { value: 'AUTHENTICATION', label: 'Authentication',  desc: 'OTP, verifikasi' },
]

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  APPROVED: { label: 'Approved',  bg: '#F0FDF4', color: '#16A34A' },
  PENDING:  { label: 'Pending',   bg: '#FFFBEB', color: '#D97706' },
  REJECTED: { label: 'Rejected',  bg: '#FEF2F2', color: '#DC2626' },
  PAUSED:   { label: 'Paused',    bg: '#F1F5F9', color: '#64748B' },
}

function TemplateModal({
  slug, template, onClose, onSaved,
}: {
  slug: string; template: Template | null; onClose: () => void; onSaved: (t: Template) => void
}) {
  const isEdit = !!template

  const [nama,       setNama]   = useState(template?.nama               ?? '')
  const [tmplName,   setTmplName] = useState(template?.template_name    ?? '')
  const [lang,       setLang]   = useState(template?.template_language  ?? 'id')
  const [category,   setCategory] = useState<string>(template?.meta_category ?? 'MARKETING')
  const [components, setComps]  = useState<Component[]>(template?.components_schema ?? [
    { type: 'header', text: '', parameters: [] },
    { type: 'body',   text: '', parameters: [] },
    { type: 'footer', text: '', parameters: [] },
  ])
  const [previewText, setPv]    = useState(template?.preview_text ?? '')
  const [saving,      setSaving] = useState(false)
  const [submitting,  setSubmitting] = useState(false)
  const [error,       setError]  = useState('')
  const [metaResult,  setMetaResult] = useState<string>('')

  // Auto-generate template_name dari nama
  function handleNamaChange(val: string) {
    setNama(val)
    if (!isEdit) setTmplName(val.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))
  }

  async function save(submitToMeta: boolean) {
    submitToMeta ? setSubmitting(true) : setSaving(true)
    setError(''); setMetaResult('')
    try {
      const url    = isEdit ? `/api/${slug}/broadcast/templates/${template!.id}` : `/api/${slug}/broadcast/templates`
      const method = isEdit ? 'PUT' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama, template_name: tmplName, template_language: lang,
          meta_category: category, components_schema: components,
          preview_text: previewText, submit_to_meta: submitToMeta,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(typeof json.error === 'string' ? json.error : JSON.stringify(json.error)); return }
      if (submitToMeta && json.meta_status) {
        setMetaResult(json.meta_status === 'APPROVED'
          ? '✅ Langsung disetujui Meta!'
          : `⏳ Tersubmit ke Meta — status: ${json.meta_status}. Tunggu review Meta.`)
        setTimeout(() => onSaved(json.data), 1500)
      } else {
        onSaved(json.data)
      }
    } finally { setSaving(false); setSubmitting(false) }
  }

  async function handleSubmit(e: React.FormEvent) { e.preventDefault(); await save(false) }

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', border: '1.5px solid var(--c-border)',
    borderRadius: 'var(--r-sm)', fontSize: 'var(--font-size-sm)', fontFamily: 'inherit',
    background: 'var(--c-bg)', color: 'var(--c-text)', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start',
      justifyContent: 'center', padding: '40px 16px', overflowY: 'auto',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--c-surface)', borderRadius: 'var(--r-xl)',
        width: '100%', maxWidth: 680, boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}>
        {/* Modal header */}
        <div style={{
          padding: 'var(--sp-5)', borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontWeight: 800, fontSize: 'var(--font-size-lg)', color: 'var(--c-primary)', margin: 0 }}>
              {isEdit ? 'Edit Template' : 'Tambah Template'}
            </h2>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-faint)', margin: '4px 0 0' }}>
              Template harus sesuai dengan yang sudah disetujui di Meta Business Suite
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 22, cursor: 'pointer',
            color: 'var(--c-text-muted)', lineHeight: 1,
          }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 'var(--sp-5)' }}>
          {/* Identitas */}
          <div style={{
            background: 'var(--c-bg)', border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', marginBottom: 'var(--sp-4)',
          }}>
            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text-faint)', textTransform: 'uppercase', marginBottom: 'var(--sp-3)' }}>
              Identitas Template
            </div>

            {/* Nama & Bahasa */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--c-text)', marginBottom: 4 }}>
                  Nama Lokal (UI) *
                </label>
                <input required value={nama} onChange={e => handleNamaChange(e.target.value)}
                  placeholder="cth: Ucapan Ulang Tahun" style={inp} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--c-text)', marginBottom: 4 }}>
                  Bahasa
                </label>
                <select value={lang} onChange={e => setLang(e.target.value)} style={inp}>
                  {LANG_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            {/* template_name & Kategori */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--c-text)', marginBottom: 4 }}>
                  Nama Template (Meta) *
                </label>
                <input required value={tmplName} onChange={e => setTmplName(e.target.value)}
                  placeholder="ucapan_ulang_tahun" style={{ ...inp, fontFamily: 'monospace' }} />
                <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 3 }}>
                  Huruf kecil, angka, underscore — otomatis dari nama
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--c-text)', marginBottom: 4 }}>
                  Kategori Meta *
                </label>
                <select value={category} onChange={e => setCategory(e.target.value)} style={inp}>
                  {CATEGORY_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label} — {o.desc}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Konten Template */}
          <div style={{
            background: 'var(--c-bg)', border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', marginBottom: 'var(--sp-4)',
          }}>
            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text-faint)', textTransform: 'uppercase', marginBottom: 'var(--sp-3)' }}>
              Konten Pesan
            </div>
            <ComponentEditor components={components} onChange={setComps} />
            <div style={{ marginTop: 8, padding: 'var(--sp-3)', background: '#EFF9FB', borderRadius: 'var(--r-sm)', fontSize: 11, color: '#0089A8' }}>
              <strong>Tip:</strong> Gunakan <code>{'{{1}}'}</code> <code>{'{{2}}'}</code> dst di teks, lalu tambahkan param dengan nama dan contoh nilainya. Contoh nilai wajib diisi agar Meta bisa mereview template.
            </div>
          </div>

          {/* Preview text */}
          <div style={{ marginBottom: 'var(--sp-4)' }}>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--c-text)', marginBottom: 4 }}>
              Catatan Internal (opsional)
            </label>
            <textarea value={previewText} onChange={e => setPv(e.target.value)}
              rows={2} placeholder="Keterangan penggunaan template ini..."
              style={{ ...inp, resize: 'vertical' }} />
          </div>

          {error && (
            <div style={{
              background: '#FEF2F2', color: '#B91C1C', padding: 'var(--sp-3) var(--sp-4)',
              borderRadius: 'var(--r-sm)', fontSize: 'var(--font-size-sm)',
              marginBottom: 'var(--sp-4)', borderLeft: '3px solid #EF4444',
            }}>
              {error}
            </div>
          )}

          {metaResult && (
            <div style={{
              background: '#F0FDF4', color: '#15803D', padding: 'var(--sp-3) var(--sp-4)',
              borderRadius: 'var(--r-sm)', fontSize: 'var(--font-size-sm)',
              marginBottom: 'var(--sp-4)', borderLeft: '3px solid #22C55E',
            }}>
              {metaResult}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <button type="button" onClick={onClose} style={{
              padding: '9px 20px', border: '1.5px solid var(--c-border)',
              borderRadius: 'var(--r-md)', background: 'var(--c-bg)',
              fontFamily: 'inherit', fontSize: 'var(--font-size-sm)', cursor: 'pointer',
              color: 'var(--c-text)',
            }}>
              Batal
            </button>
            {(!isEdit || !template?.meta_status) && (
              <button type="button" onClick={() => save(true)} disabled={submitting || saving} style={{
                padding: '9px 20px', border: 'none', borderRadius: 'var(--r-md)',
                background: submitting ? '#94A3B8' : '#0EA5E9', color: 'white',
                fontFamily: 'inherit', fontSize: 'var(--font-size-sm)', fontWeight: 700,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}>
                {submitting ? '⏳ Mengirim ke Meta…' : '🚀 Submit ke Meta'}
              </button>
            )}
            <button type="submit" disabled={saving || submitting} style={{
              padding: '9px 24px', background: saving ? '#94A3B8' : 'var(--c-secondary)',
              border: 'none', borderRadius: 'var(--r-md)', color: 'white',
              fontFamily: 'inherit', fontSize: 'var(--font-size-sm)', fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}>
              {saving ? 'Menyimpan…' : isEdit ? 'Simpan Perubahan' : 'Simpan Draft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TemplateCard({
  template, onEdit, onToggle, onDelete,
}: {
  template: Template
  onEdit:   () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const compCounts = template.components_schema.reduce<Record<string, number>>((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1
    return acc
  }, {})

  const allParams = template.components_schema.flatMap(c => c.parameters.map(p => p.param_key)).filter(Boolean)

  return (
    <div style={{
      background: 'var(--c-surface)', border: `1px solid ${template.aktif ? 'var(--c-border)' : '#E2E8F0'}`,
      borderRadius: 'var(--r-lg)', padding: 'var(--sp-4)',
      opacity: template.aktif ? 1 : 0.6,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 'var(--sp-3)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 'var(--font-size-md)', color: 'var(--c-primary)' }}>
              {template.nama}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
              background: template.aktif ? '#F0FDF4' : '#F1F5F9',
              color: template.aktif ? '#22C55E' : '#94A3B8',
            }}>
              {template.aktif ? 'Aktif' : 'Nonaktif'}
            </span>
            {template.meta_status && STATUS_BADGE[template.meta_status] ? (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                background: STATUS_BADGE[template.meta_status]!.bg,
                color: STATUS_BADGE[template.meta_status]!.color,
              }}>
                Meta: {STATUS_BADGE[template.meta_status]!.label}
              </span>
            ) : (
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                background: '#F8FAFC', color: '#94A3B8',
                border: '1px dashed #CBD5E1',
              }}>
                Belum disubmit ke Meta
              </span>
            )}
            {template.meta_category && (
              <span style={{ fontSize: 11, color: 'var(--c-text-faint)', padding: '2px 8px', borderRadius: 99, background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
                {template.meta_category}
              </span>
            )}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--c-text-muted)', marginTop: 3 }}>
            {template.template_name}
            {template.template_namespace && (
              <span style={{ color: 'var(--c-text-faint)', marginLeft: 6 }}>· {template.template_namespace}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={onEdit} title="Edit" style={{
            padding: '5px 10px', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)',
            background: 'var(--c-bg)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
            color: 'var(--c-text)',
          }}>Edit</button>
          <button onClick={onToggle} title={template.aktif ? 'Nonaktifkan' : 'Aktifkan'} style={{
            padding: '5px 10px', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)',
            background: 'var(--c-bg)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
            color: template.aktif ? '#F59E0B' : '#22C55E',
          }}>
            {template.aktif ? 'Nonaktifkan' : 'Aktifkan'}
          </button>
          {template.campaign_count === 0 && (
            <button onClick={onDelete} title="Hapus" style={{
              padding: '5px 10px', border: '1px solid #FECACA', borderRadius: 'var(--r-sm)',
              background: '#FEF2F2', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
              color: '#EF4444',
            }}>Hapus</button>
          )}
        </div>
      </div>

      {/* Preview text */}
      {template.preview_text && (
        <div style={{
          fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)',
          background: 'var(--c-bg)', borderRadius: 'var(--r-sm)',
          padding: 'var(--sp-3)', marginBottom: 'var(--sp-3)',
          lineHeight: 1.6, fontStyle: 'italic',
          borderLeft: '3px solid var(--c-border)',
        }}>
          "{template.preview_text}"
        </div>
      )}

      {/* Meta chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--c-text-faint)', background: 'var(--c-bg)', padding: '2px 8px', borderRadius: 99, border: '1px solid var(--c-border)' }}>
          🌐 {LANG_OPTIONS.find(l => l.value === template.template_language)?.label ?? template.template_language}
        </span>
        {Object.entries(compCounts).map(([type, n]) => (
          <span key={type} style={{ fontSize: 11, color: 'var(--c-text-faint)', background: 'var(--c-bg)', padding: '2px 8px', borderRadius: 99, border: '1px solid var(--c-border)' }}>
            {type} ×{n}
          </span>
        ))}
        {allParams.length > 0 && (
          <span style={{ fontSize: 11, color: '#0089A8', background: '#EFF9FB', padding: '2px 8px', borderRadius: 99 }}>
            {allParams.length} variabel: {allParams.map(p => `{{${p}}}`).join(', ')}
          </span>
        )}
        {template.campaign_count > 0 && (
          <span style={{ fontSize: 11, color: '#7C3AED', background: '#F5F3FF', padding: '2px 8px', borderRadius: 99 }}>
            Dipakai {template.campaign_count} campaign
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--c-text-faint)', marginLeft: 'auto' }}>
          Dibuat {new Date(template.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      </div>
    </div>
  )
}

export default function TemplatesClient({ slug, initialTemplates }: Props) {
  const [templates,  setTemplates]  = useState<Template[]>(initialTemplates)
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editTarget, setEditTarget] = useState<Template | null>(null)
  const [deleting,   setDeleting]   = useState<string | null>(null)
  const [showAll,    setShowAll]    = useState(false)
  const [syncing,    setSyncing]    = useState(false)
  const [syncMsg,    setSyncMsg]    = useState('')

  const active   = templates.filter(t => t.aktif)
  const inactive = templates.filter(t => !t.aktif)

  function openAdd()  { setEditTarget(null); setModalOpen(true) }
  function openEdit(t: Template) { setEditTarget(t); setModalOpen(true) }

  async function handleSync() {
    setSyncing(true); setSyncMsg('')
    try {
      const res  = await fetch(`/api/${slug}/broadcast/templates`, { method: 'PUT' })
      const json = await res.json()
      if (!res.ok) {
        const msg = json.error || 'Gagal sync'
        const isConfigErr = msg.includes('WABA') || msg.includes('config')
        setSyncMsg(isConfigErr
          ? `❌ WABA ID belum diisi — atur di Pengaturan › Integrasi Meta`
          : `❌ ${msg}`)
        return
      }
      setSyncMsg(`✅ ${json.synced} baru, ${json.updated ?? 0} diperbarui, ${json.skipped} tidak berubah`)
      if ((json.synced ?? 0) > 0 || (json.updated ?? 0) > 0) {
        const listRes = await fetch(`/api/${slug}/broadcast/templates`)
        const list    = await listRes.json()
        if (list.success) setTemplates(list.data)
      }
    } finally { setSyncing(false) }
  }

  function handleSaved(t: Template) {
    setTemplates(prev => {
      const idx = prev.findIndex(x => x.id === t.id)
      if (idx >= 0) return prev.map((x, i) => i === idx ? { ...x, ...t } : x)
      return [{ ...t, campaign_count: 0 }, ...prev]
    })
    setModalOpen(false)
  }

  async function handleToggle(t: Template) {
    const res  = await fetch(`/api/${slug}/broadcast/templates/${t.id}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ aktif: !t.aktif }),
    })
    if (res.ok) {
      setTemplates(prev => prev.map(x => x.id === t.id ? { ...x, aktif: !t.aktif } : x))
    }
  }

  async function handleDelete(t: Template) {
    if (!confirm(`Hapus template "${t.nama}"? Aksi ini tidak bisa dibatalkan.`)) return
    setDeleting(t.id)
    try {
      const res  = await fetch(`/api/${slug}/broadcast/templates/${t.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) { alert(json.error || 'Gagal menghapus'); return }
      setTemplates(prev => prev.filter(x => x.id !== t.id))
    } finally { setDeleting(null) }
  }

  return (
    <div>
      {/* Jalur pembuatan template */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)',
        marginBottom: 'var(--sp-5)',
      }}>
        {/* Jalur A — CRM (direkomendasikan) */}
        <div style={{
          background: 'var(--c-surface)', border: '2px solid var(--c-secondary)',
          borderRadius: 'var(--r-lg)', padding: 'var(--sp-4)', position: 'relative',
        }}>
          <div style={{
            position: 'absolute', top: -12, left: 16,
            background: 'var(--c-secondary)', color: 'white',
            fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 99,
          }}>
            ⭐ Direkomendasikan
          </div>
          <div style={{ fontWeight: 800, fontSize: 'var(--font-size-sm)', color: 'var(--c-primary)', marginBottom: 8, marginTop: 4 }}>
            Buat Template dari CRM
          </div>
          <div style={{ fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
            Isi form langsung di sini → klik <strong>Submit ke Meta</strong> → tunggu approved → langsung aktif untuk campaign.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {['Isi konten & variabel di form', 'Submit ke Meta dengan 1 klik', 'Pantau status approval di CRM'].map(s => (
              <div key={s} style={{ fontSize: 11, color: 'var(--c-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--c-secondary)', fontWeight: 700 }}>✓</span> {s}
              </div>
            ))}
          </div>
        </div>

        {/* Jalur B — Dari Meta */}
        <div style={{
          background: 'var(--c-surface)', border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-lg)', padding: 'var(--sp-4)',
        }}>
          <div style={{ fontWeight: 800, fontSize: 'var(--font-size-sm)', color: 'var(--c-primary)', marginBottom: 8 }}>
            Sudah Punya Template di Meta?
          </div>
          <div style={{ fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
            Jika template sudah dibuat & approved langsung di Meta Business Suite, tarik ke sini dengan tombol Sync.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {['Buat template di Meta Business Suite', 'Tunggu status Approved', 'Klik Sync dari Meta di bawah'].map(s => (
              <div key={s} style={{ fontSize: 11, color: 'var(--c-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--c-text-faint)', fontWeight: 700 }}>→</span> {s}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 'var(--sp-4)', flexWrap: 'wrap', gap: 'var(--sp-3)',
      }}>
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
          {active.length} aktif · {inactive.length} nonaktif
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          {syncMsg && (
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)' }}>{syncMsg}</span>
          )}
          <button onClick={handleSync} disabled={syncing} style={{
            padding: '9px 16px', background: 'var(--c-bg)', border: '1.5px solid var(--c-border)',
            borderRadius: 'var(--r-md)', color: 'var(--c-text)', fontFamily: 'inherit',
            fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer',
          }}>
            {syncing ? '⏳ Sync…' : '🔄 Sync dari Meta'}
          </button>
          <button onClick={openAdd} style={{
            padding: '9px 20px', background: 'var(--c-secondary)', border: 'none',
            borderRadius: 'var(--r-md)', color: 'white', fontFamily: 'inherit',
            fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer',
          }}>
            + Buat Template Baru
          </button>
        </div>
      </div>

      {/* List */}
      {templates.length === 0 ? (
        <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-xl)', padding: 'var(--sp-6)' }}>
          <EmptyState onAdd={openAdd} onSync={handleSync} syncing={syncing} />
        </div>
      ) : (
        <div>
          {/* Aktif */}
          {active.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
              {active.map(t => (
                <TemplateCard key={t.id} template={t}
                  onEdit={() => openEdit(t)}
                  onToggle={() => handleToggle(t)}
                  onDelete={() => handleDelete(t)} />
              ))}
            </div>
          )}

          {/* Nonaktif — collapsible */}
          {inactive.length > 0 && (
            <div>
              <button onClick={() => setShowAll(s => !s)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 'var(--font-size-xs)', color: 'var(--c-text-faint)',
                fontFamily: 'inherit', padding: '4px 0', marginBottom: 8,
              }}>
                {showAll ? '▼' : '▶'} {inactive.length} template nonaktif
              </button>
              {showAll && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                  {inactive.map(t => (
                    <TemplateCard key={t.id} template={t}
                      onEdit={() => openEdit(t)}
                      onToggle={() => handleToggle(t)}
                      onDelete={() => handleDelete(t)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {modalOpen && (
        <TemplateModal slug={slug} template={editTarget} onClose={() => setModalOpen(false)} onSaved={handleSaved} />
      )}
    </div>
  )
}
