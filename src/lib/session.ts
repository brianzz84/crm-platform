import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'crm-platform-dev-secret-change-in-production'
)

const COOKIE_NAME = 'crm-session'
const MAX_AGE = 60 * 60 * 24 * 7 // 7 hari

export interface SessionPayload {
  userId:     string
  tenantSlug: string
  name:       string
  email:      string
  roles:      string[]
}

export async function createSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET)
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

/** Baca session dari cookie (server component / route handler) */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySession(token)
}

/** Baca session dari request (middleware) */
export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySession(token)
}

/** Buat cookie response headers */
export function sessionCookieOptions(token: string) {
  return {
    name:     COOKIE_NAME,
    value:    token,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   MAX_AGE,
    path:     '/',
  }
}

export function clearSessionCookie() {
  return {
    name:    COOKIE_NAME,
    value:   '',
    maxAge:  0,
    path:    '/',
  }
}
