'use client'

import { useState } from 'react'
import TambahPeserta from './TambahPeserta'

interface KegiatanInfo {
  id: string
  kode: string
  nama: string
  jenis: string
  tanggal_mulai: string
  tanggal_selesai: string | null
  lokasi: string | null
  penyelenggara: string | null
  poin_kegiatan: number
  keterangan: string | null
  status: string
  totalPeserta: number
}

interface PesertaRow {
  id: string
  hadir: boolean
  sumber: string
  created_at: string
  person: {
    id: string
    name: string
    no_hp: string | null
    kegiatanCount: number
  }
}

interface Props {
  slug: string
  kegiatan: KegiatanInfo
  peserta: PesertaRow[]
  page: number
  pages: number
  canEdit: boolean
}

const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des']

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

const STATUS_CFG: Record<string, { bg: string; color: string }> = {
  aktif:   { bg: '#DCFCE7', color: '#166634' },
  selesai: { bg: '#F1F5F9', color: '#64748B' },
  draft:   { bg: '#FEF9C3', color: '#854D0E' },
}

export default function KegiatanDetailClient({ slug, kegiatan: k, peserta, page, pages, canEdit }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false) // untuk collapsible info di mobile

  const st = STATUS_CFG[k.status] ?? { bg: '#F1F5F9', color: '#64748B' }

  const sameDay = !k.tanggal_selesai ||
    k.tanggal_selesai.slice(0, 10) === k.tanggal_mulai.slice(0, 10)

  const tanggalStr = fmtDate(k.tanggal_mulai) +
    (!sameDay && k.tanggal_selesai ? ` — ${fmtDate(k.tanggal_selesai)}` : '')

  // ── Info panel (desktop sidebar) ─────────────────────────────
  const infoRows = [
    { label: 'Kode',          val: k.kode },
    { label: 'Jenis',         val: k.jenis },
    { label: 'Tanggal',       val: tanggalStr },
    { label: 'Lokasi',        val: k.lokasi || '—' },
    { label: 'Penyelenggara', val: k.penyelenggara || '—' },
    { label: 'Poin Hadir',    val: `${k.poin_kegiatan} poin` },
    { label: 'Total Peserta', val: String(k.totalPeserta) },
  ]

  const infoPanel = (
    <div style={{ background: 'white', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)', padding: 'var(--sp-5)', marginBottom: 'var(--sp-4)' }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--c-text)', marginBottom: 'var(--sp-4)' }}>
        Informasi Kegiatan
      </div>
      {infoRows.map(({ label, val }) => (
        <div key={label} style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)', fontSize: 'var(--font-size-sm)' }}>
          <div style={{ color: 'var(--c-text-faint)', width: 110, flexShrink: 0 }}>{label}</div>
          <div style={{ color: label === 'Total Peserta' ? 'var(--c-secondary)' : 'var(--c-text)', fontWeight: label === 'Total Peserta' ? 700 : 400, flex: 1 }}>{val}</div>
        </div>
      ))}
      {k.keterangan && (
        <div style={{ paddingTop: 'var(--sp-3)', borderTop: '1px solid var(--c-border)', fontSize: 'var(--font-size-sm)', color: 'var(--c-text-faint)', lineHeight: 1.6 }}>
          {k.keterangan}
        </div>
      )}
    </div>
  )

  const qrPanel = k.status === 'aktif' && canEdit ? (
    <div style={{ background: '#EFF6FF', borderRadius: 'var(--r-lg)', border: '1px solid #BFDBFE', padding: 'var(--sp-5)' }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: '#1E40AF', marginBottom: 8 }}>
        Pendaftaran Mandiri via QR
      </div>
      <p style={{ fontSize: 'var(--font-size-sm)', color: '#3B82F6', marginBottom: 'var(--sp-4)', lineHeight: 1.5 }}>
        Peserta scan QR untuk daftar sendiri tanpa bantuan admin.
      </p>
      <a href={`/${slug}/kegiatan/${k.id}/qr`} style={{
        display: 'block', textAlign: 'center', padding: '9px 16px',
        background: '#1D4ED8', color: 'white', borderRadius: 'var(--r-md)',
        fontSize: 'var(--font-size-sm)', fontWeight: 600, textDecoration: 'none',
      }}>
        Lihat & Cetak QR Code
      </a>
    </div>
  ) : null

  // ── Peserta cards (mobile) ────────────────────────────────────
  const pesertaCards = (
    <div className="kg-peserta-cards" style={{ flexDirection: 'column', gap: 1 }}>
      {peserta.map((row) => {
        const noHp = row.person.no_hp || '—'
        const initials = row.person.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
        return (
          <div key={row.id} style={{ padding: '12px var(--sp-4)', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
              background: 'var(--c-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, color: 'white',
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <a href={`/${slug}/pasien/${row.person.id}`} style={{ fontWeight: 600, fontSize: 14, color: 'var(--c-secondary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.person.name}
                </a>
                <span style={{
                  flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                  background: row.hadir ? '#DCFCE7' : '#FEE2E2',
                  color:      row.hadir ? '#166534' : '#B91C1C',
                }}>
                  {row.hadir ? 'Hadir' : 'Absen'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 3, fontSize: 12, color: 'var(--c-text-faint)' }}>
                <span>📱 {noHp}</span>
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 99,
                  background: row.sumber === 'self' ? '#EFF6FF' : '#F8FAFC',
                  color:      row.sumber === 'self' ? '#1D4ED8' : '#64748B',
                  fontWeight: 600,
                }}>
                  {row.sumber === 'self' ? 'QR' : row.sumber === 'admin' ? 'Admin' : 'Migrasi'}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )

  // ── Peserta table (desktop) ───────────────────────────────────
  const pesertaTable = (
    <table className="kg-peserta-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: 'var(--c-bg)', borderBottom: '1px solid var(--c-border)' }}>
          {['Nama', 'No HP', 'Kehadiran', 'Input Via', 'Tgl Daftar'].map(h => (
            <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--c-text-faint)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {peserta.map((row, i) => {
          const noHp = row.person.no_hp || '—'
          return (
            <tr key={row.id} style={{ borderBottom: i < peserta.length - 1 ? '1px solid var(--c-border)' : 'none' }}>
              <td style={{ padding: '13px 16px' }}>
                <a href={`/${slug}/pasien/${row.person.id}`} style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--c-secondary)', textDecoration: 'none' }}>
                  {row.person.name}
                </a>
                <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 2 }}>
                  {row.person.kegiatanCount}× kegiatan
                </div>
              </td>
              <td style={{ padding: '13px 16px', fontSize: 'var(--font-size-sm)', color: 'var(--c-text)' }}>{noHp}</td>
              <td style={{ padding: '13px 16px' }}>
                <span style={{ background: row.hadir ? '#DCFCE7' : '#FEE2E2', color: row.hadir ? '#166534' : '#B91C1C', borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>
                  {row.hadir ? 'Hadir' : 'Tidak Hadir'}
                </span>
              </td>
              <td style={{ padding: '13px 16px' }}>
                <span style={{ background: row.sumber === 'self' ? '#EFF6FF' : '#F8FAFC', color: row.sumber === 'self' ? '#1D4ED8' : '#64748B', borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>
                  {row.sumber === 'self' ? 'QR' : row.sumber === 'admin' ? 'Admin' : 'Migrasi'}
                </span>
              </td>
              <td style={{ padding: '13px 16px', fontSize: 12, color: 'var(--c-text-faint)' }}>
                {fmtDate(row.created_at)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )

  const pagination = pages > 1 ? (
    <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderTop: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
      <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-faint)' }}>
        Halaman {page} dari {pages}
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
          <a key={p} href={`?p=${p}`} style={{
            padding: '4px 10px', borderRadius: 'var(--r-sm)',
            fontSize: 'var(--font-size-sm)', fontWeight: p === page ? 700 : 400,
            background: p === page ? 'var(--c-secondary)' : 'var(--c-bg)',
            color: p === page ? 'white' : 'var(--c-text)',
            textDecoration: 'none', border: '1px solid var(--c-border)',
          }}>{p}</a>
        ))}
      </div>
    </div>
  ) : null

  const pesertaSection = (
    <div style={{ background: 'white', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)', overflow: 'hidden' }}>
      <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--c-text)' }}>
          {k.totalPeserta} Peserta
        </div>
      </div>
      {peserta.length === 0 ? (
        <div style={{ padding: 'var(--sp-12)', textAlign: 'center', color: 'var(--c-text-faint)' }}>
          <div style={{ fontSize: 40, marginBottom: 'var(--sp-3)' }}>👥</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Belum ada peserta terdaftar</div>
          {k.status === 'aktif' && <div style={{ fontSize: 'var(--font-size-sm)' }}>Gunakan form di atas untuk menambah peserta</div>}
        </div>
      ) : (
        <>
          {pesertaCards}
          {pesertaTable}
          {pagination}
        </>
      )}
    </div>
  )

  return (
    <div className="kg-detail-page">

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-5)', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-faint)', marginBottom: 4 }}>
            <a href={`/${slug}/kegiatan`} style={{ color: 'var(--c-secondary)', textDecoration: 'none' }}>Kegiatan</a>
            {' / Detail'}
          </div>
          <h1 className="kg-detail-title" style={{ fontWeight: 700, color: 'var(--c-text)', marginBottom: 6, lineHeight: 1.3 }}>
            {k.nama}
          </h1>
          <span style={{ background: st.bg, color: st.color, borderRadius: 99, padding: '3px 12px', fontSize: 12, fontWeight: 700, textTransform: 'capitalize' as const }}>
            {k.status}
          </span>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 'var(--sp-2)', flexShrink: 0 }}>
            <a href={`/${slug}/kegiatan/${k.id}/edit`} style={{
              padding: '8px 14px', border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-md)',
              fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--c-text)', textDecoration: 'none',
            }}>
              Edit
            </a>
            {k.status === 'aktif' && (
              <a href={`/${slug}/kegiatan/${k.id}/qr`} style={{
                padding: '8px 14px', background: '#EFF6FF', border: '1.5px solid #BFDBFE',
                borderRadius: 'var(--r-md)', fontSize: 'var(--font-size-sm)', fontWeight: 600,
                color: '#1D4ED8', textDecoration: 'none',
              }}>
                QR
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── Stat strip — tampil di mobile, tersembunyi di desktop via CSS ── */}
      <div className="kg-stat-strip">
        {[
          { icon: '📅', label: 'Tanggal', val: (() => { const d = new Date(k.tanggal_mulai); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` })() },
          { icon: '👥', label: 'Peserta',  val: String(k.totalPeserta) },
          { icon: '⭐', label: 'Poin',     val: String(k.poin_kegiatan) },
        ].map((s, i) => (
          <div key={s.label} className={`kg-stat-cell${i < 2 ? ' kg-stat-divider' : ''}`}>
            <div style={{ fontSize: 18, marginBottom: 2 }}>{s.icon}</div>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--c-primary)' }}>{s.val}</div>
            <div style={{ fontSize: 10, color: 'var(--c-text-faint)', marginTop: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Layout container — column on mobile, 2-col grid on desktop ── */}
      <div className="kg-detail-layout">

        {/* Left: info + QR */}
        <div className="kg-detail-left">
          {/* Info compact (mobile-only) */}
          <div className="kg-info-compact">
            {[
              { label: 'Kode', val: k.kode },
              { label: 'Jenis', val: k.jenis },
              { label: 'Lokasi', val: k.lokasi || '—' },
              { label: 'Penyelenggara', val: k.penyelenggara || '—' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, gap: 8 }}>
                <span style={{ color: 'var(--c-text-faint)', flexShrink: 0 }}>{row.label}</span>
                <span style={{ color: 'var(--c-text)', textAlign: 'right', fontWeight: 500 }}>{row.val}</span>
              </div>
            ))}
            {k.keterangan && (
              <div style={{ paddingTop: 'var(--sp-3)', borderTop: '1px solid var(--c-border)', fontSize: 13, color: 'var(--c-text-faint)', lineHeight: 1.6 }}>
                {k.keterangan}
              </div>
            )}
          </div>
          {/* Info full (desktop-only) */}
          <div className="kg-info-full">
            {infoPanel}
          </div>
          {/* QR panel */}
          {qrPanel}
        </div>

        {/* Right: tambah peserta + list */}
        <div className="kg-detail-right">
          {k.status === 'aktif' && canEdit && (
            <TambahPeserta slug={slug} kegiatanId={k.id} />
          )}
          {pesertaSection}
        </div>
      </div>
    </div>
  )
}
