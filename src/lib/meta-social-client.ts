/**
 * Klien tipis Graph API untuk analitik media sosial (Facebook Page & Instagram)
 * dan Marketing API. Dipakai probe diagnostik (Fase 0) dan — nanti — data collector.
 *
 * Sengaja hanya GET read-only. Token dikirim sebagai query param `access_token`
 * (bukan header) mengikuti konvensi Graph, tapi TIDAK PERNAH di-log.
 */
const GRAPH_BASE = 'https://graph.facebook.com/v22.0'

export interface GraphResult {
  ok:     boolean
  status: number
  json:   any
}

/**
 * Panggil satu endpoint Graph. `pathAndQuery` TANPA token — token disisipkan di sini.
 * Timeout 12 dtk. Tidak melempar; selalu kembalikan GraphResult supaya probe bisa
 * melaporkan tiap kegagalan apa adanya.
 */
export async function graphGet(pathAndQuery: string, token: string): Promise<GraphResult> {
  const sep = pathAndQuery.includes('?') ? '&' : '?'
  const url = `${GRAPH_BASE}/${pathAndQuery}${sep}access_token=${encodeURIComponent(token)}`
  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(12_000) })
    const json = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, json }
  } catch (e: any) {
    return { ok: false, status: 0, json: { error: { message: e?.message || 'network error' } } }
  }
}

/** Pesan error Graph yang ramah dibaca admin. */
export function pesanErrorGraph(r: GraphResult): string {
  const e = r.json?.error
  if (!e) return `HTTP ${r.status}`
  const bits = [e.message, e.error_user_msg, e.code ? `(code ${e.code})` : '', e.error_subcode ? `sub ${e.error_subcode}` : '']
  return bits.filter(Boolean).join(' ').slice(0, 300)
}
