/**
 * Wappin API client — shared utility untuk broadcast dan sapaan.
 * Auth: Basic → Bearer token. Format: Wappin V2 template messages.
 */

export interface WappinCfg {
  base_url:     string
  login_url:    string
  messages_url: string
  username:     string | null
  password:     string | null
  namespace:    string | null
}

export interface SendResult {
  ok:         boolean
  message_id: string | null
  error?:     string
}

export async function getWappinToken(cfg: WappinCfg): Promise<string | null> {
  try {
    const resp = await fetch(`${cfg.base_url}${cfg.login_url}`, {
      method:  'POST',
      headers: {
        Authorization:  'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64'),
        'Content-Type': 'application/json',
      },
    })
    const json = await resp.json()
    return json.users?.[0]?.token ?? null
  } catch {
    return null
  }
}

export async function sendWaMessage(
  cfg:     WappinCfg,
  token:   string,
  noHp:    string,
  message: string,  // plain text — untuk sapaan yang tidak pakai template Wappin
): Promise<SendResult> {
  try {
    const payload = {
      to:             noHp,
      type:           'text',
      recipient_type: 'individual',
      text:           { body: message },
    }
    const resp = await fetch(`${cfg.base_url}${cfg.messages_url}`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const json = await resp.json()
    if (!resp.ok) {
      return { ok: false, message_id: null, error: json.message || `HTTP ${resp.status}` }
    }
    return { ok: true, message_id: json.messages?.[0]?.id ?? null }
  } catch (e: any) {
    return { ok: false, message_id: null, error: e?.message || 'network error' }
  }
}

export async function sendWaMedia(
  cfg:       WappinCfg,
  token:     string,
  noHp:      string,
  type:      'image' | 'document' | 'video',
  url:       string,
  caption?:  string,
  filename?: string,
): Promise<SendResult> {
  try {
    const mediaPayload: Record<string, any> = { link: url }
    if (caption)  mediaPayload.caption  = caption
    if (filename) mediaPayload.filename = filename
    const payload = {
      to:             noHp,
      type,
      recipient_type: 'individual',
      [type]:         mediaPayload,
    }
    const resp = await fetch(`${cfg.base_url}${cfg.messages_url}`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await resp.json()
    if (!resp.ok) return { ok: false, message_id: null, error: json.message || `HTTP ${resp.status}` }
    return { ok: true, message_id: json.messages?.[0]?.id ?? null }
  } catch (e: any) {
    return { ok: false, message_id: null, error: e?.message || 'network error' }
  }
}

export async function sendWaTemplate(
  cfg:        WappinCfg,
  token:      string,
  noHp:       string,
  templateName:      string,
  templateLanguage:  string,
  components: any[],
): Promise<SendResult> {
  try {
    const payload = {
      to:             noHp,
      type:           'template',
      recipient_type: 'individual',
      template: {
        name:       templateName,
        namespace:  cfg.namespace || '',
        language:   { policy: 'deterministic', code: templateLanguage || 'id' },
        components,
      },
    }
    const resp = await fetch(`${cfg.base_url}${cfg.messages_url}`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const json = await resp.json()
    if (!resp.ok) {
      return { ok: false, message_id: null, error: json.message || `HTTP ${resp.status}` }
    }
    return { ok: true, message_id: json.messages?.[0]?.id ?? null }
  } catch (e: any) {
    return { ok: false, message_id: null, error: e?.message || 'network error' }
  }
}
