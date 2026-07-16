'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface SessionSummary {
  id:         string
  judul:      string
  created_at: string
  updated_at: string
}

interface ToolCallLog {
  name:  string
  input: any
}

interface Message {
  id:         string
  role:       'USER' | 'ASSISTANT'
  content:    string
  tool_calls: ToolCallLog[] | null
  created_at: string
}

interface Props {
  slug:            string
  initialSessions: SessionSummary[]
}

const TOOL_LABEL: Record<string, (input: any) => string> = {
  cari_kode_icd:         (i) => `Mencari kode ICD: "${i?.query ?? ''}"`,
  cari_layanan:          (i) => `Mencari layanan: "${i?.query ?? ''}"`,
  cari_tag:              (i) => `Mencari tag: "${i?.query ?? ''}"`,
  daftar_kegiatan:       (i) => i?.cari ? `Membuka daftar kegiatan: "${i.cari}"` : 'Membuka daftar kegiatan',
  daftar_nilai_dimensi:  (i) => `Mengecek nilai tersedia: ${String(i?.dimensi ?? '').replace(/_/g, ' ')}`,
  preview_jumlah_pasien: () => 'Menghitung jumlah pasien yang cocok...',
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'baru saja'
  if (min < 60) return `${min} menit lalu`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} jam lalu`
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

function findLastPreviewFilter(messages: Message[]): any | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'ASSISTANT' || !m.tool_calls) continue
    const call = [...m.tool_calls].reverse().find(c => c.name === 'preview_jumlah_pasien')
    if (call) return call.input
  }
  return null
}

export default function AiPartnerShell({ slug, initialSessions }: Props) {
  const [sessions,       setSessions]       = useState<SessionSummary[]>(initialSessions)
  const [activeId,       setActiveId]       = useState<string | null>(null)
  const [messages,       setMessages]       = useState<Message[]>([])
  const [draft,          setDraft]          = useState('')
  const [sending,        setSending]        = useState(false)
  const [loadingSession, setLoadingSession] = useState(false)
  const [error,          setError]          = useState('')

  const [saveForm, setSaveForm] = useState<{ open: boolean; nama: string; filter: any; saving: boolean; error: string; done: boolean }>({
    open: false, nama: '', filter: null, saving: false, error: '', done: false,
  })

  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const loadSession = useCallback(async (id: string) => {
    setLoadingSession(true); setError(''); setSaveForm(f => ({ ...f, open: false, done: false }))
    try {
      const res  = await fetch(`/api/${slug}/ai-partner/${id}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Gagal memuat sesi'); return }
      setMessages(json.data.messages)
      setActiveId(id)
    } finally { setLoadingSession(false) }
  }, [slug])

  function startNewSession() {
    setActiveId(null); setMessages([]); setError(''); setDraft('')
    setSaveForm({ open: false, nama: '', filter: null, saving: false, error: '', done: false })
  }

  async function sendMessage() {
    const content = draft.trim()
    if (!content || sending) return
    setSending(true); setError(''); setDraft('')

    const optimisticUser: Message = { id: `tmp-${Date.now()}`, role: 'USER', content, tool_calls: null, created_at: new Date().toISOString() }
    setMessages(m => [...m, optimisticUser])

    try {
      let sid = activeId
      if (!sid) {
        const res  = await fetch(`/api/${slug}/ai-partner`, { method: 'POST' })
        const json = await res.json()
        if (!res.ok) { setError(json.error || 'Gagal membuat sesi baru'); return }
        sid = json.data.id
        setActiveId(sid)
      }

      const res  = await fetch(`/api/${slug}/ai-partner/${sid}/message`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ content }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Gagal mengirim pesan'); return }

      setMessages(m => [...m.filter(x => x.id !== optimisticUser.id), json.data.userMessage, json.data.assistantMessage])

      setSessions(prev => {
        const existing = prev.find(s => s.id === sid)
        const updated: SessionSummary = existing
          ? { ...existing, updated_at: new Date().toISOString(), judul: existing.judul }
          : { id: sid!, judul: content.slice(0, 60), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        return [updated, ...prev.filter(s => s.id !== sid)]
      })
    } finally { setSending(false) }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  function openSaveForm() {
    const filter = findLastPreviewFilter(messages)
    if (!filter) return
    setSaveForm({ open: true, nama: '', filter, saving: false, error: '', done: false })
  }

  async function confirmSaveSegment() {
    if (!saveForm.nama.trim()) { setSaveForm(f => ({ ...f, error: 'Nama segmen wajib diisi' })); return }
    setSaveForm(f => ({ ...f, saving: true, error: '' }))
    try {
      const searchRes  = await fetch(`/api/${slug}/segmen/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify(saveForm.filter),
      })
      const searchJson = await searchRes.json()
      if (!searchRes.ok) { setSaveForm(f => ({ ...f, saving: false, error: searchJson.error || 'Gagal mencari pasien' })); return }

      const createRes  = await fetch(`/api/${slug}/segmen`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: saveForm.nama.trim(),
          tipe: 'AI',
          simrs_params: saveForm.filter,
          person_ids: searchJson.data.person_ids,
        }),
      })
      const createJson = await createRes.json()
      if (!createRes.ok) { setSaveForm(f => ({ ...f, saving: false, error: createJson.error || 'Gagal menyimpan segmen' })); return }

      setSaveForm(f => ({ ...f, saving: false, done: true }))
    } catch {
      setSaveForm(f => ({ ...f, saving: false, error: 'Server error' }))
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontFamily: 'inherit',
    fontSize: 'var(--font-size-sm)', border: '1.5px solid var(--c-border)',
    borderRadius: 'var(--r-sm)', outline: 'none', boxSizing: 'border-box',
    background: 'var(--c-bg)', color: 'var(--c-text)',
  }

  const lastAssistantHasPreview = messages.length > 0 && findLastPreviewFilter(messages) !== null

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, borderTop: '1px solid var(--c-border)' }}>

      {/* ── Sidebar sesi ── */}
      <div style={{
        width: 260, flexShrink: 0, borderRight: '1px solid var(--c-border)',
        display: 'flex', flexDirection: 'column',
        background: 'var(--c-surface)',
      }}>
        <div style={{ padding: 'var(--sp-3)' }}>
          <button onClick={startNewSession} style={{
            width: '100%', padding: '9px 12px', borderRadius: 'var(--r-md)',
            background: 'var(--c-secondary)', border: 'none', color: 'white',
            fontFamily: 'inherit', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer',
          }}>
            + Percakapan Baru
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--sp-2) var(--sp-3)' }}>
          {sessions.length === 0 && (
            <div style={{ padding: 'var(--sp-3)', fontSize: 'var(--font-size-xs)', color: 'var(--c-text-faint)', textAlign: 'center' }}>
              Belum ada percakapan
            </div>
          )}
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => loadSession(s.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
                borderRadius: 'var(--r-sm)', border: 'none', marginBottom: 2,
                background: activeId === s.id ? 'var(--c-bg)' : 'transparent',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <div style={{
                fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--c-text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {s.judul}
              </div>
              <div style={{ fontSize: 10, color: 'var(--c-text-faint)', marginTop: 2 }}>
                {relativeTime(s.updated_at)}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Jendela chat ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-5)' }}>
          {messages.length === 0 && !loadingSession && (
            <div style={{ textAlign: 'center', color: 'var(--c-text-faint)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--sp-6)' }}>
              Mulai percakapan — mis. "cari pasien diabetes rawat jalan 3 bulan terakhir"
            </div>
          )}
          {loadingSession && (
            <div style={{ textAlign: 'center', color: 'var(--c-text-faint)', fontSize: 'var(--font-size-sm)' }}>Memuat...</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            {messages.map(m => {
              const isUser = m.role === 'USER'
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                  {!isUser && m.tool_calls && m.tool_calls.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
                      {m.tool_calls.map((tc, i) => (
                        <div key={i} style={{ fontSize: 11, color: 'var(--c-text-faint)', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span>🔍</span>
                          <span>{(TOOL_LABEL[tc.name]?.(tc.input)) ?? tc.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{
                    maxWidth: '75%', padding: '9px 14px', borderRadius: 'var(--r-lg)',
                    fontSize: 'var(--font-size-sm)', lineHeight: 1.5, whiteSpace: 'pre-wrap',
                    background: isUser ? 'var(--c-secondary)' : 'var(--c-surface)',
                    color: isUser ? 'white' : 'var(--c-text)',
                    border: isUser ? 'none' : '1px solid var(--c-border)',
                  }}>
                    {m.content}
                  </div>
                </div>
              )
            })}

            {sending && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '9px 14px', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)',
                  fontSize: 'var(--font-size-sm)', color: 'var(--c-text-faint)',
                }}>
                  AI sedang berpikir...
                </div>
              </div>
            )}
          </div>

          {/* Tombol simpan sebagai segmen — muncul begitu ada hasil filter */}
          {lastAssistantHasPreview && !sending && (
            <div style={{ marginTop: 'var(--sp-4)' }}>
              {!saveForm.open && !saveForm.done && (
                <button onClick={openSaveForm} style={{
                  padding: '8px 16px', borderRadius: 'var(--r-md)',
                  background: 'var(--c-bg)', border: '1.5px solid var(--c-secondary)', color: 'var(--c-secondary)',
                  fontFamily: 'inherit', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer',
                }}>
                  💾 Simpan sebagai Segmen
                </button>
              )}
              {saveForm.open && !saveForm.done && (
                <div style={{
                  border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)',
                  background: 'var(--c-surface)', maxWidth: 420,
                }}>
                  <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 700, marginBottom: 4, color: 'var(--c-text)' }}>
                    Nama Segmen
                  </label>
                  <input
                    value={saveForm.nama}
                    onChange={e => setSaveForm(f => ({ ...f, nama: e.target.value }))}
                    placeholder="cth: Target Kampanye Diabetes Juli 2026"
                    style={{ ...inp, marginBottom: 10 }}
                  />
                  {saveForm.error && <div style={{ fontSize: 12, color: '#DC2626', marginBottom: 10 }}>{saveForm.error}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={confirmSaveSegment} disabled={saveForm.saving} style={{
                      padding: '8px 16px', borderRadius: 'var(--r-md)', border: 'none',
                      background: saveForm.saving ? '#94A3B8' : 'var(--c-secondary)', color: 'white',
                      fontFamily: 'inherit', fontSize: 'var(--font-size-xs)', fontWeight: 700,
                      cursor: saveForm.saving ? 'not-allowed' : 'pointer',
                    }}>
                      {saveForm.saving ? 'Menyimpan...' : 'Simpan'}
                    </button>
                    <button onClick={() => setSaveForm(f => ({ ...f, open: false }))} style={{
                      padding: '8px 16px', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)',
                      background: 'none', color: 'var(--c-text-muted)', fontFamily: 'inherit',
                      fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer',
                    }}>
                      Batal
                    </button>
                  </div>
                </div>
              )}
              {saveForm.done && (
                <div style={{ fontSize: 'var(--font-size-sm)', color: '#16A34A', fontWeight: 600 }}>
                  ✓ Segmen "{saveForm.nama}" tersimpan.
                </div>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {error && (
          <div style={{
            margin: '0 var(--sp-5)', padding: '8px 14px', borderRadius: 'var(--r-sm)',
            background: '#FEF2F2', color: '#B91C1C', fontSize: 'var(--font-size-sm)', borderLeft: '3px solid #EF4444',
          }}>
            {error}
          </div>
        )}

        {/* ── Input bar ── */}
        <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderTop: '1px solid var(--c-border)', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tanya atau minta AI cari target pasien..."
            rows={1}
            style={{
              flex: 1, padding: '10px 14px', fontFamily: 'inherit', fontSize: 'var(--font-size-sm)',
              border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-lg)', outline: 'none',
              background: 'var(--c-bg)', color: 'var(--c-text)', resize: 'none', maxHeight: 120, lineHeight: 1.5,
            }}
          />
          <button onClick={sendMessage} disabled={!draft.trim() || sending} style={{
            padding: '10px 20px', borderRadius: 'var(--r-lg)', border: 'none',
            background: draft.trim() && !sending ? 'var(--c-secondary)' : '#94A3B8', color: 'white',
            fontFamily: 'inherit', fontSize: 'var(--font-size-sm)', fontWeight: 700,
            cursor: draft.trim() && !sending ? 'pointer' : 'not-allowed',
          }}>
            Kirim
          </button>
        </div>
      </div>
    </div>
  )
}
