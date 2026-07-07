import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { requireTenantPermission } from "@/lib/auth"
import { parseExcelBuffer, processImport } from '@/lib/excel-import'

// GET — daftar riwayat import
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { session, error } = await requireTenantPermission(req, params.slug, 'importExcel')
  if (error) return error

  const db = await getTenantDb(params.slug)
  const logs = await db.importLog.findMany({
    where:   { tenant_slug: params.slug },
    orderBy: { started_at: 'desc' },
    take:    20,
  })

  return NextResponse.json({ success: true, data: logs })
}

// POST — upload + proses file Excel
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { session, error } = await requireTenantPermission(req, params.slug, 'importExcel')
  if (error) return error

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'File tidak ditemukan' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!['xlsx', 'xls'].includes(ext || '')) {
    return NextResponse.json({ error: 'Format file harus .xlsx atau .xls' }, { status: 400 })
  }

  const db = await getTenantDb(params.slug)

  // Buat ImportLog dengan status PROCESSING
  const log = await db.importLog.create({
    data: {
      tenant_slug: params.slug,
      sumber:      'EXCEL',
      status:      'PROCESSING',
      filename:    file.name,
      created_by:  session.userId,
    },
  })

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const rows   = parseExcelBuffer(buffer)

    await db.importLog.update({
      where: { id: log.id },
      data:  { total_rows: rows.length },
    })

    const result = await processImport(db, rows, params.slug, session.userId, log.id)

    // Simpan hasil akhir
    await db.importLog.update({
      where: { id: log.id },
      data:  {
        status:          'DONE',
        processed_rows:  result.processedRows,
        new_persons:     result.newPersons,
        updated_persons: result.updatedPersons,
        new_visits:      result.newVisits,
        skipped_rows:    result.skippedRows,
        error_detail:    result.errors.length ? (result.errors as object[]) : undefined,
        finished_at:     new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      data:    { logId: log.id, ...result },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal memproses file'
    await db.importLog.update({
      where: { id: log.id },
      data:  { status: 'FAILED', error_detail: [{ row: 0, noHp: null, alasan: msg }] as object[], finished_at: new Date() },
    })
    return NextResponse.json({ error: msg }, { status: 422 })
  }
}
