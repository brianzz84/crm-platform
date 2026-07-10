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
  if (caption)  mediaPayload.caption  = caption
  if (filename) mediaPayload.filename = filename

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

// 08xxxxxxxxx → 628xxxxxxxxx
function localToMeta(phone: string): string {
  if (phone.startsWith('08')) return '62' + phone.slice(1)
  if (phone.startsWith('628')) return phone
  return phone
}
