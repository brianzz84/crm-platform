import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import * as XLSX from 'xlsx'

type Ctx = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'importExcel')
  if (error) return error

  // Header kolom sesuai parser import
  const headers = [
    'nama', 'no_hp', 'no_rm', 'email', 'tanggal_lahir',
    'unit', 'poli', 'dokter', 'tanggal_kunjungan',
    'diagnosa_icd', 'diagnosa_nama', 'tindakan',
  ]

  // Satu baris contoh
  const example = [
    'Budi Santoso', '081234567890', 'RM-0001', 'budi@email.com', '1985-06-15',
    'Rawat Jalan', 'Umum', 'dr. Ahmad', '2025-01-10',
    'J06.9', 'ISPA', 'Pemeriksaan umum',
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers, example])

  // Lebar kolom agar mudah dibaca
  ws['!cols'] = [
    { wch: 25 }, { wch: 18 }, { wch: 12 }, { wch: 25 }, { wch: 14 },
    { wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 16 },
    { wch: 12 }, { wch: 25 }, { wch: 22 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Data Pasien')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="template-import-pasien.xlsx"',
    },
  })
}
