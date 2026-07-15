import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { buildSystemPrompt, runAiPartnerTurn } from '@/lib/ai-partner'
import { z } from 'zod'

type Ctx = { params: { slug: string; sessionId: string } }

const schema = z.object({ content: z.string().min(1, 'Pesan tidak boleh kosong') })

export async function POST(req: NextRequest, { params }: Ctx) {
  const { error, session } = await requireTenantPermission(req, params.slug, 'manageSegments')
  if (error) return error

  try {
    const body   = await req.json()
    const parsed = schema.parse(body)

    const db = await getTenantDb(params.slug)

    const aiSession = await db.aiPartnerSession.findUnique({ where: { id: params.sessionId } })
    if (!aiSession || aiSession.tenant_slug !== params.slug) {
      return NextResponse.json({ error: 'Sesi tidak ditemukan' }, { status: 404 })
    }
    if (aiSession.created_by !== session!.userId && !session!.roles.includes('SUPER_ADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [priorMessages, activeRules] = await Promise.all([
      db.aiPartnerMessage.findMany({ where: { session_id: params.sessionId }, orderBy: { created_at: 'asc' } }),
      db.aiPartnerRule.findMany({ where: { tenant_slug: params.slug, aktif: true } }),
    ])

    const history = priorMessages.map((m: any) => ({
      role:    m.role === 'USER' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }))

    const systemPrompt = buildSystemPrompt(activeRules)
    const result = await runAiPartnerTurn(params.slug, systemPrompt, history, parsed.content)

    const [userMsg, assistantMsg] = await db.$transaction([
      db.aiPartnerMessage.create({
        data: { session_id: params.sessionId, role: 'USER', content: parsed.content },
      }),
      db.aiPartnerMessage.create({
        data: {
          session_id: params.sessionId, role: 'ASSISTANT', content: result.text,
          tool_calls: result.toolCallsLog.length ? result.toolCallsLog : undefined,
        },
      }),
    ])

    const isFirstMessage = priorMessages.length === 0
    await db.aiPartnerSession.update({
      where: { id: params.sessionId },
      data: {
        updated_at: new Date(),
        ...(isFirstMessage ? { judul: parsed.content.slice(0, 60) } : {}),
      },
    })

    return NextResponse.json({ success: true, data: { userMessage: userMsg, assistantMessage: assistantMsg } })
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: err.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 })
    }
    console.error('[POST /api/[slug]/ai-partner/[sessionId]/message]', err)
    return NextResponse.json({ error: err?.message ?? 'Gagal memproses pesan' }, { status: 500 })
  }
}
