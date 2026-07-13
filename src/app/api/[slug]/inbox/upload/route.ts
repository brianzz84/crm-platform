import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { uploadPublic, isStorageConfigured } from '@/lib/storage'

type Ctx = { params: { slug: string } }

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'video/mp4', 'video/3gpp',
])

const MAX_SIZE = 16 * 1024 * 1024 // 16 MB

export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'replyChat')
  if (error) return error

  try {
    if (!isStorageConfigured()) {
      return NextResponse.json({ error: 'Storage belum dikonfigurasi. Set UPLOAD_ENDPOINT & UPLOAD_SECRET.' }, { status: 500 })
    }

    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'File tidak ada' }, { status: 400 })

    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: `Tipe file tidak diizinkan: ${file.type}` }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Ukuran file maksimal 16 MB' }, { status: 400 })
    }

    // Upload ke storage publik (HostGator) — URL bisa di-fetch Meta
    const fileUrl = await uploadPublic({
      data:        await file.arrayBuffer(),
      filename:    file.name || 'upload',
      contentType: file.type,
      tenant:      params.slug,
    })

    const mediaType = file.type.startsWith('image/') ? 'image'
      : file.type === 'application/pdf'              ? 'document'
      : file.type.startsWith('video/')               ? 'video'
      : 'document'

    return NextResponse.json({
      success:   true,
      url:       fileUrl,
      mediaType,
      filename:  file.name,
      size:      file.size,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
