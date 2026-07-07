import Anthropic from '@anthropic-ai/sdk'
import { AI_MODEL_FAST } from '@/constants'

export interface SimrsParams {
  units: string[]           // e.g. ['RAWAT_INAP', 'RAWAT_JALAN']
  icdCodes: string[]        // e.g. ['E10', 'E11', 'E13']
  periodeAwal?: string      // YYYY-MM-DD
  periodeAkhir?: string     // YYYY-MM-DD
  poli?: string             // nama poli / spesialisasi
  extraFilter?: string      // deskripsi filter tambahan yang tidak terstruktur
}

export interface NlpResult {
  params: SimrsParams
  penjelasan: string        // rangkuman parameter dalam bahasa natural
}

const SYSTEM_PROMPT = `Kamu adalah sistem ekstraktor parameter pencarian pasien rumah sakit.
Tugasmu: ubah query bahasa natural menjadi parameter terstruktur untuk query ke sistem SIMRS.

Aturan:
- Identifikasi unit layanan: RAWAT_INAP, RAWAT_JALAN, PENUNJANG (bisa lebih dari satu)
- Identifikasi kode ICD-10 yang relevan (misal: E10 untuk diabetes tipe 1, E11 untuk tipe 2)
- Identifikasi periode waktu (konversi ke tanggal absolut dalam format YYYY-MM-DD)
- Tanggal hari ini: ${new Date().toISOString().slice(0, 10)}
- Jika query menyebut "3 bulan terakhir", hitung mundur dari hari ini
- Identifikasi poli spesifik jika disebutkan
- Jika ada filter yang tidak bisa distrukturkan, masukkan ke extraFilter

Respons HARUS berupa JSON valid dengan struktur:
{
  "params": {
    "units": [],
    "icdCodes": [],
    "periodeAwal": "YYYY-MM-DD atau null",
    "periodeAkhir": "YYYY-MM-DD atau null",
    "poli": "string atau null",
    "extraFilter": "string atau null"
  },
  "penjelasan": "Ringkasan parameter dalam 1-2 kalimat bahasa Indonesia"
}

Jangan sertakan komentar dalam JSON. Hanya JSON mentah.`

export async function parseNlpQuery(query: string): Promise<NlpResult> {
  const client = new Anthropic()

  const response = await client.messages.create({
    model: AI_MODEL_FAST,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: query }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI tidak mengembalikan JSON yang valid')

  const parsed = JSON.parse(jsonMatch[0])
  return {
    params: {
      units: parsed.params?.units || [],
      icdCodes: parsed.params?.icdCodes || [],
      periodeAwal: parsed.params?.periodeAwal || undefined,
      periodeAkhir: parsed.params?.periodeAkhir || undefined,
      poli: parsed.params?.poli || undefined,
      extraFilter: parsed.params?.extraFilter || undefined,
    },
    penjelasan: parsed.penjelasan || '',
  }
}
