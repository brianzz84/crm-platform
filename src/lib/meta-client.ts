const META_API_BASE = 'https://graph.facebook.com/v22.0'

export interface MetaCfg {
  phone_number_id: string
  access_token:    string
}

export async function sendMetaTextMessage(
  cfg:     MetaCfg,
  toPhone: string,   // format lokal 08xxx — akan di-konversi ke 628xxx
  text:    string,
): Promise<string | null> {
  const to = localToMeta(toPhone)
  const res = await fetch(`${META_API_BASE}/${cfg.phone_number_id}/messages`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${cfg.access_token}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  })

  const json = await res.json()
  if (!res.ok) {
    console.error('[meta-client] sendText failed:', JSON.stringify(json))
    throw new Error(json.error?.message ?? `Meta API ${res.status}`)
  }

  return json.messages?.[0]?.id ?? null
}

export async function sendMetaMediaMessage(
  cfg:       MetaCfg,
  toPhone:   string,
  mediaType: 'image' | 'document' | 'video',
  mediaUrl:  string,
  caption?:  string,
  filename?: string,
): Promise<string | null> {
  const to = localToMeta(toPhone)
  const mediaPayload: Record<string, string> = { link: mediaUrl }
  if (caption)                              mediaPayload.caption  = caption
  if (filename && mediaType === 'document') mediaPayload.filename = filename  // filename HANYA valid utk document

  const res = await fetch(`${META_API_BASE}/${cfg.phone_number_id}/messages`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${cfg.access_token}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: mediaType,
      [mediaType]: mediaPayload,
    }),
  })

  const json = await res.json()
  if (!res.ok) {
    console.error('[meta-client] sendMedia failed:', JSON.stringify(json))
    throw new Error(json.error?.message ?? `Meta API ${res.status}`)
  }

  return json.messages?.[0]?.id ?? null
}

export interface TemplateComponent {
  type:        'header' | 'body' | 'button'
  sub_type?:   string
  index?:      number
  parameters:  Array<{ type: string; text?: string; [key: string]: any }>
}

export async function sendMetaTemplateMessage(
  cfg:        MetaCfg,
  toPhone:    string,
  templateName:     string,
  templateLanguage: string,
  components: TemplateComponent[],
): Promise<string | null> {
  const to = localToMeta(toPhone)
  const res = await fetch(`${META_API_BASE}/${cfg.phone_number_id}/messages`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${cfg.access_token}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name:       templateName,
        language:   { code: templateLanguage || 'id' },
        components: components.filter(c => c.parameters.length > 0),
      },
    }),
  })

  const json = await res.json()
  if (!res.ok) {
    console.error('[meta-client] sendTemplate failed:', JSON.stringify(json))
    throw new Error(json.error?.message ?? `Meta API ${res.status}`)
  }

  return json.messages?.[0]?.id ?? null
}

export async function fetchMetaTemplates(cfg: MetaCfg, wabaId: string): Promise<any[]> {
  const res = await fetch(
    `${META_API_BASE}/${wabaId}/message_templates?fields=id,name,status,language,category,components&limit=100`,
    { headers: { 'Authorization': `Bearer ${cfg.access_token}` } }
  )
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message ?? `Meta API ${res.status}`)
  return json.data ?? []
}

export interface MetaTemplateComponent {
  type:     'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS'
  format?:  'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
  text?:    string
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>
  example?: { body_text?: string[][]; header_text?: string[] }
}

export interface CreateMetaTemplateInput {
  name:       string
  category:   'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  language:   string
  components: MetaTemplateComponent[]
}

export async function createMetaTemplate(
  cfg:    MetaCfg,
  wabaId: string,
  input:  CreateMetaTemplateInput,
): Promise<{ id: string; status: string }> {
  const res = await fetch(`${META_API_BASE}/${wabaId}/message_templates`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${cfg.access_token}`,
    },
    body: JSON.stringify(input),
  })
  const json = await res.json()
  if (!res.ok) {
    console.error('[meta-client] createTemplate failed:', JSON.stringify(json))
    throw new Error(json.error?.error_user_msg || json.error?.message || `Meta API ${res.status}`)
  }
  return { id: json.id, status: json.status }
}

// Ambil URL sementara + mime sebuah media dari Meta (via media id)
export async function fetchMetaMediaInfo(cfg: MetaCfg, mediaId: string): Promise<{ url: string; mime: string } | null> {
  const res = await fetch(`${META_API_BASE}/${mediaId}`, { headers: { Authorization: `Bearer ${cfg.access_token}` } })
  const json = await res.json()
  if (!res.ok || !json.url) { console.error('[meta-client] fetchMediaInfo failed:', JSON.stringify(json)); return null }
  return { url: json.url, mime: json.mime_type || 'application/octet-stream' }
}

// Unduh byte media (URL Meta butuh Authorization header)
export async function downloadMetaMedia(cfg: MetaCfg, url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.access_token}` } })
  if (!res.ok) throw new Error(`Download media gagal (HTTP ${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

// 08xxxxxxxxx → 628xxxxxxxxx
function localToMeta(phone: string): string {
  if (phone.startsWith('08')) return '62' + phone.slice(1)
  if (phone.startsWith('628')) return phone
  return phone
}
