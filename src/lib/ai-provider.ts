/**
 * Lapisan abstraksi provider AI — SaaS: tiap tenant pilih provider & API key sendiri
 * (diatur admin IT di Pengaturan > AI). Sesuai CLAUDE.md §9: tidak ada fallback
 * ke env variable global — semua config wajib per-tenant di DB.
 */
import Anthropic from '@anthropic-ai/sdk'
import { masterDb } from '@/lib/tenant'
import { AI_MODEL_FAST } from '@/constants'

export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiTool {
  name: string
  description: string
  inputSchema: Record<string, any>  // JSON schema
}

export interface AiToolCall {
  id: string
  name: string
  input: any
  providerMeta?: Record<string, any>  // data internal provider yang wajib direplay apa adanya (mis. thoughtSignature Gemini)
}

export type AiConversationMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: AiToolCall[] }
  | { role: 'tool_result'; toolCallId: string; toolName: string; content: string }

export interface AiTurnResult {
  text: string | null
  toolCalls: AiToolCall[]  // kosong = AI sudah selesai, `text` adalah jawaban final
}

export interface AiProviderClient {
  generateJson(systemPrompt: string, messages: AiChatMessage[]): Promise<string>
  /** Satu giliran percakapan dengan tool-calling. Pemanggil yang menjalankan loop tool. */
  runConversationTurn(systemPrompt: string, messages: AiConversationMessage[], tools: AiTool[]): Promise<AiTurnResult>
}

const GEMINI_DEFAULT_MODEL = 'gemini-3-flash-preview'

class AnthropicProviderClient implements AiProviderClient {
  constructor(private apiKey: string, private model: string) {}

  async generateJson(systemPrompt: string, messages: AiChatMessage[]): Promise<string> {
    const client = new Anthropic({ apiKey: this.apiKey })
    const response = await client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    })
    const block = response.content[0]
    return block?.type === 'text' ? block.text : ''
  }

  async runConversationTurn(systemPrompt: string, messages: AiConversationMessage[], tools: AiTool[]): Promise<AiTurnResult> {
    const client = new Anthropic({ apiKey: this.apiKey })

    const anthropicMessages: Anthropic.MessageParam[] = []
    for (const m of messages) {
      if (m.role === 'user') {
        anthropicMessages.push({ role: 'user', content: m.content })
      } else if (m.role === 'assistant') {
        const content: Anthropic.ContentBlockParam[] = []
        if (m.content) content.push({ type: 'text', text: m.content })
        for (const tc of m.toolCalls ?? []) {
          content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })
        }
        anthropicMessages.push({ role: 'assistant', content })
      } else if (m.role === 'tool_result') {
        anthropicMessages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }],
        })
      }
    }

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 1536,
      system: systemPrompt,
      messages: anthropicMessages,
      tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema as any })),
    })

    const toolCalls: AiToolCall[] = []
    let text = ''
    for (const block of response.content) {
      if (block.type === 'text') text += block.text
      else if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, input: block.input })
    }
    return { text: text || null, toolCalls }
  }
}

class GeminiProviderClient implements AiProviderClient {
  constructor(private apiKey: string, private model: string) {}

  async generateJson(systemPrompt: string, messages: AiChatMessage[]): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map(m => ({
          role:  m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: { responseMimeType: 'application/json' },
      }),
    })
    if (!res.ok) throw new Error(`Gemini API error: ${res.status} ${await res.text()}`)
    const json = await res.json()
    return json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  }

  async runConversationTurn(systemPrompt: string, messages: AiConversationMessage[], tools: AiTool[]): Promise<AiTurnResult> {
    const contents: any[] = []
    for (const m of messages) {
      if (m.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: m.content }] })
      } else if (m.role === 'assistant') {
        const parts: any[] = []
        if (m.content) parts.push({ text: m.content })
        for (const tc of m.toolCalls ?? []) {
          parts.push({
            functionCall: { id: tc.id, name: tc.name, args: tc.input },
            ...(tc.providerMeta?.thoughtSignature ? { thoughtSignature: tc.providerMeta.thoughtSignature } : {}),
          })
        }
        contents.push({ role: 'model', parts })
      } else if (m.role === 'tool_result') {
        contents.push({
          role: 'function',
          parts: [{ functionResponse: { id: m.toolCallId, name: m.toolName, response: { content: m.content } } }],
        })
      }
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools: [{ functionDeclarations: tools.map(t => ({ name: t.name, description: t.description, parameters: t.inputSchema })) }],
      }),
    })
    if (!res.ok) throw new Error(`Gemini API error: ${res.status} ${await res.text()}`)
    const json  = await res.json()
    const parts = json.candidates?.[0]?.content?.parts ?? []

    const toolCalls: AiToolCall[] = []
    let text = ''
    for (const part of parts) {
      if (part.text) text += part.text
      if (part.functionCall) {
        toolCalls.push({
          id:    part.functionCall.id || `${part.functionCall.name}_${Math.random().toString(36).slice(2, 10)}`,
          name:  part.functionCall.name,
          input: part.functionCall.args ?? {},
          ...(part.thoughtSignature ? { providerMeta: { thoughtSignature: part.thoughtSignature } } : {}),
        })
      }
    }
    return { text: text || null, toolCalls }
  }
}

/**
 * Ambil client AI sesuai konfigurasi tenant. Tidak ada fallback global —
 * tenant wajib mengaktifkan + mengisi API key sendiri di Pengaturan > AI.
 */
export async function getAiProviderForTenant(slug: string): Promise<AiProviderClient> {
  const tenant = await masterDb.tenant.findUnique({
    where:  { slug },
    select: { config: { select: { ai_enabled: true, ai_provider: true, ai_api_key: true, ai_model: true } } },
  })
  const cfg = tenant?.config

  if (!cfg?.ai_enabled) throw new Error('Fitur AI belum diaktifkan untuk tenant ini. Aktifkan di Pengaturan > AI.')
  if (!cfg.ai_api_key) throw new Error('API key AI belum dikonfigurasi untuk tenant ini. Isi di Pengaturan > AI.')

  const provider = cfg.ai_provider ?? 'CLAUDE'

  if (provider === 'GEMINI') {
    return new GeminiProviderClient(cfg.ai_api_key, cfg.ai_model || GEMINI_DEFAULT_MODEL)
  }
  return new AnthropicProviderClient(cfg.ai_api_key, cfg.ai_model || AI_MODEL_FAST)
}
