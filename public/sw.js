const CACHE_NAME = 'crm360-v1'
const OFFLINE_URL = '/offline'

// Install — cache halaman offline
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(['/offline', '/icons/icon-192x192.png']))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Push notification masuk
self.addEventListener('push', (e) => {
  if (!e.data) return
  const data = e.data.json()

  const options = {
    body:    data.body || 'Ada pesan baru',
    icon:    '/icons/icon-192x192.png',
    badge:   '/icons/icon-96x96.png',
    tag:     data.tag || 'crm360-notif',
    data:    { url: data.url || '/' },
    vibrate: [200, 100, 200],
    actions: [
      { action: 'open',    title: 'Buka' },
      { action: 'dismiss', title: 'Tutup' },
    ],
  }

  e.waitUntil(self.registration.showNotification(data.title || 'CRM 360 RKZ', options))
})

// Klik notifikasi → buka tab / fokus ke tab yang sudah ada
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  if (e.action === 'dismiss') return

  const targetUrl = e.notification.data?.url || '/'

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(targetUrl) && 'focus' in c)
      if (existing) return existing.focus()
      return clients.openWindow(targetUrl)
    })
  )
})
