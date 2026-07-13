/**
 * Storage publik untuk media (chat & template header).
 * Meng-upload file ke endpoint HostGator (upload.php) → mengembalikan URL publik
 * yang bisa di-fetch Meta. Abstrak: ganti backend cukup ubah endpoint/env.
 */

interface UploadInput {
  data:        Buffer | Uint8Array | ArrayBuffer
  filename:    string
  contentType: string
  tenant?:     string
}

export function isStorageConfigured(): boolean {
  return !!(process.env.UPLOAD_ENDPOINT && process.env.UPLOAD_SECRET)
}

export async function uploadPublic(input: UploadInput): Promise<string> {
  const endpoint = process.env.UPLOAD_ENDPOINT
  const secret   = process.env.UPLOAD_SECRET
  if (!endpoint || !secret) throw new Error('Storage belum dikonfigurasi (UPLOAD_ENDPOINT/UPLOAD_SECRET)')

  const bytes = input.data instanceof ArrayBuffer ? new Uint8Array(input.data) : input.data
  const form  = new FormData()
  form.append('file', new Blob([bytes as any], { type: input.contentType }), input.filename)
  if (input.tenant) form.append('tenant', input.tenant)

  const res  = await fetch(endpoint, { method: 'POST', headers: { 'X-Upload-Secret': secret }, body: form })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success || !json.url) {
    throw new Error(json.error || `Upload gagal (HTTP ${res.status})`)
  }
  return json.url as string
}
