'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { TEMPLATE_FIELD_LABELS } from '@/lib/template-fields'
import type { FilterCondition, FilterGroup, KeterlibatanSumber } from '@/lib/sapaan-filter'

interface TmplParam { param_key: string; example?: string; source?: 'static' | 'field'; field?: string }
interface TmplComponent { type: string; text?: string; parameters?: TmplParam[] }
interface Template { id: string; nama: string; template_name: string; meta_status: string | null; components_schema: TmplComponent[] }
interface TagItem { id: string; name: string; warna: string }

interface ConfigData {
  aktif: boolean
  jam_kirim: number
  template_id: string | null
  template_params: Record<string, string> | null
  filter_groups: FilterGroup[] | null
}

const JAM_OPTIONS = Array.from({ length: 24 }, (_, i) => ({ value: i, label: `${String(i).padStart(2, '0')}:00 WIB` }))

const SUMBER_PASIEN_LABELS: Record<string, string> = {
  SIMRS:      'Sinkron SIMRS',
  KEGIATAN:   'Kegiatan / Check-in',
  IMPORT:     'Import Excel',
  MANUAL:     'Input Manual',
  REGISTRASI: 'Registrasi Mandiri',
}

const inp: React.CSSProperties = {
  width: '100%', padding: '7px 10px', fontFamily: 'inherit',
  fontSize: 'var(--font-size-xs)', border: '1.5px solid var(--c-border)',
  borderRadius: 'var(--r-sm)', background: 'var(--c-bg)', color: 'var(--c-text)',
  outline: 'none', boxSizing: 'border-box',
}

function flatParams(t: Template | undefined): TmplParam[] {
  if (!t) return []
  return (t.components_schema || []).flatMap(c => c.parameters || [])
}

function newCondition(): FilterCondition { return { type: 'tag' } }
function newGroup(): FilterGroup { return { conditions: [newCondition()] } }

// ─── Editor satu kondisi ───
function ConditionRow({
  cond, tags, onChange, onRemove,
}: {
  cond: FilterCondition; tags: TagItem[]
  onChange: (c: FilterCondition) => void; onRemove: () => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap', padding: '8px 0' }}>
      <select value={cond.type} onChange={e => onChange({ type: e.target.value as any })}
        style={{ ...inp, width: 140, flexShrink: 0 }}>
        <option value="tag">Tag</option>
        <option value="asal_pasien">Asal Pasien</option>
        <option value="keterlibatan">Keterlibatan</option>
      </select>

      {cond.type === 'tag' && (
        <select value={cond.tagId ?? ''} onChange={e => {
          const t = tags.find(x => x.id === e.target.value)
          onChange({ ...cond, tagId: e.target.value, tagName: t?.name })
        }} style={{ ...inp, flex: 1, minWidth: 140 }}>
          <option value="">— pilih tag —</option>
          {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}

      {cond.type === 'asal_pasien' && (
        <select value={cond.sumber ?? ''} onChange={e => onChange({ ...cond, sumber: e.target.value })}
          style={{ ...inp, flex: 1, minWidth: 140 }}>
          <option value="">— pilih asal —</option>
          {Object.entries(SUMBER_PASIEN_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      )}

      {cond.type === 'keterlibatan' && (
        <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--c-bg)', borderRadius: 'var(--r-sm)', padding: 8 }}>
          <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
            {(['SIMRS_VISIT', 'KEGIATAN'] as KeterlibatanSumber[]).map(s => {
              const checked = cond.sumberKeterlibatan?.includes(s) ?? (s === 'SIMRS_VISIT' && !cond.sumberKeterlibatan)
              return (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={checked} onChange={e => {
                    const cur = new Set(cond.sumberKeterlibatan ?? ['SIMRS_VISIT'])
                    if (e.target.checked) cur.add(s); else cur.delete(s)
                    onChange({ ...cond, sumberKeterlibatan: Array.from(cur) })
                  }} />
                  {s === 'SIMRS_VISIT' ? 'Kunjungan RKZ' : 'Partisipasi Kegiatan'}
                </label>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--c-text-muted)', flexShrink: 0 }}>Minimal</span>
            <input type="number" min={1} value={cond.min ?? 1}
              onChange={e => onChange({ ...cond, min: parseInt(e.target.value) || 1 })}
              style={{ ...inp, width: 60 }} />
            <span style={{ fontSize: 11, color: 'var(--c-text-muted)', flexShrink: 0 }}>kali</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>Periode:</span>
            <input type="date" value={cond.periodeAwal ?? ''} onChange={e => onChange({ ...cond, periodeAwal: e.target.value || undefined })} style={{ ...inp, width: 130 }} />
            <span style={{ fontSize: 11, color: 'var(--c-text-faint)' }}>s/d</span>
            <input type="date" value={cond.periodeAkhir ?? ''} onChange={e => onChange({ ...cond, periodeAkhir: e.target.value || undefined })} style={{ ...inp, width: 130 }} />
            <span style={{ fontSize: 10, color: 'var(--c-text-faint)' }}>(kosongkan = sepanjang waktu)</span>
          </div>
        </div>
      )}

      <button type="button" onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 15, flexShrink: 0 }}>×</button>
    </div>
  )
}

export default function UltahCard({
  slug, metaAktif, initialConfig, stats,
}: {
  slug: string; metaAktif: boolean
  initialConfig: ConfigData | null; stats: Record<string, number>
}) {
  const router = useRouter()
  const accent = '#E8A800'

  const [aktif, setAktif]           = useState(initialConfig?.aktif ?? false)
  const [jamKirim, setJamKirim]     = useState(initialConfig?.jam_kirim ?? 7)
  const [templateId, setTemplateId] = useState(initialConfig?.template_id ?? '')
  const [templateParams, setTemplateParams] = useState<Record<string, string>>(initialConfig?.template_params ?? {})
  const [groups, setGroups]         = useState<FilterGroup[]>(initialConfig?.filter_groups?.length ? initialConfig.filter_groups : [])

  const [templates, setTemplates] = useState<Template[]>([])
  const [tags, setTags]           = useState<TagItem[]>([])
  const [expanded, setExpanded]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [error, setError]         = useState('')
  const [showLog, setShowLog]     = useState(false)
  const [logs, setLogs]           = useState<any[]>([])
  const [loadingLog, setLoadingLog] = useState(false)
  const loadedRef = useRef(false)

  const sent30   = stats['SENT']   || 0
  const failed30 = stats['FAILED'] || 0
  const total30  = sent30 + failed30

  useEffect(() => {
    if (!expanded || loadedRef.current) return
    loadedRef.current = true
    fetch(`/api/${slug}/broadcast/templates`).then(r => r.json()).then(j => {
      if (j.success) setTemplates((j.data || []).filter((t: Template) => t.meta_status === 'APPROVED'))
    }).catch(() => {})
    fetch(`/api/${slug}/tags`).then(r => r.json()).then(j => {
      if (j.success) setTags((j.data || []).filter((t: any) => t.aktif))
    }).catch(() => {})
  }, [expanded, slug])

  const selectedTemplate = templates.find(t => t.id === templateId)
  const params = flatParams(selectedTemplate)
  const staticParams = params.filter(p => (p.source ?? 'static') === 'static')

  function updateGroup(gi: number, group: FilterGroup) {
    setGroups(gs => gs.map((g, i) => i === gi ? group : g))
  }
  function addGroup() { setGroups(gs => [...gs, newGroup()]) }
  function removeGroup(gi: number) { setGroups(gs => gs.filter((_, i) => i !== gi)) }
  function addCondition(gi: number) { updateGroup(gi, { conditions: [...groups[gi].conditions, newCondition()] }) }
  function updateCondition(gi: number, ci: number, cond: FilterCondition) {
    updateGroup(gi, { conditions: groups[gi].conditions.map((c, i) => i === ci ? cond : c) })
  }
  function removeCondition(gi: number, ci: number) {
    const conds = groups[gi].conditions.filter((_, i) => i !== ci)
    if (conds.length === 0) removeGroup(gi)
    else updateGroup(gi, { conditions: conds })
  }

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const res = await fetch(`/api/${slug}/sapaan`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jenis: 'ULTAH', aktif, jam_kirim: jamKirim,
          template_id: templateId, template_params: templateParams, filter_groups: groups,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Gagal menyimpan'); return }
      setSaved(true); setTimeout(() => setSaved(false), 3000)
      router.refresh()
    } finally { setSaving(false) }
  }

  async function loadLog() {
    if (showLog) { setShowLog(false); return }
    setShowLog(true); setLoadingLog(true)
    try {
      const res = await fetch(`/api/${slug}/sapaan/log?jenis=ULTAH&page=1`)
      const json = await res.json()
      setLogs(json.data || [])
    } finally { setLoadingLog(false) }
  }

  return (
    <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-xl)', overflow: 'hidden' }}>
      <div onClick={() => setExpanded(e => !e)} style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', padding: 'var(--sp-5)',
        cursor: 'pointer', borderLeft: `4px solid ${accent}`, userSelect: 'none',
      }}>
        <span style={{ fontSize: 26, flexShrink: 0 }}>🎂</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 'var(--font-size-md)', color: 'var(--c-primary)' }}>Ucapan Ulang Tahun</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: aktif ? accent + '1A' : '#F1F5F9', color: aktif ? accent : '#94A3B8' }}>
              {aktif ? 'Aktif' : 'Nonaktif'}
            </span>
          </div>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', margin: '3px 0 0' }}>
            Dikirim otomatis via template WhatsApp ke pasien yang berulang tahun hari itu (bisa difilter).
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
        <span style={{ color: 'var(--c-text-faint)', fontSize: 12, flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--c-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--sp-4) var(--sp-5)', background: 'var(--c-bg)', borderBottom: '1px solid var(--c-border)' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--c-text)' }}>Aktifkan pengiriman otomatis</div>
              <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 2 }}>
                {aktif ? 'Sapaan akan dikirim sesuai jadwal & filter yang ditentukan' : 'Tidak akan dikirim meski ada pasien yang memenuhi syarat'}
              </div>
            </div>
            <div onClick={() => setAktif(a => !a)} style={{ width: 48, height: 26, borderRadius: 99, cursor: 'pointer', flexShrink: 0, background: aktif ? accent : '#CBD5E1', position: 'relative', transition: 'background 0.2s' }}>
              <div style={{ position: 'absolute', width: 20, height: 20, borderRadius: '50%', background: 'white', top: 3, left: aktif ? 25 : 3, transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
            </div>
          </div>

          <div style={{ padding: 'var(--sp-5)' }}>
            {/* Jam kirim */}
            <div style={{ marginBottom: 'var(--sp-5)' }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text)', marginBottom: 4 }}>Jam Kirim</label>
              <select value={jamKirim} onChange={e => setJamKirim(parseInt(e.target.value))} style={{ ...inp, maxWidth: 200 }}>
                {JAM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 4 }}>Sistem cek & kirim pada jam ini setiap hari.</div>
            </div>

            {/* Template picker */}
            <div style={{ marginBottom: 'var(--sp-5)' }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text)', marginBottom: 4 }}>
                Template Pesan (WhatsApp) *
              </label>
              {templates.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
                  Belum ada template Approved. Buat dulu di <a href={`/${slug}/broadcast/templates`} style={{ color: 'var(--c-secondary)' }}>Kelola Template</a>.
                </div>
              ) : (
                <select value={templateId} onChange={e => { setTemplateId(e.target.value); setTemplateParams({}) }} style={{ ...inp, maxWidth: 360 }}>
                  <option value="">— pilih template —</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.nama} ({t.template_name})</option>)}
                </select>
              )}
            </div>

            {/* Isi variabel statis */}
            {selectedTemplate && staticParams.length > 0 && (
              <div style={{ marginBottom: 'var(--sp-5)' }}>
                <label style={{ display: 'block', fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text)', marginBottom: 8 }}>Isi Variabel Statis</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {staticParams.map((p, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--c-text-muted)', minWidth: 90, fontFamily: 'monospace' }}>{p.param_key}</span>
                      <input value={templateParams[p.param_key] ?? ''} onChange={e => setTemplateParams(v => ({ ...v, [p.param_key]: e.target.value }))}
                        placeholder={p.example ? `contoh: ${p.example}` : ''} style={{ ...inp, flex: 1 }} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selectedTemplate && params.some(p => (p.source ?? 'static') === 'field') && (
              <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 'var(--sp-5)', marginTop: -8 }}>
                🔗 Variabel dari data pasien ({params.filter(p => p.source === 'field').map(p => TEMPLATE_FIELD_LABELS[p.field || ''] || p.field).join(', ')}) terisi otomatis per penerima.
              </div>
            )}

            {/* Filter builder */}
            <div style={{ marginBottom: 'var(--sp-5)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--c-text)' }}>
                  Filter Penerima <span style={{ fontWeight: 400, color: 'var(--c-text-faint)' }}>(kosong = kirim ke semua yang ulang tahun)</span>
                </label>
                <button type="button" onClick={addGroup} style={{ fontSize: 11, padding: '4px 10px', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', background: 'white', cursor: 'pointer' }}>+ Tambah Grup</button>
              </div>

              {groups.map((group, gi) => (
                <div key={gi} style={{ marginBottom: 10 }}>
                  {gi > 0 && <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--c-text-faint)', margin: '4px 0' }}>ATAU</div>}
                  <div style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: 10, background: 'var(--c-bg)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-text-faint)', textTransform: 'uppercase' }}>Grup {gi + 1} (semua kondisi harus terpenuhi)</span>
                      <button type="button" onClick={() => removeGroup(gi)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 11 }}>Hapus Grup</button>
                    </div>
                    {group.conditions.map((cond, ci) => (
                      <div key={ci}>
                        {ci > 0 && <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-text-faint)' }}>DAN</div>}
                        <ConditionRow cond={cond} tags={tags}
                          onChange={c => updateCondition(gi, ci, c)}
                          onRemove={() => removeCondition(gi, ci)} />
                      </div>
                    ))}
                    <button type="button" onClick={() => addCondition(gi)} style={{ fontSize: 11, padding: '3px 10px', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', background: 'white', cursor: 'pointer', marginTop: 4 }}>+ Kondisi</button>
                  </div>
                </div>
              ))}
              {groups.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--c-text-faint)', fontStyle: 'italic' }}>Belum ada filter — akan dikirim ke semua pasien yang berulang tahun.</div>
              )}
            </div>

            {error && (
              <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: 'var(--sp-3) var(--sp-4)', borderRadius: 'var(--r-sm)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--sp-4)', borderLeft: '3px solid #EF4444' }}>{error}</div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 'var(--sp-4)', borderTop: '1px solid var(--c-border)', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
              <button onClick={loadLog} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)', fontFamily: 'inherit' }}>
                {showLog ? '▲ Sembunyikan riwayat' : '▼ Lihat riwayat kirim'}
              </button>
              <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
                {saved && <span style={{ fontSize: 'var(--font-size-sm)', color: '#22C55E', fontWeight: 600 }}>✓ Tersimpan</span>}
                <button onClick={handleSave} disabled={saving || !templateId} style={{
                  padding: '9px 24px', borderRadius: 'var(--r-md)',
                  background: saving || !templateId ? '#94A3B8' : 'var(--c-secondary)',
                  border: 'none', color: 'white', fontFamily: 'inherit', fontSize: 'var(--font-size-sm)', fontWeight: 700,
                  cursor: saving || !templateId ? 'not-allowed' : 'pointer',
                }}>
                  {saving ? 'Menyimpan…' : 'Simpan'}
                </button>
              </div>
            </div>

            {showLog && (
              <div style={{ marginTop: 'var(--sp-4)', borderTop: '1px solid var(--c-border)', paddingTop: 'var(--sp-4)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Riwayat Kirim Terakhir</div>
                {loadingLog ? (
                  <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>Memuat…</div>
                ) : logs.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>Belum ada riwayat kirim.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr>{['Nama', 'No HP', 'Status', 'Tanggal'].map(h => <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--c-text-faint)', fontSize: 11, borderBottom: '1px solid var(--c-border)' }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {logs.map((l: any, i: number) => (
                        <tr key={l.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--c-bg)' }}>
                          <td style={{ padding: '7px 10px', fontWeight: 600, color: 'var(--c-text)', borderBottom: '1px solid var(--c-border)' }}>{l.person_name}</td>
                          <td style={{ padding: '7px 10px', color: 'var(--c-text-muted)', fontFamily: 'monospace', borderBottom: '1px solid var(--c-border)' }}>{l.person_hp}</td>
                          <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--c-border)' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: l.status === 'SENT' ? '#F0FDF4' : '#FEF2F2', color: l.status === 'SENT' ? '#22C55E' : '#EF4444' }}>{l.status}</span>
                          </td>
                          <td style={{ padding: '7px 10px', color: 'var(--c-text-faint)', borderBottom: '1px solid var(--c-border)' }}>{new Date(l.sent_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
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
