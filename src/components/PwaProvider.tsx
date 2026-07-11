'use client'

import { useEffect, useState } from 'react'

type PushStatus = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'error' | 'no-vapid'

export default function PwaProvider({ slug }: { slug: string; logoUrl?: string | null }) {
  const [status, setStatus] = useState<PushStatus>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported'); return
    }

    async function setupPush() {
      try {
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidKey) { setStatus('no-vapid'); return }

        const reg = await navigator.serviceWorker.register('/sw.js')

        if (Notification.permission === 'denied') { setStatus('denied'); return }

        if (Notification.permission === 'default') {
          const perm = await Notification.requestPermission()
          if (perm !== 'granted') { setStatus('denied'); return }
        }

        let sub = await reg.pushManager.getSubscription()
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly:      true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey),
          })
        }

        await fetch('/api/push/subscribe', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(sub.toJSON()),
        })

        setStatus('subscribed')
        // Broadcast ke komponen lain
        window.dispatchEvent(new CustomEvent('push:status', { detail: { status: 'subscribed' } }))
      } catch (err: any) {
        console.error('[PWA]', err)
        setErrorMsg(err?.message || String(err))
        setStatus('error')
      }
    }

    setupPush()
  }, [slug])

  if (dismissed || status === 'loading' || status === 'subscribed') return null

  const banners: Record<string, { bg: string; border: string; color: string; icon: string; title: string; body: string; action?: string }> = {
    unsupported: {
      bg: '#FEF3C7', border: '#F59E0B', color: '#92400E', icon: '⚠️',
      title: 'Browser tidak support notifikasi push',
      body: 'Gunakan Chrome atau Edge terbaru di Android untuk menerima notifikasi pesan masuk.',
    },
    denied: {
      bg: '#FEF2F2', border: '#EF4444', color: '#B91C1C', icon: '🔕',
      title: 'Izin notifikasi diblokir',
      body: 'Anda tidak akan menerima notifikasi pesan masuk. Untuk mengaktifkan: buka pengaturan browser → izin situs → izinkan notifikasi untuk halaman ini.',
      action: 'Cara mengaktifkan',
    },
    'no-vapid': {
      bg: '#FEF3C7', border: '#F59E0B', color: '#92400E', icon: '⚙️',
      title: 'Konfigurasi push belum lengkap',
      body: 'VAPID key belum terpasang. Hubungi admin IT.',
    },
    error: {
      bg: '#FEF2F2', border: '#EF4444', color: '#B91C1C', icon: '❌',
      title: 'Gagal mengaktifkan notifikasi push',
      body: errorMsg || 'Terjadi kesalahan saat mendaftarkan notifikasi.',
    },
  }

  const b = banners[status]
  if (!b) return null

  return (
    <div style={{
      position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      zIndex: 700, width: 'calc(100% - 32px)', maxWidth: 480,
      background: b.bg, border: `1.5px solid ${b.border}`, borderRadius: 'var(--r-lg)',
      padding: '12px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{b.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: b.color, marginBottom: 2 }}>
          {b.title}
        </div>
        <div style={{ fontSize: 'var(--font-size-xs)', color: b.color, opacity: 0.85, lineHeight: 1.5 }}>
          {b.body}
        </div>
      </div>
      <button onClick={() => setDismissed(true)} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: b.color, fontSize: 18, lineHeight: 1, flexShrink: 0, opacity: 0.6,
      }}>×</button>
    </div>
  )
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = window.atob(base64)
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)))
}
