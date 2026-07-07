'use client'

import { useState } from 'react'
import './checkin.css'

interface KegiatanData {
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
  tenant: {
    slug:        string
    nama_klinik: string
    nama_rs:     string
    logo_url:    string | null
  }
}

type State = 'idle' | 'loading' | 'success' | 'already' | 'error' | 'closed'

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`
}

export default function CheckinClient({ data: k, token }: { data: KegiatanData; token: string }) {
  const [nama,    setNama]    = useState('')
  const [noHp,    setNoHp]    = useState('')
  const [state,   setState]   = useState<State>(k.status !== 'aktif' ? 'closed' : 'idle')
  const [resNama, setResNama] = useState('')
  const [errMsg,  setErrMsg]  = useState('')

  const sameDay = !k.tanggal_selesai || fmtDate(k.tanggal_mulai) === fmtDate(k.tanggal_selesai)
  const jadwal  = sameDay
    ? `${fmtDate(k.tanggal_mulai)}, ${fmtTime(k.tanggal_mulai)} WIB`
    : `${fmtDate(k.tanggal_mulai)} – ${fmtDate(k.tanggal_selesai!)}`

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nama.trim() || !noHp.trim()) return
    setState('loading')
    try {
      const r = await fetch(`/api/kegiatan/${token}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ nama: nama.trim(), no_hp: noHp.trim() }),
      })
      const json = await r.json()
      if (!r.ok) {
        setErrMsg(json.error || 'Terjadi kesalahan, coba lagi.')
        setState('error')
        return
      }
      setResNama(json.nama)
      setState(json.sudahDaftar ? 'already' : 'success')
    } catch {
      setErrMsg('Tidak dapat terhubung ke server. Periksa koneksi internet.')
      setState('error')
    }
  }

  return (
    <>

      <div className="ci-wrap">
        {/* Tenant identity */}
        <div className="ci-tenant">
          <div className="ci-logo">
            {k.tenant.logo_url
              ? <img src={k.tenant.logo_url} alt={k.tenant.nama_klinik} />
              : <span>🏥</span>
            }
          </div>
          <div>
            <div className="ci-tenant-name">{k.tenant.nama_rs}</div>
            <div className="ci-tenant-sub">{k.tenant.nama_klinik}</div>
          </div>
        </div>

        {/* Event info */}
        <div className="ci-event">
          <div className="ci-event-top">
            <div className="ci-badge">{k.jenis}</div>
            <div className="ci-event-nama">{k.nama}</div>
          </div>
          <div className="ci-event-body">
            <div className="ci-info-list">
              <div className="ci-info-row">
                <span className="ic">📅</span>
                <span><strong>{jadwal}</strong></span>
              </div>
              {k.lokasi && (
                <div className="ci-info-row">
                  <span className="ic">📍</span>
                  <span>{k.lokasi}</span>
                </div>
              )}
              {k.penyelenggara && (
                <div className="ci-info-row">
                  <span className="ic">🏢</span>
                  <span>{k.penyelenggara}</span>
                </div>
              )}
              {k.keterangan && (
                <div className="ci-info-row">
                  <span className="ic">📝</span>
                  <span>{k.keterangan}</span>
                </div>
              )}
            </div>
            {k.status === 'aktif' && (
              <div className="ci-counter">
                <span className="dot" />
                {k.totalPeserta} peserta terdaftar
              </div>
            )}
          </div>
        </div>

        {/* Form / states */}
        {state === 'closed' && (
          <div className="ci-form-card ci-closed">
            <div className="icon">🔒</div>
            <h3>Pendaftaran Ditutup</h3>
            <p>Kegiatan ini sudah tidak menerima pendaftaran baru.</p>
          </div>
        )}

        {state === 'idle' && (
          <div className="ci-form-card">
            <h3>Daftar Kegiatan</h3>
            <p>Isi nama lengkap dan nomor HP Anda untuk mendaftar.</p>
            <form onSubmit={handleSubmit}>
              <div className="ci-field">
                <label className="ci-label" htmlFor="nama">Nama Lengkap</label>
                <input
                  id="nama"
                  className="ci-input"
                  type="text"
                  placeholder="Contoh: Budi Santoso"
                  value={nama}
                  onChange={e => setNama(e.target.value)}
                  required
                  maxLength={100}
                  autoComplete="name"
                />
              </div>
              <div className="ci-field">
                <label className="ci-label" htmlFor="nohp">Nomor HP / WhatsApp</label>
                <input
                  id="nohp"
                  className="ci-input"
                  type="tel"
                  placeholder="Contoh: 08123456789"
                  value={noHp}
                  onChange={e => setNoHp(e.target.value)}
                  required
                  maxLength={20}
                  autoComplete="tel"
                />
              </div>
              <button type="submit" className="ci-submit">
                Daftar Sekarang →
              </button>
            </form>
          </div>
        )}

        {state === 'loading' && (
          <div className="ci-form-card ci-closed">
            <div className="icon">⏳</div>
            <h3>Mendaftarkan…</h3>
            <p>Mohon tunggu sebentar.</p>
          </div>
        )}

        {state === 'success' && (
          <div className="ci-result">
            <div className="icon">🎉</div>
            <h3>Pendaftaran Berhasil!</h3>
            <div className="nama-highlight">{resNama}</div>
            <p>Anda berhasil terdaftar sebagai peserta<br /><strong>{k.nama}</strong>.</p>
            <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 8 }}>
              Sampai jumpa di kegiatan! 👋
            </p>
          </div>
        )}

        {state === 'already' && (
          <div className="ci-result">
            <div className="icon">✅</div>
            <h3>Sudah Terdaftar</h3>
            <div className="nama-highlight">{resNama}</div>
            <p>Anda sudah terdaftar di kegiatan ini sebelumnya.</p>
          </div>
        )}

        {state === 'error' && (
          <div className="ci-result">
            <div className="icon">❌</div>
            <h3>Gagal Mendaftar</h3>
            <p>{errMsg}</p>
            <button
              className="ci-submit"
              style={{ marginTop: 8 }}
              onClick={() => setState('idle')}
            >
              Coba Lagi
            </button>
          </div>
        )}
      </div>
    </>
  )
}
