import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionFromHeaders } from '@/lib/auth'
import { canDo } from '@/constants'
import { getTenantDb } from '@/lib/tenant'
import RencanaKontrolClient from './RencanaKontrolClient'

export const metadata: Metadata = { title: 'Rencana Kontrol' }

// Jendela tampil: sedikit ke belakang (7 hari) supaya yang baru lewat masih terlihat,
// dan ke depan sepanjang jendela sync (90 hari).
const HARI_MUNDUR = 7
const HARI_MAJU   = 90

export default async function RencanaKontrolPage({ params }: { params: { slug: string } }) {
  const session = getSessionFromHeaders()
  if (!session) redirect('/login')
  if (!canDo(session.roles, 'manageSapaan')) redirect(`/${params.slug}/dashboard`)

  const db  = await getTenantDb(params.slug)
  const now = new Date()
  const dari   = new Date(now.getFullYear(), now.getMonth(), now.getDate() - HARI_MUNDUR)
  const sampai = new Date(now.getFullYear(), now.getMonth(), now.getDate() + HARI_MAJU + 1)

  const [rencanas, cfg] = await Promise.all([
    db.simrsRencanaKontrol.findMany({
      where: {
        tenant_slug:     params.slug,
        tanggal_rencana: { gte: dari, lt: sampai },
      },
      select: {
        id: true, tanggal_rencana: true, sumber: true, unit: true, poli: true,
        status: true, reminder_h3_at: true, reminder_h1_at: true,
        person: { select: { name: true, no_hp: true } },
      },
      orderBy: { tanggal_rencana: 'asc' },
    }),
    db.sapaanConfig.findUnique({
      where: { tenant_slug_jenis: { tenant_slug: params.slug, jenis: 'KONTROL_REMINDER' } },
      select: { aktif: true, jam_kirim: true },
    }),
  ])

  const rows = rencanas.map(r => ({
    id:             r.id,
    tanggal:        r.tanggal_rencana.toISOString(),
    nama:           r.person.name,
    noHp:           r.person.no_hp ?? null,
    sumber:         r.sumber,
    unit:           r.unit,
    poli:           r.poli,
    status:         r.status,
    reminderH3At:   r.reminder_h3_at ? r.reminder_h3_at.toISOString() : null,
    reminderH1At:   r.reminder_h1_at ? r.reminder_h1_at.toISOString() : null,
  }))

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1 }}>
      <RencanaKontrolClient
        slug={params.slug}
        rows={rows}
        reminderAktif={cfg?.aktif ?? false}
        jamKirim={cfg?.jam_kirim ?? null}
      />
    </div>
  )
}
