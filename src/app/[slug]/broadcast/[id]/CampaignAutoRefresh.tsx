'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Polling ringan sisi klien untuk memperbarui data campaign otomatis:
 * - status RUNNING → refresh tiap 3 dtk (fase kirim)
 * - status DONE/FAILED → refresh tiap 5 dtk, maks ~1 menit (menangkap update delivery via webhook)
 * Berhenti setelah itu agar tidak polling selamanya.
 */
const POST_DONE_MAX = 12 // 12 × 5 dtk = 60 dtk

export default function CampaignAutoRefresh({ status }: { status: string }) {
  const router = useRouter()
  const [postTicks, setPostTicks] = useState(0)

  const isRunning = status === 'RUNNING'
  const isPostDone = (status === 'DONE' || status === 'FAILED') && postTicks < POST_DONE_MAX
  const active = isRunning || isPostDone

  useEffect(() => {
    if (!active) return
    const delay = isRunning ? 3000 : 5000
    const t = setTimeout(() => {
      router.refresh()
      if (!isRunning) setPostTicks(n => n + 1)
    }, delay)
    return () => clearTimeout(t)
  }, [active, isRunning, postTicks, router])

  if (!isRunning && !isPostDone) return null

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-xs)', color: 'var(--c-text-muted)' }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: '#F59E0B',
        display: 'inline-block', animation: 'pulse 1.2s ease-in-out infinite',
      }} />
      {isRunning ? 'Sedang mengirim — memperbarui otomatis…' : 'Memantau status pengiriman…'}
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
    </span>
  )
}
