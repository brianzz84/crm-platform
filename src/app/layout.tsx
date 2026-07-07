import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = {
  title:       { default: 'CRM 360 RKZ', template: '%s — CRM 360 RKZ' },
  description: 'Customer Relationship Management 360° RKZ Surabaya',
  manifest:    '/manifest.json',
  formatDetection: { telephone: false },
  appleWebApp: {
    capable:           true,
    statusBarStyle:    'black-translucent',
    title:             'CRM 360 RKZ',
  },
  icons: {
    icon:  '/icons/icon-192x192.png',
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor:      '#0F2744',
  width:           'device-width',
  initialScale:    1,
  minimumScale:    1,
  maximumScale:    1,
  userScalable:    false,
  viewportFit:     'cover',
  interactiveWidget: 'resizes-content',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={inter.className}>
      <body>{children}</body>
    </html>
  )
}
