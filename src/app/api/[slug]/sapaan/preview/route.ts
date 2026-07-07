import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'

// POST /api/[slug]/sapaan/preview — render preview template dengan variabel contoh
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageSapaan')
  if (error) return error

  const { template, jenis } = await req.json()
  if (!template) return NextResponse.json({ error: 'template wajib diisi' }, { status: 400 })

  const contohVars: Record<string, Record<string, string>> = {
    ULTAH: {
      '{{nama}}':          'Budi Santoso',
      '{{hari_ini}}':      new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' }),
      '{{nama_rs}}':       'RS Meditech',
    },
    HARI_RAYA: {
      '{{nama}}':          'Siti Rahayu',
      '{{hari_raya}}':     'Idul Fitri 1447 H',
      '{{nama_rs}}':       'RS Meditech',
    },
    KONTROL_REMINDER: {
      '{{nama}}':          'Ahmad Fauzi',
      '{{tanggal_kontrol}}': new Date(Date.now() + 3 * 86400_000).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      '{{poli}}':          'Poli Penyakit Dalam',
      '{{dokter}}':        'dr. Hendra Sp.PD',
      '{{nama_rs}}':       'RS Meditech',
    },
  }

  const vars  = contohVars[jenis] ?? contohVars['ULTAH']
  let preview = template
  for (const [key, val] of Object.entries(vars)) {
    preview = preview.replaceAll(key, val)
  }

  return NextResponse.json({ success: true, preview, vars_available: Object.keys(vars) })
}
