import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/session'

export async function POST() {
  const res = NextResponse.json({ success: true })
  res.cookies.set(clearSessionCookie())
  return res
}
