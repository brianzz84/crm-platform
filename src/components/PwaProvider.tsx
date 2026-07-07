'use client'

import { useEffect } from 'react'

export default function PwaProvider({ slug, logoUrl }: { slug: string; logoUrl?: string | null }) {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    // Register service worker
    navigator.serviceWorker.register('/sw.js').then(async (reg) => {
      // Minta izin notifikasi jika belum
      if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission()
        if (perm !== 'granted') return
      }
      if (Notification.permission !== 'granted') return

      // Subscribe push
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      // Kirim subscription ke server
      await fetch('/api/push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(sub.toJSON()),
      })
    }).catch(() => null)
  }, [slug])

  return null
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = window.atob(base64)
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)))
}
