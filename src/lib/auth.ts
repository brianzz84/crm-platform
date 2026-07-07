import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, SessionPayload } from './session'
import { canDo, FeatureKey } from '@/constants'

type AuthOk   = { session: SessionPayload; error: null }
type AuthFail = { session: null; error: NextResponse }
type AuthResult = AuthOk | AuthFail

/**
 * Baca session user dari header (di-inject middleware).
 * Gunakan di server component dan layout.
 */
export function getSessionFromRequest(req: Request): SessionPayload | null {
  const userId = req.headers.get('x-user-id')
  if (!userId) return null
  return {
    userId,
    tenantSlug: req.headers.get('x-tenant-slug') || '',
    name:       req.headers.get('x-user-name')   || '',
    email:      '',
    roles:      (req.headers.get('x-user-roles') || '').split(',').filter(Boolean),
  }
}

export function getSessionFromHeaders(): SessionPayload | null {
  const h = headers()
  const userId = h.get('x-user-id')
  if (!userId) return null

  return {
    userId,
    tenantSlug: h.get('x-tenant-slug') || '',
    name:       h.get('x-user-name') || '',
    email:      '',
    roles:      (h.get('x-user-roles') || '').split(',').filter(Boolean),
  }
}

/**
 * Guard dasar: pastikan session valid.
 */
export async function requireAuth(_req: NextRequest): Promise<AuthResult> {
  const session = await getSession()
  if (!session) {
    return { session: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { session, error: null }
}

/**
 * Guard permission saja (tanpa tenant check).
 * Gunakan hanya untuk route yang tidak punya slug di URL (mis. /api/admin/*).
 */
export async function requirePermission(
  req: NextRequest,
  feature: FeatureKey,
): Promise<AuthResult> {
  const result = await requireAuth(req)
  if (result.error) return result

  if (!canDo(result.session.roles, feature)) {
    return { session: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return result
}

/**
 * Guard WAJIB untuk semua API route dengan :slug di URL.
 *
 * Menggabungkan tiga pengecekan sekaligus (BOLA prevention):
 *   1. Session valid (401 jika tidak)
 *   2. session.tenantSlug === slugFromUrl, kecuali SUPER_ADMIN (403 jika tidak cocok)
 *   3. canDo(roles, feature) (403 jika tidak punya hak)
 *
 * SUPER_ADMIN dibebaskan dari pengecekan #2 karena bisa akses lintas tenant.
 */
export async function requireTenantPermission(
  req: NextRequest,
  slugFromUrl: string,
  feature: FeatureKey,
): Promise<AuthResult> {
  const result = await requireAuth(req)
  if (result.error) return result

  const { session } = result
  const isSuperAdmin = session.roles.includes('SUPER_ADMIN')

  // BOLA check: tenant harus cocok kecuali SUPER_ADMIN
  if (!isSuperAdmin && session.tenantSlug !== slugFromUrl) {
    return {
      session: null,
      error: NextResponse.json({ error: 'Forbidden: tenant mismatch' }, { status: 403 }),
    }
  }

  if (!canDo(session.roles, feature)) {
    return { session: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return result
}
