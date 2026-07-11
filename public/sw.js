const CACHE_NAME = 'crm360-v2'
const OFFLINE_URL = '/offline'

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

// Push notification masuk — dipakai saat HP tidak membuka CRM (background)
self.addEventListener('push', (e) => {
  if (!e.data) return
  const data = e.data.json()

  const options = {
    body:              data.body || 'Ada pesan baru masuk',
    icon:              '/icons/icon-192x192.png',
    badge:             '/icons/icon-96x96.png',
    tag:               data.tag || 'crm360-inbox',
    renotify:          true,   // mainkan suara meski tag sama (pesan berikutnya)
    requireInteraction: true,  // notifikasi tidak hilang otomatis sampai diklik
    data:              { url: data.url || '/' },
    // Pola getar panjang: getar-jeda-getar-jeda-getar (terasa di saku)
    vibrate:           [400, 150, 400, 150, 600],
    actions: [
      { action: 'open',    title: '💬 Buka Inbox' },
      { action: 'dismiss', title: 'Tutup' },
    ],
  }

  e.waitUntil(self.registration.showNotification(data.title || '💬 Pesan Masuk — CRM 360 RKZ', options))
})

// Klik notifikasi → buka / fokus tab inbox
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
