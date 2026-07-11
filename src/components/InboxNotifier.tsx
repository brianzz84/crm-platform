'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const POLL_INTERVAL = 30_000 // 30 detik

interface Props {
  slug:        string
  canViewInbox: boolean
}

export default function InboxNotifier({ slug, canViewInbox }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const [total, setTotal]     = useState(0)
  const [visible, setVisible] = useState(false)
  const [preview, setPreview] = useState<string>('')
  const prevTotal    = useRef(0)
  const audioRef     = useRef<AudioContext | null>(null)
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)

  const playDing = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15)
      gain.gain.setValueAtTime(0.4, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.4)
    } catch {
      // Browser memblokir AudioContext — tidak apa-apa
    }
  }, [])

  const fetchUnread = useCallback(async () => {
    if (!canViewInbox) return
    try {
      const res  = await fetch(`/api/${slug}/inbox/unread-summary`, { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      const data = json.data as Record<string, number>
      const newTotal = (data.OPEN ?? 0) + (data.PENDING ?? 0)

      setTotal(newTotal)

      // Broadcast ke komponen lain (misal Sidebar) via custom event
      window.dispatchEvent(new CustomEvent('inbox:unread', { detail: { total: newTotal } }))

      if (newTotal > prevTotal.current && prevTotal.current >= 0) {
        const diff = newTotal - prevTotal.current
        setPreview(`${diff} pesan baru masuk`)
        setVisible(true)
        playDing()
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setVisible(false), 5000)
      }

      prevTotal.current = newTotal
    } catch { /* network error — abaikan */ }
  }, [slug, canViewInbox, playDing])

  // Polling
  useEffect(() => {
    fetchUnread()
    const id = setInterval(fetchUnread, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [fetchUnread])

  // Refresh saat kembali dari inbox
  useEffect(() => { fetchUnread() }, [pathname, fetchUnread])

  if (!canViewInbox) return null

  const onInboxPage = pathname.includes('/inbox')

  return (
    <>
      {/* Bell button — fixed di kanan atas */}
      <button
        onClick={() => router.push(`/${slug}/inbox`)}
        title={total > 0 ? `${total} percakapan belum dibaca` : 'Inbox'}
        style={{
          position:   'fixed', top: 14, right: 16, zIndex: 500,
          background: onInboxPage ? 'var(--c-secondary)' : 'var(--c-surface)',
          border:     `1.5px solid ${total > 0 ? 'var(--c-secondary)' : 'var(--c-border)'}`,
          borderRadius: '50%', width: 40, height: 40,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: total > 0 ? '0 2px 8px rgba(0,0,0,0.12)' : 'none',
          transition: 'all 0.2s',
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>💬</span>
        {total > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: '#EF4444', color: 'white',
            fontSize: 10, fontWeight: 800, lineHeight: 1,
            padding: '2px 5px', borderRadius: 99,
            minWidth: 16, textAlign: 'center',
            border: '2px solid var(--c-bg)',
          }}>
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {/* Toast notifikasi pesan baru */}
      {visible && (
        <div
          onClick={() => { setVisible(false); router.push(`/${slug}/inbox`) }}
          style={{
            position:   'fixed', bottom: 24, right: 16, zIndex: 600,
            background: 'var(--c-surface)', border: '1.5px solid var(--c-secondary)',
            borderRadius: 'var(--r-lg)', padding: '12px 16px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            cursor: 'pointer', maxWidth: 300,
            display: 'flex', alignItems: 'center', gap: 10,
            animation: 'slideUp 0.3s ease',
          }}
        >
          <span style={{ fontSize: 22 }}>💬</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--c-primary)' }}>
              Pesan Masuk
            </div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)' }}>
              {preview}
            </div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); setVisible(false) }}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-faint)', fontSize: 16, lineHeight: 1, flexShrink: 0 }}
          >×</button>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0 }
          to   { transform: translateY(0);    opacity: 1 }
        }
      `}</style>
    </>
  )
}
