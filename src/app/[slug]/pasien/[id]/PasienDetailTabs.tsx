'use client'

import { useState } from 'react'
import Link from 'next/link'
import UnitBadge from '@/components/pasien/UnitBadge'

interface Kunjungan {
  id: string; tanggal: string; unit: string; poli: string | null
  dokter: string | null; diagnosa_nama: string | null; diagnosa_icd: string | null; tindakan: string | null
  jenis_pembayaran: string | null; nama_instansi: string | null
}
interface ConvRow { id: string; channel: string; status: string; last_message_at: string; unread_count: number }
interface KegiatanPesertaRow {
  id: string; hadir: boolean; poin_diberikan: number; catatan: string | null; created_at: string
  kegiatan: { id: string; kode: string; nama: string; jenis: string; tanggal_mulai: string; lokasi: string | null; poin_kegiatan: number }
}
interface CampaignRow {
  campaign_id: string; campaign_nama: string; campaign_status: string
  status: string; sent_at: string | null; delivered_at: string | null
  read_at: string | null; replied_at: string | null
}

const CHANNEL_ICON: Record<string, string>  = { WA: '📱', IG: '📸', FB: '📘' }
const CHANNEL_COLOR: Record<string, string> = { WA: '#25D366', IG: '#E040FB', FB: '#1877F2' }
const CHANNEL_LABEL: Record<string, string> = { WA: 'WhatsApp', IG: 'Instagram', FB: 'Facebook' }

const CONV_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  OPEN:     { label: 'Terbuka',  color: '#006E89', bg: '#E0F4F4' },
  PENDING:  { label: 'Menunggu', color: '#9A6C00', bg: '#FDF3DC' },
  RESOLVED: { label: 'Selesai',  color: '#278B58', bg: '#E8F5E9' },
}

// Warna default per kelompok unit. Kelompok itu teks bebas milik tiap tenant
// (SimrsUnitLibrary.kelompok) — daftar ini BUKAN pembatas, cuma warna yang
// sudah dikenal. Nilai lain tetap tampil dengan gaya netral (lihat fallback
// di pemakaiannya), jadi RS dengan kelompok lain tidak rusak tampilannya.
const UNIT_STYLE: Record<string, { border: string; badge: string; badgeText: string; label: string }> = {
  'Rawat Jalan':  { border: '#0089A8', badge: '#E0F4F4', badgeText: '#006E89', label: 'Rawat Jalan' },
  'Rawat Inap':   { border: '#8B5CF6', badge: '#EDE7F6', badgeText: '#512DA8', label: 'Rawat Inap' },
  'IGD':          { border: '#EF4444', badge: '#FFEBEE', badgeText: '#C62828', label: 'IGD' },
  'Penunjang':    { border: '#F59E0B', badge: '#FFF3E0', badgeText: '#E65100', label: 'Penunjang' },
  'Pondok Sehat': { border: '#278B58', badge: '#E8F5E9', badgeText: '#278B58', label: 'Pondok Sehat' },
  'One Day Care': { border: '#1565C0', badge: '#E3F2FD', badgeText: '#1565C0', label: 'One Day Care' },
  'Home Care':    { border: '#AD1457', badge: '#FCE4EC', badgeText: '#AD1457', label: 'Home Care' },
}

const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des']

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
function fmtDateTime(iso: string) {
  const d = new Date(iso)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm}`
}

type TabKey = 'kunjungan' | 'kegiatan' | 'broadcast' | 'chat'

export default function PasienDetailTabs({
  kunjungan, conversations, campaigns, kegiatanPeserta, slug, personId,
}: {
  kunjungan: Kunjungan[]
  conversations: ConvRow[]
  campaigns: CampaignRow[]
  kegiatanPeserta: KegiatanPesertaRow[]
  slug: string
  personId: string
}) {
  const [tab, setTab] = useState<TabKey>('kunjungan')

  const TABS: { key: TabKey; icon: string; label: string; count: number }[] = [
    { key: 'kunjungan', icon: '🏥', label: 'Kunjungan',  count: kunjungan.length },
    { key: 'kegiatan',  icon: '📅', label: 'Kegiatan',   count: kegiatanPeserta.length },
    { key: 'broadcast', icon: '📢', label: 'Broadcast',  count: campaigns.length },
    { key: 'chat',      icon: '💬', label: 'Chat',        count: conversations.length },
  ]

  return (
    <div style={{ background: 'white', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--c-border)', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {TABS.map(t => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: '1 0 auto',
                padding: '12px 8px 10px',
                border: 'none',
                borderBottom: active ? '2px solid var(--c-secondary)' : '2px solid transparent',
                marginBottom: -2,
                background: 'none',
                color: active ? 'var(--c-secondary)' : 'var(--c-text-muted)',
                fontWeight: active ? 700 : 500,
                fontSize: 12,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontFamily: 'inherit',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                transition: 'color .15s, border-color .15s',
              }}
            >
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              <span>{t.label}</span>
              {t.count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  background: active ? 'var(--c-secondary)' : 'var(--c-border)',
                  color: active ? 'white' : 'var(--c-text-muted)',
                  borderRadius: 99, padding: '1px 6px', lineHeight: 1.4,
                }}>
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Tab content ── */}
      <div style={{ padding: 'var(--sp-4)' }}>

        {/* ────── KUNJUNGAN ────── */}
        {tab === 'kunjungan' && (
          kunjungan.length === 0
            ? <EmptyState icon="🏥" text="Belum ada data kunjungan" />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {kunjungan.map((v, i) => {
                  const us = UNIT_STYLE[v.unit] ?? { border: '#94A3B8', badge: '#F1F5F9', badgeText: '#64748B', label: v.unit }
                  return (
                    <div key={v.id} style={{
                      borderRadius: 'var(--r-md)',
                      border: '1px solid var(--c-border)',
                      borderLeft: `4px solid ${us.border}`,
                      padding: '12px 14px',
                      background: i % 2 === 0 ? 'white' : 'var(--c-bg)',
                    }}>
                      {/* Row 1: tanggal + unit badge */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-primary)' }}>
                          {fmtDate(v.tanggal)}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                          background: us.badge, color: us.badgeText, flexShrink: 0,
                        }}>
                          {us.label}
                        </span>
                      </div>

                      {/* Row 2: poli + dokter */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 16px', marginBottom: v.diagnosa_nama || v.tindakan ? 6 : 0 }}>
                        {v.poli && (
                          <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
                            🏥 {v.poli}
                          </span>
                        )}
                        {v.dokter && (
                          <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
                            👨‍⚕️ {v.dokter}
                          </span>
                        )}
                      </div>

                      {/* Row 3: diagnosa */}
                      {v.diagnosa_nama && (
                        <div style={{ fontSize: 12, color: 'var(--c-text)', marginBottom: v.tindakan ? 4 : 0 }}>
                          <span style={{ color: 'var(--c-text-faint)', marginRight: 4 }}>Dx:</span>
                          {v.diagnosa_nama}
                          {v.diagnosa_icd && (
                            <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--c-text-faint)' }}>
                              ({v.diagnosa_icd})
                            </span>
                          )}
                        </div>
                      )}

                      {/* Row 4: tindakan */}
                      {v.tindakan && (
                        <div style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
                          <span style={{ color: 'var(--c-text-faint)', marginRight: 4 }}>Tindakan:</span>
                          {v.tindakan}
                        </div>
                      )}

                      {/* Row 5: pembayaran */}
                      {v.jenis_pembayaran && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99,
                            background: v.jenis_pembayaran === 'TUNAI' ? '#F0FDF4' : '#EFF6FF',
                            color: v.jenis_pembayaran === 'TUNAI' ? '#166534' : '#1D4ED8',
                          }}>
                            {v.jenis_pembayaran === 'TUNAI' ? 'Tunai' : 'Non-Tunai'}
                          </span>
                          {v.nama_instansi && (
                            <span style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>{v.nama_instansi}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
        )}

        {/* ────── KEGIATAN ────── */}
        {tab === 'kegiatan' && (
          kegiatanPeserta.length === 0
            ? <EmptyState icon="📅" text="Belum pernah mengikuti kegiatan" />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {kegiatanPeserta.map(kp => (
                  <div key={kp.id} style={{
                    border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)',
                    borderLeft: `4px solid ${kp.hadir ? '#22C55E' : '#EF4444'}`,
                    padding: '12px 14px',
                  }}>
                    {/* Header baris */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: 'var(--c-primary)', fontSize: 13, marginBottom: 2 }}>
                          {kp.kegiatan.nama}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
                          {fmtDate(kp.kegiatan.tanggal_mulai)}
                          {kp.kegiatan.lokasi && <span style={{ marginLeft: 8 }}>📍 {kp.kegiatan.lokasi}</span>}
                        </div>
                      </div>
                      {kp.poin_diberikan > 0 && (
                        <div style={{ textAlign: 'center', flexShrink: 0 }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--c-accent-dark)', lineHeight: 1 }}>
                            +{kp.poin_diberikan}
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--c-text-muted)', fontWeight: 700, letterSpacing: '0.5px' }}>POIN</div>
                        </div>
                      )}
                    </div>

                    {/* Badges + link */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                        background: 'var(--c-secondary-light)', color: 'var(--c-secondary-dark)',
                      }}>
                        {kp.kegiatan.jenis}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                        background: kp.hadir ? '#E8F5E9' : '#FFEBEE',
                        color: kp.hadir ? '#2E7D32' : '#C62828',
                      }}>
                        {kp.hadir ? '✓ Hadir' : '✗ Tidak Hadir'}
                      </span>
                      <Link href={`/${slug}/kegiatan/${kp.kegiatan.id}`} style={{
                        marginLeft: 'auto', fontSize: 12, fontWeight: 600,
                        color: 'var(--c-secondary)', textDecoration: 'none', flexShrink: 0,
                      }}>
                        Detail →
                      </Link>
                    </div>

                    {kp.catatan && (
                      <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginTop: 6, fontStyle: 'italic' }}>
                        📝 {kp.catatan}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
        )}

        {/* ────── BROADCAST ────── */}
        {tab === 'broadcast' && (
          campaigns.length === 0
            ? <EmptyState icon="📢" text="Belum pernah menerima broadcast" />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {campaigns.map((r, i) => (
                  <div key={i} style={{
                    border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)',
                    padding: '12px 14px',
                  }}>
                    <div style={{ fontWeight: 600, color: 'var(--c-primary)', marginBottom: 4, fontSize: 13 }}>
                      {r.campaign_nama}
                    </div>
                    {r.sent_at && (
                      <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 10 }}>
                        {fmtDateTime(r.sent_at)}
                      </div>
                    )}

                    {/* Delivery trail — horizontal steps */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {([
                        { label: 'Kirim',   active: !!r.sent_at },
                        { label: 'Terima',  active: !!r.delivered_at },
                        { label: 'Dibaca',  active: !!r.read_at },
                        { label: 'Balas',   active: !!r.replied_at },
                      ]).map((step, si, arr) => (
                        <div key={step.label} style={{ display: 'flex', alignItems: 'center', flex: si < arr.length - 1 ? 1 : 0 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                            <div style={{
                              width: 26, height: 26, borderRadius: '50%',
                              background: step.active ? 'var(--c-success)' : 'var(--c-border)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, color: step.active ? 'white' : 'var(--c-text-faint)',
                              fontWeight: 700,
                            }}>
                              {step.active ? '✓' : si + 1}
                            </div>
                            <span style={{ fontSize: 9, color: step.active ? 'var(--c-success)' : 'var(--c-text-faint)', fontWeight: 600 }}>
                              {step.label}
                            </span>
                          </div>
                          {si < arr.length - 1 && (
                            <div style={{
                              flex: 1, height: 2, margin: '0 4px', marginBottom: 14,
                              background: step.active && arr[si + 1].active ? 'var(--c-success)' : 'var(--c-border)',
                            }} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
        )}

        {/* ────── CHAT ────── */}
        {tab === 'chat' && (
          conversations.length === 0
            ? <EmptyState icon="💬" text="Belum ada riwayat percakapan" />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {conversations.map(c => {
                  const cs = CONV_STATUS[c.status] ?? { label: c.status, color: '#6B7B8D', bg: '#F1F3F6' }
                  return (
                    <div key={c.id} style={{
                      border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)',
                      padding: '12px 14px',
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                      {/* Channel circle */}
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                        background: (CHANNEL_COLOR[c.channel] ?? '#94A3B8') + '20',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 20,
                      }}>
                        {CHANNEL_ICON[c.channel] ?? '💬'}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--c-text)', marginBottom: 2 }}>
                          {CHANNEL_LABEL[c.channel] ?? c.channel}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
                          {fmtDateTime(c.last_message_at)}
                        </div>
                      </div>

                      {/* Right: status badge + unread + link */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                          color: cs.color, background: cs.bg,
                        }}>
                          {cs.label}
                        </span>
                        {c.unread_count > 0 && (
                          <span style={{
                            background: 'var(--c-error)', color: 'white',
                            borderRadius: 99, fontSize: 10, fontWeight: 700,
                            padding: '1px 6px',
                          }}>
                            {c.unread_count} baru
                          </span>
                        )}
                        <Link href={`/${slug}/inbox?id=${c.id}`} style={{
                          fontSize: 11, fontWeight: 600,
                          color: 'var(--c-secondary)', textDecoration: 'none',
                        }}>
                          Buka →
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
        )}

      </div>
    </div>
  )
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--c-text-muted)' }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 'var(--font-size-sm)' }}>{text}</div>
    </div>
  )
}
