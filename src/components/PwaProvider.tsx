'use client'

import { useEffect } from 'react'

export default function PwaProvider({ slug, logoUrl }: { slug: string; logoUrl?: string | null }) {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    async function setupPush() {
      try {
        // 1. Register SW
        const reg = await navigator.serviceWorker.register('/sw.js')
        console.log('[PWA] SW registered:', reg.scope)

        // 2. Minta izin notifikasi
        if (Notification.permission === 'default') {
          const perm = await Notification.requestPermission()
          console.log('[PWA] Permission:', perm)
          if (perm !== 'granted') return
        }
        if (Notification.permission !== 'granted') {
          console.log('[PWA] Permission not granted:', Notification.permission)
          return
        }

        // 3. Cek VAPID key
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidKey) {
          console.error('[PWA] NEXT_PUBLIC_VAPID_PUBLIC_KEY kosong!')
          return
        }
        console.log('[PWA] VAPID key tersedia, panjang:', vapidKey.length)

        // 4. Cek subscription yang sudah ada
        let sub = await reg.pushManager.getSubscription()
        if (!sub) {
          console.log('[PWA] Belum ada subscription, membuat baru...')
          sub = await reg.pushManager.subscribe({
            userVisibleOnly:      true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey),
          })
          console.log('[PWA] Subscription dibuat:', sub.endpoint.slice(0, 60) + '...')
        } else {
          console.log('[PWA] Subscription sudah ada:', sub.endpoint.slice(0, 60) + '...')
        }

        // 5. Simpan ke server
        const res = await fetch('/api/push/subscribe', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(sub.toJSON()),
        })
        const json = await res.json()
        console.log('[PWA] Subscribe API response:', json)
      } catch (err) {
        console.error('[PWA] Error:', err)
      }
    }

    setupPush()
  }, [slug])

  return null
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = window.atob(base64)
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)))
}
