'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface Props { slug: string; campaignId: string; status: string }

export default function CampaignActions({ slug, campaignId, status }: Props) {
  const router    = useRouter()
  const [busy, setBusy] = useState(false)

  async function patch(data: Record<string, unknown>) {
    setBusy(true)
    try {
      const res = await fetch(`/api/${slug}/broadcast/${campaignId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!json.success) alert('Gagal: ' + JSON.stringify(json.error))
      else router.refresh()
    } catch { alert('Terjadi kesalahan') }
    finally { setBusy(false) }
  }

  async function send(resend = false) {
    if (!confirm(resend ? 'Kirim ulang ke penerima yang gagal?' : 'Mulai kirim campaign ini sekarang?')) return
    setBusy(true)
    try {
      const res  = await fetch(`/api/${slug}/broadcast/${campaignId}/send`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || json.success === false) alert('Gagal: ' + (json.error ? JSON.stringify(json.error) : 'tidak diketahui'))
      else router.refresh()
    } catch { alert('Terjadi kesalahan') }
    finally { setBusy(false) }
  }

  async function del() {
    if (!confirm('Hapus campaign ini?')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/${slug}/broadcast/${campaignId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) alert('Gagal: ' + JSON.stringify(json.error))
      else router.push(`/${slug}/broadcast`)
    } catch { alert('Terjadi kesalahan') }
    finally { setBusy(false) }
  }

  const btn = (label: string, onClick: () => void, primary = false): React.ReactNode => (
    <button onClick={onClick} disabled={busy}
      style={{
        padding: '8px 16px', borderRadius: 'var(--r-md)', fontFamily: 'inherit',
        fontSize: 12, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer',
        border: primary ? 'none' : '1.5px solid var(--c-border)',
        background: primary ? 'var(--c-secondary)' : 'white',
        color: primary ? 'white' : 'var(--c-text)',
        opacity: busy ? 0.6 : 1,
      }}>
      {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
      {status === 'DRAFT' && (
        <>
          {btn('▶ Kirim Sekarang', () => send(false), true)}
          {btn('🗑 Hapus', del)}
        </>
      )}
      {status === 'SCHEDULED' && (
        <>
          {btn('⏸ Batalkan Jadwal', () => patch({ status: 'DRAFT' }))}
        </>
      )}
      {status === 'RUNNING' && (
        <span style={{ fontSize: 12, color: 'var(--c-text-muted)', alignSelf: 'center' }}>Campaign sedang berjalan...</span>
      )}
      {(status === 'DONE' || status === 'FAILED') && (
        <>
          {btn('🔁 Kirim Ulang Gagal', () => send(true), true)}
          <span style={{ fontSize: 12, color: 'var(--c-text-muted)', alignSelf: 'center' }}>Hanya penerima berstatus Gagal yang dikirim ulang.</span>
        </>
      )}
    </div>
  )
}
