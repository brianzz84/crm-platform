import { Metadata } from 'next'
import Link from 'next/link'
import { getTenantDb } from '@/lib/tenant'
import { notFound } from 'next/navigation'
import TagChip from '@/components/pasien/TagChip'
import UnitBadge from '@/components/pasien/UnitBadge'
import PasienDetailTabs from './PasienDetailTabs'

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des']

function fmtDateLong(iso: string) {
  const d = new Date(iso)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
function fmtDateShort(iso: string) {
  const d = new Date(iso)
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

interface Props { params: { slug: string; id: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const db = await getTenantDb(params.slug)
    const p  = await db.person.findFirst({
      where: { id: params.id, tenant_slug: params.slug },
      select: { name: true },
    })
    return { title: p?.name ?? 'Detail Pasien' }
  } catch { return { title: 'Detail Pasien' } }
}

export default async function PasienDetailPage({ params }: Props) {
  let db
  try { db = await getTenantDb(params.slug) }
  catch { notFound() }

  const person = await db.person.findFirst({
    where: { id: params.id, tenant_slug: params.slug, aktif: true },
    include: {
      tags: {
        where: { aktif: true },
        include: { tag: true },
        orderBy: { assigned_at: 'desc' },
      },
      contacts: {
        orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
      },
      visits: {
        where: { aktif: true },
        orderBy: { tanggal: 'desc' },
        take: 50,
      },
      conversations: {
        orderBy: { last_message_at: 'desc' },
        take: 10,
        select: { id: true, channel: true, status: true, last_message_at: true, unread_count: true },
      },
      campaign_recipients: {
        orderBy: { sent_at: 'desc' },
        take: 20,
        include: { campaign: { select: { id: true, nama: true, status: true } } },
      },
      kegiatan_diikuti: {
        orderBy: { created_at: 'desc' },
        take: 30,
        include: {
          kegiatan: {
            select: { id: true, kode: true, nama: true, jenis: true, tanggal_mulai: true, lokasi: true, poin_kegiatan: true },
          },
        },
      },
    },
  })

  if (!person) notFound()

  const lastVisit = person.visits[0]

  // Rekap SEMUA penjamin yang pernah dipakai orang ini (dari kunjungannya), bukan
  // cuma yang terakhir — satu orang bisa BPJS di satu kunjungan, asuransi di lain.
  // Semua bisa jadi jaminan aktif → peluang market. Diurut dari yang paling sering.
  const penjaminRekap = (() => {
    const m = new Map<string, { nama: string; jenis: string | null; jumlah: number }>()
    for (const v of person.visits as any[]) {
      const nama  = v.nama_instansi?.trim() || (v.jenis_pembayaran === 'TUNAI' ? 'Tunai / Bayar Sendiri' : null)
      if (!nama) continue
      const key = nama.toLowerCase()
      const e = m.get(key) ?? { nama, jenis: v.jenis_pembayaran ?? null, jumlah: 0 }
      e.jumlah++
      m.set(key, e)
    }
    return Array.from(m.values()).sort((a, b) => b.jumlah - a.jumlah)
  })()
  const initials  = person.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

  const CHANNEL_COLOR: Record<string, string> = { WA: '#25D366', IG: '#E040FB', FB: '#1877F2' }
  const CHANNEL_LABEL: Record<string, string> = { WA: 'WhatsApp', IG: 'Instagram', FB: 'Facebook' }
  const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
    OPEN:     { label: 'Terbuka',   color: '#006E89', bg: '#E0F4F4' },
    PENDING:  { label: 'Menunggu',  color: '#9A6C00', bg: '#FDF3DC' },
    RESOLVED: { label: 'Selesai',   color: '#278B58', bg: '#E8F5E9' },
  }

  return (
    <div className="pasien-detail-page" style={{ padding: 'var(--sp-5)', flex: 1 }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)', marginBottom: 'var(--sp-4)' }}>
        <Link href={`/${params.slug}/pasien`} style={{ color: 'var(--c-secondary)' }}>Data Pasien</Link>
        <span>›</span>
        <span style={{ color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.name}</span>
      </div>

      {/* ── Profile card ── */}
      <div className="pasien-profile-card" style={{
        background: 'white', border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-lg)', marginBottom: 'var(--sp-4)',
        boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
      }}>
        {/* Top strip — avatar + nama + kontak */}
        <div style={{ padding: 'var(--sp-5)', borderBottom: '1px solid var(--c-border)' }}>
          <div style={{ display: 'flex', gap: 'var(--sp-4)', alignItems: 'center', marginBottom: 'var(--sp-3)' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
              background: 'var(--c-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 800, color: 'white',
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 2, lineHeight: 1.2 }}>
                {person.name}
              </h1>
              {person.no_hp && (
                <div style={{ fontSize: 13, color: 'var(--c-text-muted)' }}>📱 {person.no_hp}</div>
              )}
            </div>
          </div>

          {/* Kontak tambahan */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginBottom: person.tags.length > 0 ? 'var(--sp-3)' : 0 }}>
            {person.email && (
              <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>✉ {person.email}</span>
            )}
            {person.tanggal_lahir && (
              <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
                🎂 {fmtDateLong(person.tanggal_lahir.toISOString())}
              </span>
            )}
            {person.contacts.filter(c => !c.is_primary).map(c => (
              <span key={c.id} style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
                📱 {c.nilai} <span style={{ fontSize: 10, color: 'var(--c-text-faint)' }}>(alt)</span>
              </span>
            ))}
          </div>

          {/* Tags */}
          {person.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {person.tags.map(pt => (
                <TagChip key={pt.id} name={pt.tag.name} warna={pt.tag.warna} sumber={pt.sumber} />
              ))}
            </div>
          )}
        </div>

        {/* SIMRS + Quick Actions — responsive row */}
        <div className="pasien-meta-row" style={{ display: 'flex', alignItems: 'stretch' }}>

          {/* Data SIMRS */}
          <div style={{ flex: 1, padding: 'var(--sp-4)', borderRight: '1px solid var(--c-border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-text-faint)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>
              Data SIMRS
              {person.last_simrs_sync_at && <span style={{ marginLeft: 5, color: 'var(--c-success)', fontWeight: 400 }}>● sync</span>}
            </div>
            {[
              { key: 'No. RM',   val: person.no_rm },
              { key: 'Agama',    val: (person as any).agama },
              { key: 'Poli',     val: lastVisit?.poli },
              { key: 'Diagnosa', val: lastVisit?.diagnosa_nama },
              { key: 'Terakhir', val: lastVisit ? fmtDateShort(lastVisit.tanggal.toISOString()) : null },
            ].map(row => (
              <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12, gap: 8 }}>
                <span style={{ color: 'var(--c-text-muted)', flexShrink: 0 }}>{row.key}</span>
                <span style={{ color: row.val ? 'var(--c-text)' : 'var(--c-text-faint)', fontWeight: row.val ? 500 : 400, textAlign: 'right' }}>
                  {row.val || '—'}
                </span>
              </div>
            ))}
            {lastVisit?.unit && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                <span style={{ color: 'var(--c-text-muted)' }}>Unit</span>
                <UnitBadge unit={lastVisit.unit} />
              </div>
            )}
            {/* Penjamin — semua yang pernah dipakai (dari riwayat kunjungan) */}
            {(penjaminRekap.length > 0 || (person as any).no_bpjs) && (
              <>
                <div style={{ borderTop: '1px solid var(--c-border)', margin: '8px 0 6px' }} />
                {penjaminRekap.length > 0 && (
                  <div style={{ marginBottom: 5, fontSize: 12 }}>
                    <span style={{ color: 'var(--c-text-muted)', display: 'block', marginBottom: 4 }}>
                      Penjamin dipakai {penjaminRekap.length > 1 ? `(${penjaminRekap.length} jenis)` : ''}
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {penjaminRekap.map(pj => {
                        const tunai = pj.jenis === 'TUNAI'
                        return (
                          <div key={pj.nama} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              fontWeight: 600, fontSize: 11, padding: '1px 7px', borderRadius: 99,
                              background: tunai ? '#F0FDF4' : '#EFF6FF',
                              color: tunai ? '#166534' : '#1D4ED8',
                            }}>{pj.nama}</span>
                            <span style={{ color: 'var(--c-text-faint)', fontSize: 11, flexShrink: 0 }}>{pj.jumlah}×</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                {(person as any).no_bpjs && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 8, marginTop: 4 }}>
                    <span style={{ color: 'var(--c-text-muted)', flexShrink: 0 }}>No. BPJS</span>
                    <span style={{ color: 'var(--c-text)', fontWeight: 500 }}>{(person as any).no_bpjs}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Quick actions */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, padding: 'var(--sp-4)', flexShrink: 0 }}>
            <Link
              href={`/${params.slug}/broadcast/buat?person=${person.id}`}
              style={{
                padding: '9px 14px', borderRadius: 'var(--r-md)',
                background: 'var(--c-secondary)', color: 'white',
                fontSize: 13, fontWeight: 600, textDecoration: 'none',
                textAlign: 'center', whiteSpace: 'nowrap',
              }}
            >
              📢 Broadcast
            </Link>
            <Link
              href={`/${params.slug}/inbox?person=${person.id}`}
              style={{
                padding: '9px 14px', borderRadius: 'var(--r-md)',
                border: '1.5px solid var(--c-secondary)', color: 'var(--c-secondary)',
                background: 'white', fontSize: 13, fontWeight: 600,
                textDecoration: 'none', textAlign: 'center', whiteSpace: 'nowrap',
              }}
            >
              💬 Buka Chat
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs content */}
      <PasienDetailTabs
        kunjungan={person.visits.map(v => ({
          id: v.id,
          tanggal: v.tanggal.toISOString(),
          unit: v.unit,
          poli: v.poli,
          dokter: v.dokter,
          diagnosa_nama: v.diagnosa_nama,
          diagnosa_icd: v.diagnosa_icd,
          tindakan: v.tindakan,
          jenis_pembayaran: (v as any).jenis_pembayaran ?? null,
          nama_instansi: (v as any).nama_instansi ?? null,
        }))}
        conversations={person.conversations.map(c => ({
          id: c.id,
          channel: c.channel,
          status: c.status,
          last_message_at: c.last_message_at.toISOString(),
          unread_count: c.unread_count,
        }))}
        campaigns={person.campaign_recipients.map(r => ({
          campaign_id: r.campaign_id,
          campaign_nama: r.campaign.nama,
          campaign_status: r.campaign.status,
          status: r.status,
          sent_at: r.sent_at?.toISOString() ?? null,
          delivered_at: r.delivered_at?.toISOString() ?? null,
          read_at: r.read_at?.toISOString() ?? null,
          replied_at: r.replied_at?.toISOString() ?? null,
        }))}
        kegiatanPeserta={person.kegiatan_diikuti.filter(kp => kp.kegiatan).map(kp => ({
          id: kp.id,
          hadir: kp.hadir,
          poin_diberikan: kp.poin_diberikan,
          catatan: kp.catatan,
          created_at: kp.created_at.toISOString(),
          kegiatan: {
            id: kp.kegiatan!.id,
            kode: kp.kegiatan!.kode,
            nama: kp.kegiatan!.nama,
            jenis: kp.kegiatan!.jenis,
            tanggal_mulai: kp.kegiatan!.tanggal_mulai.toISOString(),
            lokasi: kp.kegiatan!.lokasi,
            poin_kegiatan: kp.kegiatan!.poin_kegiatan,
          },
        }))}
        slug={params.slug}
        personId={person.id}
      />
    </div>
  )
}
