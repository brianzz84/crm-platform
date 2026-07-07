import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'

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
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'File tidak ada' }, { status: 400 })

    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: `Tipe file tidak diizinkan: ${file.type}` }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Ukuran file maksimal 16 MB' }, { status: 400 })
    }

    const ext      = extname(file.name) || '.bin'
    const filename = `${randomUUID()}${ext}`
    const dir      = join(process.cwd(), 'public', 'uploads', params.slug)

    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, filename), Buffer.from(await file.arrayBuffer()))

    const baseUrl  = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:3000`
    const fileUrl  = `${baseUrl}/uploads/${params.slug}/${filename}`

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
