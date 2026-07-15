/**
 * Orkestrasi percakapan AI Partner — rakit system prompt dari rule aktif,
 * jalankan tool-loop sampai AI beri jawaban final.
 *
 * Catatan desain: histori percakapan yang disimpan & direplay ke provider
 * hanya teks user/assistant (bukan detail tool_use/tool_result mentah per
 * giliran). Proses verifikasi tool (cari_kode_icd, dll) selalu dijalankan
 * ulang dalam satu giliran pemrosesan, tidak direplay lintas sesi/reload —
 * ini menghindari kerapuhan me-replay state internal provider (mis.
 * thoughtSignature Gemini) lintas penyimpanan, dan tetap aman karena tool
 * grounding murah (query DB lokal, bukan panggilan API mahal).
 */
import { getAiProviderForTenant, type AiConversationMessage, type AiChatMessage } from '@/lib/ai-provider'
import { AI_PARTNER_TOOLS, executeAiPartnerTool } from '@/lib/ai-partner-tools'

const BASE_SYSTEM_PROMPT = `Kamu adalah partner diskusi admin marketing rumah sakit untuk mencari target pasien/peserta untuk kegiatan marketing.

Pencarian tidak terbatas pada kunjungan SIMRS saja — orang bisa ditemukan lewat berbagai jenis interaksi
dan atribut: riwayat kunjungan (unit/ICD/periode/poli), partisipasi kegiatan/event (jenis kegiatan, nama
kegiatan, tahun), pekerjaan (mis. "nakes", "dokter", "guru"), rentang usia, dan alamat. Semua bisa digabung
dalam satu pencarian lewat tool preview_jumlah_pasien — tanyakan ke admin sumber interaksi/atribut mana
yang relevan kalau tidak disebutkan eksplisit.

Catatan keterbatasan data yang HARUS kamu sampaikan ke admin bila relevan: pencarian alamat adalah
pencarian kata kunci teks bebas, bukan filter wilayah administratif resmi (tidak ada kolom kota/kecamatan
terpisah) — hasilnya bergantung bagaimana alamat itu ditulis saat data dientri, bisa saja meleset atau
tidak lengkap. Jangan sampaikan hasil filter alamat seolah-olah presisi.

Batasan struktural (tidak bisa dilanggar, bukan sekadar instruksi):
- Kamu HANYA bisa bertindak lewat tool yang disediakan (cari_kode_icd, cari_layanan, cari_tag, preview_jumlah_pasien).
- Kamu tidak pernah punya akses ke data pasien individual (nama, no HP, dll) — hanya agregat/jumlah.
- WAJIB verifikasi kode ICD/layanan lewat tool sebelum disebut ke admin — jangan pernah mengarang kode dari ingatan.
- Kalau permintaan admin ambigu (mis. "yang sering datang" tanpa angka jelas), tanya balik dulu — jangan menebak diam-diam.
- Kalau admin bertanya di luar topik pencarian target pasien untuk marketing, sampaikan itu di luar cakupanmu.

Jawab dalam Bahasa Indonesia, ringkas dan jelas.`

export interface AiPartnerRuleEntry {
  kategori: 'PERILAKU' | 'PERSONA' | 'BATASAN'
  teks:     string
}

export function buildSystemPrompt(rules: AiPartnerRuleEntry[]): string {
  if (rules.length === 0) return BASE_SYSTEM_PROMPT

  const byKategori = (k: AiPartnerRuleEntry['kategori']) =>
    rules.filter(r => r.kategori === k).map(r => `- ${r.teks}`).join('\n')

  const sections: string[] = []
  const perilaku = byKategori('PERILAKU')
  const persona  = byKategori('PERSONA')
  const batasan  = byKategori('BATASAN')
  if (perilaku) sections.push(`Instruksi perilaku tambahan:\n${perilaku}`)
  if (persona)  sections.push(`Persona & fokus RS ini:\n${persona}`)
  if (batasan)  sections.push(`Batasan topik tambahan:\n${batasan}`)

  return `${BASE_SYSTEM_PROMPT}\n\n${sections.join('\n\n')}`
}

export interface AiPartnerTurnOutput {
  text: string
  toolCallsLog: { name: string; input: any }[]
}

const MAX_TOOL_LOOP = 6

/**
 * Jalankan satu giliran percakapan penuh: kirim pesan baru + histori teks,
 * biarkan AI panggil tool berkali-kali sampai dapat jawaban final.
 */
export async function runAiPartnerTurn(
  slug: string,
  systemPrompt: string,
  history: AiChatMessage[],
  userMessage: string,
): Promise<AiPartnerTurnOutput> {
  const provider = await getAiProviderForTenant(slug)

  const messages: AiConversationMessage[] = [
    ...history.map(h => ({ role: h.role, content: h.content }) as AiConversationMessage),
    { role: 'user', content: userMessage },
  ]

  const toolCallsLog: { name: string; input: any }[] = []

  for (let i = 0; i < MAX_TOOL_LOOP; i++) {
    const result = await provider.runConversationTurn(systemPrompt, messages, AI_PARTNER_TOOLS)

    if (result.toolCalls.length === 0) {
      return { text: result.text ?? '', toolCallsLog }
    }

    messages.push({ role: 'assistant', content: result.text, toolCalls: result.toolCalls })

    for (const call of result.toolCalls) {
      toolCallsLog.push({ name: call.name, input: call.input })
      const toolResult = await executeAiPartnerTool(slug, call)
      messages.push({ role: 'tool_result', toolCallId: call.id, toolName: call.name, content: toolResult })
    }
  }

  return { text: 'Maaf, pencarian ini terlalu kompleks untuk diselesaikan sekarang. Coba persempit kriterianya.', toolCallsLog }
}
