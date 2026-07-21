import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { uploadPublic, isStorageConfigured } from '@/lib/storage'

type Ctx = { params: { slug: string } }

// Media contoh header template. Batas Meta: gambar 5MB, video 16MB, dokumen 100MB.
// Ambil batas aman 16MB (video), samakan dengan chat.
const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png',
  'video/mp4', 'video/3gpp',
  'application/pdf',
])
const MAX_SIZE = 16 * 1024 * 1024

export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'manageBroadcast')
  if (error) return error

  try {
    if (!isStorageConfigured()) {
      return NextResponse.json({ error: 'Storage belum dikonfigurasi. Set UPLOAD_ENDPOINT & UPLOAD_SECRET.' }, { status: 500 })
    }

    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'File tidak ada' }, { status: 400 })
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: `Tipe file tidak diizinkan untuk header: ${file.type}. Pakai JPG/PNG, MP4, atau PDF.` }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Ukuran file maksimal 16 MB' }, { status: 400 })
    }

    const fileUrl = await uploadPublic({
      data:        await file.arrayBuffer(),
      filename:    file.name || 'header',
      contentType: file.type,
      tenant:      params.slug,
    })

    return NextResponse.json({ success: true, url: fileUrl, filename: file.name, mime: file.type, size: file.size })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
