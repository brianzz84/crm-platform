'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import TagChip from '@/components/pasien/TagChip'
import { FaWhatsapp, FaInstagram, FaFacebook } from 'react-icons/fa'

/* ─── WhatsApp color tokens ─── */
const WA_GREEN       = '#25D366'
const WA_GREEN_DARK  = '#128C7E'
const WA_GREEN_LIGHT = '#DCF8C6'
const WA_BG          = '#ECE5DD'

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function Avatar({ name, size = 40, bg = WA_GREEN_DARK }: { name: string; size?: number; bg?: string }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: 'white',
    }}>
      {initials(name)}
    </div>
  )
}

/* ─── Types ─── */
interface ConvSummary {
  id: string; channel: string; channel_user_id: string; status: string
  unread_count: number; last_message_at: string
  person: { id: string; name: string; no_hp: string } | null
  messages: { content: string; direction: string; is_internal_note: boolean }[]
}
interface MsgRow {
  id: string; direction: string; content: string
  media_url?: string | null; media_type?: string | null
  is_internal_note: boolean; status: string; ai_generated: boolean
  created_at: string; sent_at?: string | null
  sender?: { id: string; name: string } | null
}
interface ConvDetail {
  id: string; channel: string; channel_user_id: string; status: string
  person: {
    id: string; name: string; no_hp: string; no_rm: string | null
    email: string | null; tanggal_lahir: string | null
    tags: { tag: { name: string; warna: string }; sumber: string }[]
    visits: { tanggal: string; poli: string | null; unit: string; dokter: string | null; diagnosa_nama: string | null; diagnosa_icd: string | null }[]
  } | null
}

/* ─── Constants ─── */
const CH_ICON: Record<string, string>  = { WA: '📱', IG: '📸', FB: '📘' }
const CH_COLOR: Record<string, string> = { WA: '#25D366', IG: '#E040FB', FB: '#1877F2' }
const CH_LABEL: Record<string, string> = { WA: 'WhatsApp', IG: 'Instagram', FB: 'Facebook' }

function fmtTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Kemarin'
  if (diffDays < 7)  return d.toLocaleDateString('id-ID', { weekday: 'short' })
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}
function fmtBubble(iso: string) {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

interface Agent { id: string; name: string; email: string }

interface FlyerItem {
  id: number
  title: string
  preview_url: string
  download_url: string
  category?: string
}

/* ─── Main Component ─── */
export default function InboxShell({
  slug,
  userId,
  canViewAll,
  canAssign,
  eflyerEnabled,
}: {
  slug: string
  userId: string
  canViewAll: boolean
  canAssign: boolean
  eflyerEnabled?: boolean
}) {
  const [convs, setConvs]           = useState<ConvSummary[]>([])
  const [activeId, setActiveId]     = useState<string | null>(null)
  const [detail, setDetail]         = useState<ConvDetail | null>(null)
  const [msgs, setMsgs]             = useState<MsgRow[]>([])
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [loadingMsgs, setLoadingMsgs]   = useState(false)
  const [sending, setSending]       = useState(false)
  const [draft, setDraft]           = useState('')
  const [isNote, setIsNote]         = useState(false)
  const [statusFilter, setStatusFilter] = useState('OPEN')
  const [channelFilter, setChannelFilter] = useState('')
  const [q, setQ]                   = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [showInfo, setShowInfo]     = useState(false)
  const [agents, setAgents]         = useState<Agent[]>([])
  const [showAssign, setShowAssign] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [isMobile, setIsMobile]     = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const [attachTab, setAttachTab]   = useState<'gallery' | 'eflyer'>('gallery')
  const [uploading, setUploading]   = useState(false)
  const [flyers, setFlyers]         = useState<FlyerItem[]>([])
  const [flyersLoading, setFlyersLoading] = useState(false)
  const [flyerQ, setFlyerQ]         = useState('')
  const [unreadSummary, setUnreadSummary] = useState<Record<string, number>>({ OPEN: 0, PENDING: 0, RESOLVED: 0 })
  const fileInputRef                = useRef<HTMLInputElement>(null)
  const messagesEndRef              = useRef<HTMLDivElement>(null)
  const textareaRef                 = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  // Lock body scroll saat inbox terbuka di mobile
  useEffect(() => {
    if (!isMobile) return
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.width    = '100%'
    return () => {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width    = ''
    }
  }, [isMobile])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 350)
    return () => clearTimeout(t)
  }, [q])

  const loadConvs = useCallback(async (showLoader = true) => {
    if (showLoader) setLoadingConvs(true)
    try {
      const p = new URLSearchParams({ status: statusFilter, ...(channelFilter ? { channel: channelFilter } : {}), ...(debouncedQ ? { q: debouncedQ } : {}) })
      const res  = await fetch(`/api/${slug}/inbox?${p}`)
      const json = await res.json()
      if (json.success) setConvs(prev => {
        // Hanya update jika data berbeda (cek konv pertama sebagai proxy)
        const same = JSON.stringify(prev.map(c => c.id + c.unread_count + c.last_message_at))
                  === JSON.stringify(json.data.map((c: ConvSummary) => c.id + c.unread_count + c.last_message_at))
        return same ? prev : json.data
      })
    } finally { if (showLoader) setLoadingConvs(false) }
  }, [slug, statusFilter, channelFilter, debouncedQ])

  useEffect(() => { loadConvs() }, [loadConvs])

  useEffect(() => {
    if (!canAssign) return
    fetch(`/api/${slug}/users?role=AGEN`)
      .then(r => r.json())
      .then(j => { if (j.success) setAgents(j.data) })
      .catch(() => {})
  }, [slug, canAssign])

  // Load penuh: detail + semua pesan (saat pertama buka conversation)
  const loadDetail = useCallback(async (id: string) => {
    setLoadingMsgs(true)
    try {
      const [detailRes, msgsRes] = await Promise.all([
        fetch(`/api/${slug}/inbox/${id}`),
        fetch(`/api/${slug}/inbox/${id}/messages`),
      ])
      const [dj, mj] = await Promise.all([detailRes.json(), msgsRes.json()])
      if (dj.success) setDetail(dj.data)
      if (mj.success) setMsgs(mj.data)
    } finally { setLoadingMsgs(false) }
  }, [slug])

  // Poll ringan: hanya fetch pesan, update state HANYA jika ada pesan baru
  // → tidak ada re-render jika tidak ada perubahan → tidak berkedip
  const pollMsgs = useCallback(async (id: string) => {
    try {
      const res  = await fetch(`/api/${slug}/inbox/${id}/messages`)
      const json = await res.json()
      if (!json.success) return
      const newMsgs: MsgRow[] = json.data
      setMsgs(prev => {
        // Signature mencakup status → deteksi perubahan status (PENDING→SENT→DELIVERED→READ),
        // bukan hanya pesan baru. Tanpa ini, centang bubble mentok di 🕐 sampai ada balasan.
        const sig = (arr: MsgRow[]) => arr.map(m => `${m.id}:${m.status}`).join('|')
        if (sig(prev) === sig(newMsgs)) return prev  // benar-benar tak ada perubahan → no re-render

        const lastPrevId = prev[prev.length - 1]?.id
        const lastNewId  = newMsgs[newMsgs.length - 1]?.id
        // Refresh daftar conv hanya jika ada pesan baru (badge unread), bukan sekadar ganti status
        if (lastPrevId !== lastNewId || prev.length !== newMsgs.length) loadConvs(false)
        return newMsgs
      })
    } catch { /* abaikan error network */ }
  }, [slug, loadConvs])

  useEffect(() => {
    if (activeId) loadDetail(activeId)
  }, [activeId, loadDetail])

  // Scroll ke bawah: instant saat pertama load, smooth saat pesan baru masuk
  const lastMsgId = msgs[msgs.length - 1]?.id
  const prevLoadingRef = useRef(false)
  useEffect(() => {
    // Selesai loading → scroll instant ke bawah
    if (prevLoadingRef.current && !loadingMsgs) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
    }
    prevLoadingRef.current = loadingMsgs
  }, [loadingMsgs])
  useEffect(() => {
    // Pesan baru masuk (poll) → scroll smooth
    if (!loadingMsgs && lastMsgId) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [lastMsgId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Polling setiap 5 detik — pakai pollMsgs yang ringan, bukan loadDetail
  useEffect(() => {
    if (!activeId) return
    const t = setInterval(() => pollMsgs(activeId), 5000)
    return () => clearInterval(t)
  }, [activeId, pollMsgs])

  // Poll unread summary lintas tab setiap 5 detik
  useEffect(() => {
    const poll = async () => {
      try {
        const res  = await fetch(`/api/${slug}/inbox/unread-summary`)
        const json = await res.json()
        if (json.success) setUnreadSummary(json.data)
      } catch { /* abaikan */ }
    }
    poll()
    const t = setInterval(poll, 5000)
    return () => clearInterval(t)
  }, [slug])

  function selectConv(id: string) {
    setActiveId(id)
    setMsgs([])
    setDetail(null)
    setDraft('')
    setShowAssign(false)
    setConvs(cs => cs.map(c => c.id === id ? { ...c, unread_count: 0 } : c))
  }

  async function send() {
    if (!draft.trim() || !activeId || sending) return
    setSending(true)
    const content = draft.trim()
    setDraft('')
    const optimistic: MsgRow = {
      id: 'opt-' + Date.now(), direction: 'outgoing', content,
      is_internal_note: isNote, status: isNote ? 'SENT' : 'PENDING', ai_generated: false,
      created_at: new Date().toISOString(),
    }
    setMsgs(m => [...m, optimistic])
    try {
      await fetch(`/api/${slug}/inbox/${activeId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, is_internal_note: isNote }),
      })
      await pollMsgs(activeId)
      loadConvs()
    } finally { setSending(false) }
  }

  async function sendMedia(mediaUrl: string, mediaType: 'image'|'document'|'video', filename?: string, caption?: string) {
    if (!activeId || sending) return
    setSending(true)
    setShowAttach(false)
    const optimistic: MsgRow = {
      id: 'opt-' + Date.now(), direction: 'outgoing',
      content: caption || filename || 'Lampiran',
      media_url: mediaUrl, media_type: mediaType,
      is_internal_note: false, status: 'PENDING', ai_generated: false,
      created_at: new Date().toISOString(),
    }
    setMsgs(m => [...m, optimistic])
    try {
      await fetch(`/api/${slug}/inbox/${activeId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content:        caption || '',
          is_internal_note: false,
          media_url:      mediaUrl,
          media_type:     mediaType,
          media_filename: filename,
        }),
      })
      await pollMsgs(activeId)
      loadConvs()
    } finally { setSending(false) }
  }

  async function handleFileUpload(file: File) {
    if (!activeId) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res  = await fetch(`/api/${slug}/inbox/upload`, { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok || !json.url) { alert(json.error || 'Gagal upload'); return }
      await sendMedia(json.url, json.mediaType, json.filename, draft.trim() || undefined)
    } finally { setUploading(false) }
  }

  async function loadFlyers() {
    setFlyersLoading(true)
    try {
      const p = flyerQ ? `?q=${encodeURIComponent(flyerQ)}` : ''
      const res  = await fetch(`/api/${slug}/eflyer${p}`)
      const json = await res.json()
      setFlyers(json.items ?? [])
    } catch { setFlyers([]) }
    finally { setFlyersLoading(false) }
  }

  async function patchStatus(status: string) {
    if (!activeId) return
    await fetch(`/api/${slug}/inbox/${activeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setDetail(d => d ? { ...d, status } : d)
    setConvs(cs => cs.map(c => c.id === activeId ? { ...c, status } : c))
  }

  async function assignTo(agentId: string) {
    if (!activeId) return
    await fetch(`/api/${slug}/inbox/${activeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_to: agentId }),
    })
    setShowAssign(false)
    loadConvs()
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const SIDEBAR_W = 360
  const INFO_W    = 300
  // 100dvh = dynamic viewport height: mengecil otomatis saat keyboard iOS muncul
  // Di mobile dikurangi 56px (tinggi top bar)
  const TOTAL_H = isMobile ? 'calc(100dvh - 56px)' : 'calc(100vh)'

  // Mobile: tampilkan 1 panel sekaligus
  // panel='list' | 'chat' | 'info'
  const mobilePanel = !isMobile ? null
    : showInfo && activeId ? 'info'
    : activeId ? 'chat'
    : 'list'

  // Helper: apakah panel visible
  const show = (p: 'list' | 'chat' | 'info') =>
    !isMobile || mobilePanel === p

  // Di mobile: gunakan position fixed agar tidak bisa di-scroll oleh halaman
  const containerStyle: React.CSSProperties = isMobile
    ? { position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, display: 'flex', background: WA_BG, overflow: 'hidden', zIndex: 10 }
    : { display: 'flex', height: TOTAL_H, overflow: 'hidden', flex: 1, background: WA_BG, position: 'relative' }

  return (
    <div style={containerStyle}>

      {/* ══════════════════════════════════
          PANEL 1 — Conversation list
      ══════════════════════════════════ */}
      <div style={{
        width: isMobile ? '100%' : SIDEBAR_W,
        flexShrink: 0,
        borderRight: isMobile ? 'none' : '1px solid #D1D7DB',
        display: show('list') ? 'flex' : 'none',
        flexDirection: 'column',
        background: 'white',
        ...(isMobile ? { position: 'absolute', inset: 0, zIndex: 1 } : {}),
      }}>
        {/* Header */}
        <div style={{
          background: '#F0F2F5', padding: '10px 16px',
          display: 'flex', alignItems: 'center',
        }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#111B21' }}>Inbox</div>
        </div>

        {/* Search */}
        <div style={{ padding: '8px 12px', background: '#F0F2F5' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#667781' }}>🔍</span>
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder="Cari nama / nomor HP..."
              style={{
                width: '100%', padding: '8px 12px 8px 32px', fontFamily: 'inherit',
                fontSize: 13, border: 'none', borderRadius: 8,
                background: 'white', color: '#111B21', outline: 'none', boxSizing: 'border-box',
              }} />
          </div>
        </div>

        {/* Channel tabs */}
        {(() => {
          const unreadPerCh: Record<string, number> = {}
          convs.forEach(c => { if (c.unread_count > 0) unreadPerCh[c.channel] = (unreadPerCh[c.channel] || 0) + c.unread_count })
          const totalUnread = Object.values(unreadPerCh).reduce((a, b) => a + b, 0)

          type ChDef = { key: string; label: string; color: string; bg: string; renderIcon: (active: boolean) => React.ReactNode }
          const channels: ChDef[] = [
            {
              key: '', label: 'Semua', color: '#41525D', bg: '#E9EDEF',
              renderIcon: (active) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {[12, 8, 10].map((w, i) => (
                    <div key={i} style={{ width: w, height: 2, borderRadius: 1, background: active ? '#41525D' : '#94A3B8' }} />
                  ))}
                </div>
              ),
            },
            {
              key: 'WA', label: 'WhatsApp', color: '#25D366', bg: '#E8F5E9',
              renderIcon: (active) => <FaWhatsapp size={18} color={active ? '#25D366' : '#94A3B8'} />,
            },
            {
              key: 'IG', label: 'Instagram', color: '#C13584', bg: '#FCE4EC',
              renderIcon: (active) => <FaInstagram size={18} color={active ? '#C13584' : '#94A3B8'} />,
            },
            {
              key: 'FB', label: 'Facebook', color: '#1877F2', bg: '#E3F2FD',
              renderIcon: (active) => <FaFacebook size={18} color={active ? '#1877F2' : '#94A3B8'} />,
            },
          ]

          return (
            <div style={{ display: 'flex', background: 'white', borderBottom: '1px solid #E9EDEF', padding: '0 4px' }}>
              {channels.map(ch => {
                const active  = channelFilter === ch.key
                const unread  = ch.key === '' ? totalUnread : (unreadPerCh[ch.key] || 0)
                return (
                  <button key={ch.key} onClick={() => setChannelFilter(ch.key)} style={{
                    flex: 1, padding: '9px 4px 8px', cursor: 'pointer',
                    border: 'none', borderBottom: active ? `2.5px solid ${ch.color}` : '2.5px solid transparent',
                    background: 'transparent', fontFamily: 'inherit',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    transition: 'all 0.15s',
                  }}>
                    {/* Circle icon */}
                    <div style={{ position: 'relative', display: 'inline-flex' }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: active ? ch.bg : '#F0F2F5',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.15s',
                      }}>
                        {ch.renderIcon(active)}
                      </div>
                      {/* Unread dot — merah jika ada unread di channel ini dan tidak sedang aktif */}
                      {unread > 0 && !active && (
                        <span style={{
                          position: 'absolute', top: -1, right: -1,
                          width: 11, height: 11, borderRadius: '50%',
                          background: '#EF4444', border: '1.5px solid white',
                        }} />
                      )}
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: active ? 700 : 500,
                      color: active ? ch.color : '#667781', lineHeight: 1,
                    }}>
                      {ch.label}
                    </span>
                  </button>
                )
              })}
            </div>
          )
        })()}

        {/* Status tabs */}
        {(() => {
          return (
            <div style={{ display: 'flex', borderBottom: '1px solid #E9EDEF', background: 'white' }}>
              {(['OPEN', 'PENDING', 'RESOLVED'] as const).map((s) => {
                const label   = s === 'OPEN' ? 'Terbuka' : s === 'PENDING' ? 'Menunggu' : 'Selesai'
                const unread  = unreadSummary[s] || 0
                const active  = statusFilter === s
                return (
                  <button key={s} onClick={() => setStatusFilter(s)} style={{
                    flex: 1, padding: '9px 4px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: 'none', background: 'transparent', fontFamily: 'inherit',
                    color: active ? WA_GREEN : '#667781',
                    borderBottom: active ? `2px solid ${WA_GREEN}` : '2px solid transparent',
                    transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  }}>
                    {label}
                    {unread > 0 && (
                      <span style={{
                        background: '#EF4444', color: 'white',
                        borderRadius: 99, fontSize: 10, fontWeight: 700,
                        padding: '1px 5px', minWidth: 16, textAlign: 'center', lineHeight: '16px',
                      }}>
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })()}

        {/* Conversation list */}
        <div style={{ flex: 1, overflowY: 'auto', background: 'white' }}>
          {loadingConvs ? (
            <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: '#667781' }}>Memuat...</div>
          ) : convs.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#667781' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>💬</div>
              Tidak ada percakapan
            </div>
          ) : convs.map(c => {
            const active  = c.id === activeId
            const lastMsg = c.messages[0]
            const name    = c.person?.name ?? c.channel_user_id
            const preview = lastMsg
              ? (lastMsg.is_internal_note ? '📝 ' : lastMsg.direction === 'outgoing' ? '✓ ' : '') + lastMsg.content.slice(0, 52) + (lastMsg.content.length > 52 ? '…' : '')
              : ''

            /* Channel badge saat mode "Semua" */
            const CH_BADGE: Record<string, { label: string; color: string; bg: string }> = {
              WA: { label: 'WhatsApp',  color: '#1a7d4a', bg: '#dcf8c6' },
              IG: { label: 'Instagram', color: '#8e24aa', bg: '#f3e5f5' },
              FB: { label: 'Facebook',  color: '#1565c0', bg: '#e3f2fd' },
            }
            const chBadge = !channelFilter ? CH_BADGE[c.channel] : null

            return (
              <button key={c.id} onClick={() => selectConv(c.id)} style={{
                width: '100%', padding: '12px 16px', textAlign: 'left',
                border: 'none', borderBottom: '1px solid #F0F2F5', cursor: 'pointer', fontFamily: 'inherit',
                background: active ? '#F0F2F5' : 'white',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                {/* Avatar dengan dot channel di sudut kanan bawah */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <Avatar name={name} size={48} bg={CH_COLOR[c.channel] ?? WA_GREEN_DARK} />
                  {!channelFilter && (
                    <div style={{
                      position: 'absolute', bottom: 0, right: 0,
                      width: 18, height: 18, borderRadius: '50%',
                      background: CH_COLOR[c.channel] ?? '#667781',
                      border: '2px solid white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {c.channel === 'WA' && <FaWhatsapp size={10} color="white" />}
                      {c.channel === 'IG' && <FaInstagram size={10} color="white" />}
                      {c.channel === 'FB' && <FaFacebook size={10} color="white" />}
                    </div>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2, gap: 6 }}>
                    <span style={{
                      fontSize: 14, fontWeight: c.unread_count > 0 ? 700 : 500,
                      color: '#111B21', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                    }}>
                      {name}
                    </span>
                    <span style={{ fontSize: 11, color: c.unread_count > 0 ? WA_GREEN : '#667781', flexShrink: 0 }}>
                      {fmtTime(c.last_message_at)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* Channel badge (hanya di mode Semua) */}
                    {chBadge && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99, flexShrink: 0,
                        background: chBadge.bg, color: chBadge.color,
                      }}>
                        {chBadge.label}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#667781', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {preview || <span style={{ fontStyle: 'italic' }}>Belum ada pesan</span>}
                    </span>
                    {c.unread_count > 0 && (
                      <span style={{
                        background: WA_GREEN, color: 'white',
                        borderRadius: 99, fontSize: 11, fontWeight: 700,
                        padding: '1px 6px', flexShrink: 0, minWidth: 18, textAlign: 'center',
                      }}>
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ══════════════════════════════════
          PANEL 2 — Chat thread
      ══════════════════════════════════ */}
      <div style={{
        flex: isMobile ? 'none' : 1,
        display: show('chat') ? 'flex' : 'none',
        flexDirection: 'column', minWidth: 0,
        ...(isMobile ? { position: 'absolute', inset: 0, zIndex: 2, height: '100%' } : {}),
      }}>
        {!activeId ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: '#F0F2F5', color: '#667781',
          }}>
            <div style={{ fontSize: 72, marginBottom: 20, opacity: 0.25 }}>💬</div>
            <div style={{ fontSize: 22, fontWeight: 300, color: '#41525D', marginBottom: 8 }}>CRM 360 Inbox</div>
            <div style={{ fontSize: 14, color: '#667781' }}>Pilih percakapan untuk memulai</div>
          </div>
        ) : (
          <>
            {/* Chat header — flexShrink 0 agar tidak ikut scroll */}
            <div style={{
              background: '#F0F2F5',
              borderBottom: '1px solid #E9EDEF',
              flexShrink: 0,
            }}>
              {/* ── Baris 1: Identitas ── */}
              <div style={{
                padding: '10px 12px 8px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                {/* Back button (mobile) */}
                {isMobile && (
                  <button onClick={() => setActiveId(null)} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: WA_GREEN_DARK, fontSize: 24, padding: '0 2px',
                    display: 'flex', alignItems: 'center', flexShrink: 0,
                  }}>‹</button>
                )}

                {/* Avatar dengan channel dot */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <Avatar
                    name={detail?.person?.name ?? detail?.channel_user_id ?? '?'}
                    size={44}
                    bg={CH_COLOR[detail?.channel ?? ''] ?? WA_GREEN_DARK}
                  />
                  {detail?.channel && (
                    <div style={{
                      position: 'absolute', bottom: 0, right: 0,
                      width: 17, height: 17, borderRadius: '50%',
                      background: CH_COLOR[detail.channel] ?? '#667781',
                      border: '2px solid #F0F2F5',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {detail.channel === 'WA' && <FaWhatsapp size={9} color="white" />}
                      {detail.channel === 'IG' && <FaInstagram size={9} color="white" />}
                      {detail.channel === 'FB' && <FaFacebook size={9} color="white" />}
                    </div>
                  )}
                </div>

                {/* Nama + no HP — full flex */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 15, fontWeight: 700, color: '#111B21',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    lineHeight: 1.3,
                  }}>
                    {detail?.person?.name ?? detail?.channel_user_id ?? '…'}
                  </div>
                  <div style={{ fontSize: 12, color: '#667781', marginTop: 1 }}>
                    {detail?.person?.no_hp ?? detail?.channel_user_id ?? ''}
                    {detail?.person?.no_rm && (
                      <span style={{ marginLeft: 6, color: '#94A3B8' }}>RM {detail.person.no_rm}</span>
                    )}
                  </div>
                </div>

                {/* Action icons — kanan atas */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  {/* Assign agen */}
                  {canAssign && (
                    <div style={{ position: 'relative' }}>
                      <button onClick={() => setShowAssign(v => !v)} title="Assign ke agen" style={{
                        width: 34, height: 34, borderRadius: '50%',
                        border: 'none', background: 'rgba(0,0,0,0.06)',
                        color: '#41525D', fontSize: 15,
                        cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        👤
                      </button>
                      {showAssign && (
                        <div style={{
                          position: 'absolute', right: 0, top: '110%', zIndex: 50,
                          background: 'white', border: '1px solid #D1D7DB', borderRadius: 10,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.15)', minWidth: 200, overflow: 'hidden',
                        }}>
                          <div style={{ padding: '8px 14px 6px', fontSize: 11, fontWeight: 700, color: '#667781', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #F0F2F5' }}>
                            Assign ke Agen
                          </div>
                          {agents.length === 0 ? (
                            <div style={{ padding: '12px 16px', fontSize: 12, color: '#667781' }}>Tidak ada agen</div>
                          ) : agents.map(a => (
                            <button key={a.id} onClick={() => assignTo(a.id)} style={{
                              width: '100%', padding: '10px 16px', textAlign: 'left',
                              border: 'none', borderBottom: '1px solid #F0F2F5',
                              background: 'white', cursor: 'pointer', fontFamily: 'inherit',
                              fontSize: 13, color: '#111B21',
                            }}>
                              {a.name}
                              <div style={{ fontSize: 11, color: '#667781' }}>{a.email}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tombol info kontak */}
                  <button onClick={() => setShowInfo(v => !v)} title="Info kontak" style={{
                    width: 34, height: 34, borderRadius: '50%', border: 'none',
                    background: showInfo ? WA_GREEN + '22' : 'rgba(0,0,0,0.06)',
                    color: showInfo ? WA_GREEN_DARK : '#41525D',
                    fontSize: 17, cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    ℹ
                  </button>
                </div>
              </div>

              {/* ── Baris 2: Status + Agen strip ── */}
              {detail && (() => {
                const STATUS_CFG = {
                  OPEN:     { label: 'Terbuka',  dot: '#22C55E', color: '#166534', bg: '#DCFCE7' },
                  PENDING:  { label: 'Menunggu', dot: '#F59E0B', color: '#92400E', bg: '#FEF3C7' },
                  RESOLVED: { label: 'Selesai',  dot: '#94A3B8', color: '#475569', bg: '#F1F5F9' },
                }[detail.status] ?? { label: detail.status, dot: '#94A3B8', color: '#475569', bg: '#F1F5F9' }

                return (
                  <div style={{
                    padding: '5px 12px 7px',
                    display: 'flex', alignItems: 'center', gap: 8,
                    borderTop: '1px solid rgba(0,0,0,0.06)',
                  }}>
                    {/* Status pill — clickable */}
                    <div style={{ position: 'relative' }}>
                      <button onClick={() => setShowStatusModal(v => !v)} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 10px 3px 8px', borderRadius: 99,
                        background: STATUS_CFG.bg, border: 'none',
                        color: STATUS_CFG.color, fontSize: 11, fontWeight: 700,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_CFG.dot, flexShrink: 0 }} />
                        {STATUS_CFG.label}
                        <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
                      </button>

                      {/* Modal ubah status */}
                      {showStatusModal && (
                        <>
                          <div onClick={() => setShowStatusModal(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                          <div style={{
                            position: 'absolute', top: '110%', left: 0, zIndex: 50,
                            background: 'white', borderRadius: 12,
                            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                            border: '1px solid #E9EDEF',
                            minWidth: 210, overflow: 'hidden',
                          }}>
                            <div style={{ padding: '10px 16px 8px', fontSize: 11, fontWeight: 700, color: '#667781', textTransform: 'uppercase', letterSpacing: '0.6px', borderBottom: '1px solid #F0F2F5' }}>
                              Ubah Status
                            </div>
                            {([
                              { s: 'OPEN',     label: 'Terbuka',  icon: '🟢', desc: 'Aktif, perlu ditangani' },
                              { s: 'PENDING',  label: 'Menunggu', icon: '🟡', desc: 'Menunggu respons pasien' },
                              { s: 'RESOLVED', label: 'Selesai',  icon: '⚪', desc: 'Kasus selesai ditangani' },
                            ] as const).map(opt => (
                              <button
                                key={opt.s}
                                disabled={detail.status === opt.s}
                                onClick={() => { patchStatus(opt.s); setShowStatusModal(false) }}
                                style={{
                                  width: '100%', padding: '9px 16px', textAlign: 'left',
                                  border: 'none', background: detail.status === opt.s ? '#F8FAFC' : 'white',
                                  cursor: detail.status === opt.s ? 'default' : 'pointer',
                                  borderBottom: '1px solid #F0F2F5', fontFamily: 'inherit',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span style={{ fontSize: 15 }}>{opt.icon}</span>
                                  <div>
                                    <div style={{ fontSize: 13, fontWeight: detail.status === opt.s ? 700 : 500, color: '#111B21' }}>
                                      {opt.label}
                                      {detail.status === opt.s && <span style={{ fontSize: 10, color: '#94A3B8', marginLeft: 6, fontWeight: 400 }}>aktif</span>}
                                    </div>
                                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{opt.desc}</div>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Divider */}
                    <span style={{ color: '#D1D7DB' }}>·</span>

                    {/* Channel info */}
                    <span style={{ fontSize: 11, color: '#667781', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {detail.channel === 'WA' && <FaWhatsapp size={11} color="#25D366" />}
                      {detail.channel === 'IG' && <FaInstagram size={11} color="#C13584" />}
                      {detail.channel === 'FB' && <FaFacebook size={11} color="#1877F2" />}
                      {CH_LABEL[detail.channel] ?? detail.channel}
                    </span>

                    {/* Agen yang di-assign */}
                    {detail.assigned_user && (
                      <>
                        <span style={{ color: '#D1D7DB' }}>·</span>
                        <span style={{ fontSize: 11, color: '#667781' }}>
                          👤 {detail.assigned_user.name}
                        </span>
                      </>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Messages area — flex:1 + minHeight:0 wajib agar bisa shrink & scroll internal */}
            <div style={{
              flex: 1, minHeight: 0, overflowY: 'auto',
              padding: '8px 12px 12px',
              display: 'flex', flexDirection: 'column',
              background: WA_BG,
            }}>
              {loadingMsgs ? (
                <div style={{ textAlign: 'center', padding: 32, color: '#667781', fontSize: 13 }}>Memuat pesan...</div>
              ) : msgs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#667781', fontSize: 13 }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>👋</div>
                  Belum ada pesan
                </div>
              ) : msgs.map((m, idx) => {
                const isOut   = m.direction === 'outgoing'
                const isNote  = m.is_internal_note
                const nextMsg = msgs[idx + 1]
                const prevMsg = msgs[idx - 1]

                // Grouping: pesan terakhir dalam kelompok arah yang sama
                const isLastInGroup = !nextMsg
                  || nextMsg.direction !== m.direction
                  || nextMsg.is_internal_note !== m.is_internal_note

                // Pesan pertama dalam kelompok (untuk gap atas lebih besar)
                const isFirstInGroup = !prevMsg
                  || prevMsg.direction !== m.direction
                  || prevMsg.is_internal_note !== m.is_internal_note

                const showDate = idx === 0
                  || new Date(m.created_at).toDateString() !== new Date(msgs[idx - 1].created_at).toDateString()

                // Radius: hanya pesan terakhir kelompok yang punya "ekor"
                const radiusIn  = isLastInGroup ? '8px 8px 8px 0px'  : '8px 8px 8px 8px'
                const radiusOut = isLastInGroup ? '8px 8px 0px 8px'  : '8px 8px 8px 8px'

                return (
                  <div key={m.id} style={{ marginTop: isFirstInGroup && idx > 0 ? 8 : 2 }}>
                    {/* Pemisah tanggal */}
                    {showDate && (
                      <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0 8px' }}>
                        <span style={{
                          background: 'rgba(255,255,255,0.9)', color: '#667781',
                          fontSize: 11.5, fontWeight: 600, padding: '4px 16px', borderRadius: 99,
                          boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                        }}>
                          {new Date(m.created_at).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                      </div>
                    )}

                    {/* Catatan internal */}
                    {isNote ? (
                      <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
                        <div style={{
                          background: '#FFF9C4', border: '1px dashed #F9A825',
                          borderRadius: 8, padding: '6px 14px',
                          fontSize: 12, color: '#795548', maxWidth: '85%',
                          boxShadow: '0 1px 1px rgba(0,0,0,0.08)',
                        }}>
                          📝 <strong>Catatan:</strong> {m.content}
                          <span style={{ fontSize: 10, color: '#A1887F', marginLeft: 8 }}>{fmtBubble(m.created_at)}</span>
                        </div>
                      </div>
                    ) : (
                      /* Baris bubble */
                      <div style={{
                        display: 'flex',
                        flexDirection: isOut ? 'row-reverse' : 'row',
                        alignItems: 'flex-end',
                        gap: 4,
                        paddingLeft:  isOut ? 40 : 0,
                        paddingRight: isOut ? 0  : 40,
                      }}>
                        {/* Avatar — hanya tampil di pesan terakhir kelompok incoming */}
                        {!isOut && (
                          <div style={{ width: 28, flexShrink: 0, display: 'flex', alignItems: 'flex-end' }}>
                            {isLastInGroup
                              ? <Avatar name={detail?.person?.name ?? '?'} size={28} bg={WA_GREEN_DARK} />
                              : null
                            }
                          </div>
                        )}

                        {/* Bubble */}
                        <div style={{
                          maxWidth: '78%',
                          background: isOut ? WA_GREEN_LIGHT : 'white',
                          color: '#111B21',
                          borderRadius: isOut ? radiusOut : radiusIn,
                          padding: '6px 10px 4px 10px',
                          fontSize: 14.5,
                          lineHeight: 1.45,
                          boxShadow: '0 1px 1px rgba(0,0,0,0.10)',
                          wordBreak: 'break-word',
                          position: 'relative',
                        }}>
                          {m.ai_generated && (
                            <div style={{ fontSize: 10, color: '#667781', marginBottom: 2 }}>🤖 AI</div>
                          )}
                          {m.media_url && m.media_type === 'image' && (
                            <a href={m.media_url} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: m.content ? 6 : 2 }}>
                              <img src={m.media_url} alt="lampiran" style={{ maxWidth: 240, maxHeight: 280, borderRadius: 8, display: 'block' }} />
                            </a>
                          )}
                          {m.content}
                          {m.media_url && m.media_type !== 'image' && (
                            <a href={m.media_url} target="_blank" rel="noreferrer" style={{
                              display: 'block', marginTop: 4, fontSize: 11, color: WA_GREEN_DARK,
                            }}>{m.media_type === 'video' ? '🎬 Video' : '📎 Dokumen'}</a>
                          )}
                          {/* Timestamp + centang — inline di kanan bawah teks */}
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 2,
                            fontSize: 10.5, color: isOut ? '#4a9e6a' : '#8696a0',
                            float: 'right', marginLeft: 8, marginTop: 2, lineHeight: 1,
                            position: 'relative', bottom: -1,
                          }}>
                            {fmtBubble(m.created_at)}
                            {isOut && !m.is_internal_note && (
                              m.status === 'FAILED'
                                ? <span title="Gagal terkirim" style={{ color: '#EF4444', fontSize: 12, fontWeight: 700 }}> ⚠</span>
                                : m.status === 'PENDING'
                                ? <span title="Mengirim…" style={{ color: '#8696a0', fontSize: 12 }}> 🕐</span>
                                : <span style={{ color: m.status === 'READ' ? '#53BDEB' : '#8696a0', fontSize: 13 }}>
                                    {m.status === 'SENT' ? ' ✓' : ' ✓✓'}
                                  </span>
                            )}
                          </span>
                          <div style={{ clear: 'both' }} />
                        </div>
                      </div>
                    )}

                    {/* Nama sender (agen) */}
                    {m.sender && isLastInGroup && (
                      <div style={{
                        fontSize: 10, color: '#667781',
                        paddingLeft: isOut ? 0 : 36,
                        textAlign: isOut ? 'right' : 'left',
                        paddingRight: isOut ? 4 : 0,
                        marginTop: 1,
                      }}>
                        {m.sender.name}
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input bar — flexShrink 0 agar selalu di bawah */}
            <div style={{ background: '#F0F2F5', padding: '8px 12px', borderTop: '1px solid #E9EDEF', flexShrink: 0, position: 'relative' }}>
              {/* Note / reply toggle */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {([
                  { val: false, label: '💬 Balas' },
                  { val: true,  label: '📝 Catatan Internal' },
                ] as const).map(o => (
                  <button key={String(o.val)} onClick={() => setIsNote(o.val)} style={{
                    padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    borderRadius: 99, fontFamily: 'inherit',
                    border: isNote === o.val
                      ? `1.5px solid ${o.val ? '#F9A825' : WA_GREEN}`
                      : '1.5px solid #D1D7DB',
                    background: isNote === o.val
                      ? (o.val ? '#FFF9C4' : WA_GREEN_LIGHT)
                      : 'white',
                    color: isNote === o.val
                      ? (o.val ? '#795548' : WA_GREEN_DARK)
                      : '#667781',
                  }}>
                    {o.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                {/* Tombol lampiran */}
                {!isNote && (
                  <button
                    onClick={() => { setShowAttach(v => !v); if (!showAttach && attachTab === 'eflyer') loadFlyers() }}
                    title="Lampiran"
                    style={{
                      width: 40, height: 40, borderRadius: '50%', border: '1.5px solid #D1D7DB',
                      background: showAttach ? '#E9EDEF' : 'white', color: '#54656F', fontSize: 18,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >📎</button>
                )}

                <div style={{
                  flex: 1, background: 'white', borderRadius: 24,
                  display: 'flex', alignItems: 'flex-end', padding: '4px 14px',
                  border: `1.5px solid ${isNote ? '#F9A825' : '#D1D7DB'}`,
                }}>
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder={isNote ? 'Catatan internal...' : 'Ketik pesan...'}
                    rows={1}
                    style={{
                      flex: 1, padding: '7px 0', fontFamily: 'inherit',
                      fontSize: 14, border: 'none', outline: 'none',
                      background: 'transparent', color: '#111B21',
                      lineHeight: 1.5, resize: 'none', maxHeight: 120, overflowY: 'auto',
                    }}
                  />
                </div>

                <button onClick={send} disabled={!draft.trim() || sending} style={{
                  width: 48, height: 48, borderRadius: '50%', border: 'none',
                  background: draft.trim() && !sending ? WA_GREEN : '#D1D7DB',
                  color: 'white', fontSize: 20, cursor: draft.trim() && !sending ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'background 0.2s',
                }}>
                  {sending ? '⏳' : isNote ? '📝' : '➤'}
                </button>
              </div>

              {/* Modal lampiran */}
              {showAttach && !isNote && (
                <div style={{
                  position: 'absolute', bottom: 80, left: 12, right: 12,
                  background: 'white', borderRadius: 16,
                  boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
                  border: '1px solid #E9EDEF', overflow: 'hidden', zIndex: 20,
                }}>
                  {/* Tab bar */}
                  <div style={{ display: 'flex', borderBottom: '1px solid #E9EDEF' }}>
                    {(['gallery', ...(eflyerEnabled ? ['eflyer'] : [])] as const).map(tab => (
                      <button key={tab} onClick={() => {
                        setAttachTab(tab as any)
                        if (tab === 'eflyer' && flyers.length === 0) loadFlyers()
                      }} style={{
                        flex: 1, padding: '12px 8px', border: 'none', fontFamily: 'inherit',
                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        background: attachTab === tab ? 'white' : '#F8F9FA',
                        color: attachTab === tab ? WA_GREEN_DARK : '#667781',
                        borderBottom: attachTab === tab ? `2px solid ${WA_GREEN}` : '2px solid transparent',
                      }}>
                        {tab === 'gallery' ? '🖼 Galeri HP' : '📋 E-Flyer'}
                      </button>
                    ))}
                    <button onClick={() => setShowAttach(false)} style={{
                      padding: '12px 14px', border: 'none', background: 'transparent',
                      fontSize: 18, color: '#667781', cursor: 'pointer',
                    }}>✕</button>
                  </div>

                  {/* Tab: Galeri HP */}
                  {attachTab === 'gallery' && (
                    <div style={{ padding: 20, textAlign: 'center' }}>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,application/pdf,video/mp4,video/3gpp"
                        style={{ display: 'none' }}
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (file) handleFileUpload(file)
                          e.target.value = ''
                        }}
                      />
                      <div style={{ fontSize: 40, marginBottom: 8 }}>📁</div>
                      <div style={{ fontSize: 13, color: '#667781', marginBottom: 16 }}>
                        Pilih gambar, PDF, atau video dari perangkat Anda
                      </div>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        style={{
                          padding: '10px 24px', borderRadius: 99, border: 'none',
                          background: uploading ? '#D1D7DB' : WA_GREEN, color: 'white',
                          fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                          cursor: uploading ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {uploading ? 'Mengupload…' : 'Pilih File'}
                      </button>
                      <div style={{ fontSize: 11, color: '#AAB8C2', marginTop: 8 }}>
                        Maks. 16 MB · JPG, PNG, GIF, WebP, PDF, MP4
                      </div>
                    </div>
                  )}

                  {/* Tab: E-Flyer */}
                  {attachTab === 'eflyer' && (
                    <div style={{ maxHeight: 380, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ padding: '10px 12px', borderBottom: '1px solid #F0F2F5' }}>
                        <input
                          value={flyerQ}
                          onChange={e => setFlyerQ(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') loadFlyers() }}
                          placeholder="Cari flyer… (Enter untuk cari)"
                          style={{
                            width: '100%', padding: '7px 12px', borderRadius: 99,
                            border: '1.5px solid #D1D7DB', fontSize: 13,
                            fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                        {flyersLoading ? (
                          <div style={{ textAlign: 'center', padding: 24, color: '#667781', fontSize: 13 }}>
                            Memuat flyer…
                          </div>
                        ) : flyers.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: 24, color: '#AAB8C2', fontSize: 13 }}>
                            Tidak ada flyer tersedia
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
                            {flyers.map(f => (
                              <div
                                key={f.id}
                                onClick={() => sendMedia(f.preview_url, 'image', f.title, draft.trim() || f.title)}
                                style={{
                                  cursor: 'pointer', borderRadius: 10, overflow: 'hidden',
                                  border: '1.5px solid #E9EDEF', background: '#F8F9FA',
                                  transition: 'border-color 0.15s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.borderColor = WA_GREEN)}
                                onMouseLeave={e => (e.currentTarget.style.borderColor = '#E9EDEF')}
                              >
                                <img
                                  src={f.preview_url}
                                  alt={f.title}
                                  style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: 'block' }}
                                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                                />
                                <div style={{
                                  padding: '6px 8px', fontSize: 11, fontWeight: 600,
                                  color: '#111B21', lineHeight: 1.3,
                                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>
                                  {f.title}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ══════════════════════════════════
          PANEL 3 — Contact info
      ══════════════════════════════════ */}
      {activeId && showInfo && (
        <div style={{
          width: isMobile ? '100%' : INFO_W,
          flexShrink: 0,
          borderLeft: isMobile ? 'none' : '1px solid #E9EDEF',
          overflowY: 'auto', background: 'white',
          display: show('info') ? 'flex' : 'none',
          flexDirection: 'column',
          ...(isMobile ? { position: 'absolute', inset: 0, zIndex: 3 } : {}),
        }}>
          <div style={{ background: '#F0F2F5', padding: '12px 16px', borderBottom: '1px solid #E9EDEF', display: 'flex', alignItems: 'center', gap: 10 }}>
            {isMobile && (
              <button onClick={() => setShowInfo(false)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: WA_GREEN_DARK, fontSize: 22, padding: '0 4px', display: 'flex', alignItems: 'center',
              }}>‹</button>
            )}
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111B21' }}>Info Kontak</div>
          </div>

          {detail?.person ? (
            <>
              <div style={{ padding: 24, textAlign: 'center', borderBottom: '1px solid #F0F2F5' }}>
                <div style={{
                  width: 72, height: 72, borderRadius: '50%', background: WA_GREEN_DARK,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26, fontWeight: 700, color: 'white', margin: '0 auto 12px',
                }}>
                  {initials(detail.person.name)}
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#111B21', marginBottom: 4 }}>{detail.person.name}</div>
                <div style={{ fontSize: 13, color: '#667781' }}>{detail.person.no_hp}</div>
                {detail.person.no_rm && (
                  <div style={{ fontSize: 12, color: '#667781', marginTop: 2 }}>RM: {detail.person.no_rm}</div>
                )}
                <div style={{ marginTop: 14 }}>
                  <Link href={`/${slug}/pasien/${detail.person.id}`} style={{
                    display: 'inline-block', padding: '7px 18px', borderRadius: 8,
                    background: WA_GREEN, color: 'white',
                    fontSize: 13, fontWeight: 600, textDecoration: 'none',
                  }}>
                    Lihat Profil →
                  </Link>
                </div>
              </div>

              {detail.person.tags.length > 0 && (
                <div style={{ padding: 16, borderBottom: '1px solid #F0F2F5' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#667781', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>Tag</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {detail.person.tags.map((pt, i) => (
                      <TagChip key={i} name={pt.tag.name} warna={pt.tag.warna} sumber={pt.sumber} />
                    ))}
                  </div>
                </div>
              )}

              {/* Riwayat Kunjungan */}
              <div style={{ padding: 16, borderBottom: '1px solid #F0F2F5' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#667781', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>
                  Riwayat Kunjungan
                  {detail.person.visits.length > 0 && (
                    <span style={{ marginLeft: 6, fontWeight: 400, color: '#B0BEC5', textTransform: 'none', letterSpacing: 0 }}>
                      ({detail.person.visits.length} terakhir)
                    </span>
                  )}
                </div>
                {detail.person.visits.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#B0BEC5', fontStyle: 'italic' }}>Belum ada riwayat kunjungan</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {detail.person.visits.map((v, i) => {
                      const unitColor: Record<string, { bg: string; color: string }> = {
                        RAWAT_JALAN:  { bg: '#E0F4F4', color: '#006E89' },
                        RAWAT_INAP:   { bg: '#EDE7F6', color: '#512DA8' },
                        IGD:          { bg: '#FFEBEE', color: '#C62828' },
                        PENUNJANG:    { bg: '#FFF3E0', color: '#E65100' },
                        PONDOK_SEHAT: { bg: '#E8F5E9', color: '#278B58' },
                        ONE_DAY_CARE: { bg: '#E3F2FD', color: '#1565C0' },
                        HOME_CARE:    { bg: '#FCE4EC', color: '#AD1457' },
                      }
                      const uc = unitColor[v.unit] ?? { bg: '#F0F2F5', color: '#41525D' }
                      const unitLabel: Record<string, string> = {
                        RAWAT_JALAN: 'Rawat Jalan', RAWAT_INAP: 'Rawat Inap',
                        IGD: 'IGD', PENUNJANG: 'Penunjang',
                        PONDOK_SEHAT: 'Pondok Sehat', ONE_DAY_CARE: 'One Day Care',
                        HOME_CARE: 'Home Care',
                      }
                      return (
                        <div key={i} style={{
                          background: '#F8FAFC', borderRadius: 8, padding: '10px 12px',
                          borderLeft: `3px solid ${uc.color}`,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#111B21' }}>
                              {new Date(v.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: uc.bg, color: uc.color }}>
                              {unitLabel[v.unit] ?? v.unit}
                            </span>
                          </div>
                          {v.poli && (
                            <div style={{ fontSize: 12, color: '#41525D', marginBottom: 2 }}>
                              🏥 {v.poli}
                            </div>
                          )}
                          {v.dokter && (
                            <div style={{ fontSize: 12, color: '#41525D', marginBottom: 2 }}>
                              👨‍⚕️ {v.dokter}
                            </div>
                          )}
                          {v.diagnosa_nama && (
                            <div style={{ fontSize: 11, color: '#667781', marginTop: 2 }}>
                              {v.diagnosa_nama}
                              {v.diagnosa_icd && <span style={{ marginLeft: 4, color: '#B0BEC5' }}>({v.diagnosa_icd})</span>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#667781', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>Aksi Cepat</div>
                <Link href={`/${slug}/broadcast/buat?person=${detail.person.id}`} style={{
                  display: 'block', padding: '10px 16px', borderRadius: 8,
                  background: WA_GREEN, color: 'white',
                  fontSize: 13, fontWeight: 600, textDecoration: 'none', textAlign: 'center',
                }}>
                  📢 Kirim Broadcast
                </Link>
              </div>
            </>
          ) : (
            <div style={{ padding: 32, textAlign: 'center', color: '#667781' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>👤</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111B21', marginBottom: 4 }}>Kontak tidak terdaftar</div>
              <div style={{ fontSize: 13, marginBottom: 20 }}>{detail?.channel_user_id}</div>
              <Link
                href={`/${slug}/pasien/tambah?no_hp=${encodeURIComponent(detail?.channel_user_id || '')}&dari=inbox`}
                style={{
                  display: 'inline-block', padding: '9px 20px', borderRadius: 8,
                  background: WA_GREEN, color: 'white',
                  fontSize: 13, fontWeight: 700, textDecoration: 'none',
                }}
              >
                ＋ Simpan Kontak
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
