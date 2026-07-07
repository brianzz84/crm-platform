import { NextRequest, NextResponse } from 'next/server'
import { getTenantDb } from '@/lib/tenant'
import { requireTenantPermission } from "@/lib/auth"

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const { error } = await requireTenantPermission(req, params.slug, 'assignConversation')
  if (error) return error

  try {
    const db   = await getTenantDb(params.slug)
    const role = req.nextUrl.searchParams.get('role') ?? undefined

    const users = await db.appUser.findMany({
      where: {
        tenant_slug: params.slug,
        aktif: true,
        ...(role ? { roles: { has: role as any } } : {}),
      },
      select: { id: true, name: true, email: true, roles: true },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ success: true, data: users })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
