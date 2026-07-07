'use client'

import { useEffect, useRef, useState } from 'react'
import './qr-display.css'

interface KegiatanInfo {
  id:              string
  nama:            string
  jenis:           string
  tanggal_mulai:   string
  tanggal_selesai: string | null
  lokasi:          string | null
  penyelenggara:   string | null
  keterangan:      string | null
  status:          string
  totalPeserta:    number
}

interface TenantInfo {
  slug:        string
  nama_klinik: string
  nama_rs:     string
  logo_url:    string | null
}

interface Props {
  kegiatan:    KegiatanInfo
  tenant:      TenantInfo
  checkinUrl:  string
  backUrl:     string
}

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export default function QrDisplayClient({ kegiatan: k, tenant, checkinUrl, backUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [qrLoaded, setQrLoaded] = useState(false)
  const [peserta, setPeserta] = useState(k.totalPeserta)

  // Generate QR code via qrcode library (loaded from CDN via script tag)
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js'
    script.onload = () => {
      if (canvasRef.current && (window as any).QRCode) {
        ;(window as any).QRCode.toCanvas(canvasRef.current, checkinUrl, {
          width:  360,
          margin: 2,
          color:  { dark: '#1E293B', light: '#ffffff' },
          errorCorrectionLevel: 'H',
        }, (err: any) => {
          if (!err) setQrLoaded(true)
        })
      }
    }
    document.head.appendChild(script)
    return () => { document.head.removeChild(script) }
  }, [checkinUrl])

  // Polling peserta setiap 15 detik saat status aktif
  useEffect(() => {
    if (k.status !== 'aktif') return
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`/api/${tenant.slug}/kegiatan/${k.id}`)
        if (r.ok) {
          const data = await r.json()
          if (typeof data.totalPeserta === 'number') setPeserta(data.totalPeserta)
        }
      } catch {}
    }, 15000)
    return () => clearInterval(iv)
  }, [k.id, k.status, tenant.slug])

  const sameDay = !k.tanggal_selesai ||
    fmtDate(k.tanggal_mulai) === fmtDate(k.tanggal_selesai)

  const jadwal = sameDay
    ? `${fmtDate(k.tanggal_mulai)}, ${fmtTime(k.tanggal_mulai)} WIB`
    : `${fmtDate(k.tanggal_mulai)} – ${fmtDate(k.tanggal_selesai!)}`

  return (
    <>

      <div className="qr-page">
        {/* Top bar */}
        <div className="qr-topbar">
          <a href={backUrl} className="qr-back">
            ← Kembali
          </a>
          <div className="qr-topbar-right">
            <button className="qr-btn qr-btn-outline" onClick={() => window.print()}>
              🖨 Print
            </button>
            <button
              className="qr-btn qr-btn-primary"
              onClick={() => {
                const canvas = canvasRef.current
                if (!canvas) return
                const a = document.createElement('a')
                a.download = `qr-${k.id.slice(0, 8)}.png`
                a.href = canvas.toDataURL()
                a.click()
              }}
            >
              ⬇ Unduh QR
            </button>
          </div>
        </div>

        {/* Main card */}
        <div className="qr-card">
          {/* Tenant header */}
          <div className="qr-header">
            <div className="qr-logo">
              {tenant.logo_url
                ? <img src={tenant.logo_url} alt={tenant.nama_klinik} />
                : <span>🏥</span>
              }
            </div>
            <div className="qr-header-text">
              <h1>{tenant.nama_rs}</h1>
              <p>{tenant.nama_klinik}</p>
            </div>
          </div>

          {/* Body */}
          <div className="qr-body">
            {/* Event title */}
            <div className="qr-event-title">
              <div className="jenis-badge">{k.jenis}</div>
              <h2>{k.nama}</h2>
            </div>

            {/* Meta info */}
            <div className="qr-meta">
              <div className="qr-meta-item">
                <span className="icon">📅</span>
                <strong>{jadwal}</strong>
              </div>
              {k.lokasi && (
                <div className="qr-meta-item">
                  <span className="icon">📍</span>
                  <span>{k.lokasi}</span>
                </div>
              )}
              {k.penyelenggara && (
                <div className="qr-meta-item">
                  <span className="icon">🏢</span>
                  <span>{k.penyelenggara}</span>
                </div>
              )}
            </div>

            <div className="qr-divider" />

            {/* QR Code */}
            <div className="qr-section">
              <div className="qr-instruction">
                <h3>Scan untuk Daftar</h3>
                <p>Arahkan kamera HP ke QR code di bawah</p>
              </div>

              <div className="qr-canvas-wrap">
                {!qrLoaded && (
                  <div className="qr-placeholder">Memuat QR…</div>
                )}
                <canvas
                  ref={canvasRef}
                  style={{ display: qrLoaded ? 'block' : 'none' }}
                />
              </div>

              <p className="qr-url">{checkinUrl}</p>

              {k.status === 'aktif' && (
                <div className="qr-counter">
                  <span className="dot" />
                  {peserta} peserta terdaftar
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
