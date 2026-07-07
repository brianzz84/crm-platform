'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const JENIS_OPTIONS = [
  'Seminar / Webinar', 'Penyuluhan Kesehatan', 'Bakti Sosial',
  'Pemeriksaan Gratis', 'Pameran / Expo', 'Pelatihan', 'Gathering', 'Lainnya',
]

interface KegiatanFormProps {
  slug:     string
  id?:      string   // undefined = baru
  initial?: {
    nama: string; jenis: string; tanggal_mulai: string; tanggal_selesai: string
    lokasi: string; penyelenggara: string; keterangan: string; poin_kegiatan: number; status: string
  }
}

export default function KegiatanForm({ slug, id, initial }: KegiatanFormProps) {
  const router  = useRouter()
  const isEdit  = !!id
  const [form, setForm] = useState({
    nama:           initial?.nama           || '',
    jenis:          initial?.jenis          || JENIS_OPTIONS[0],
    tanggal_mulai:  initial?.tanggal_mulai  || '',
    tanggal_selesai:initial?.tanggal_selesai|| '',
    lokasi:         initial?.lokasi         || '',
    penyelenggara:  initial?.penyelenggara  || '',
    keterangan:     initial?.keterangan     || '',
    poin_kegiatan:  initial?.poin_kegiatan  ?? 25,
    status:         initial?.status         || 'aktif',
  })
  const [errors,  setErrors]  = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const inp: React.CSSProperties = {
    display: 'block', width: '100%', padding: '9px 12px',
    fontFamily: 'inherit', fontSize: 'var(--font-size-sm)',
    border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-md)',
    color: 'var(--c-text)', background: 'white', outline: 'none',
    boxSizing: 'border-box',
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const err: Record<string, string> = {}
    if (!form.nama.trim())       err.nama = 'Nama kegiatan wajib diisi'
    if (!form.tanggal_mulai)     err.tanggal_mulai = 'Tanggal mulai wajib diisi'
    if (Object.keys(err).length) { setErrors(err); return }

    setLoading(true)
    try {
      const url    = isEdit ? `/api/${slug}/kegiatan/${id}` : `/api/${slug}/kegiatan`
      const method = isEdit ? 'PUT' : 'POST'
      const res    = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) { setErrors({ _: json.error || 'Terjadi kesalahan' }); return }
      router.push(`/${slug}/kegiatan/${isEdit ? id : json.id}`)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  const set = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }))

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 'var(--sp-5)', alignItems: 'start' }}>
        {/* Kolom kiri */}
        <div style={{ background: 'white', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)', padding: 'var(--sp-5)' }}>
          <div style={{ fontWeight: 700, color: 'var(--c-text)', marginBottom: 'var(--sp-5)', fontSize: 'var(--font-size-base)' }}>
            Informasi Kegiatan
          </div>

          {errors._ && (
            <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: 'var(--sp-3) var(--sp-4)', borderRadius: 'var(--r-sm)', marginBottom: 'var(--sp-4)', fontSize: 'var(--font-size-sm)', borderLeft: '3px solid #EF4444' }}>
              {errors._}
            </div>
          )}

          {/* Nama */}
          <div style={{ marginBottom: 'var(--sp-4)' }}>
            <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 6, color: 'var(--c-text)' }}>
              Nama Kegiatan <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input style={{ ...inp, borderColor: errors.nama ? '#EF4444' : undefined }}
              value={form.nama} onChange={e => set('nama', e.target.value)}
              placeholder="Contoh: Seminar Kesehatan Jantung 2025" />
            {errors.nama && <div style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{errors.nama}</div>}
          </div>

          {/* Jenis + Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 6, color: 'var(--c-text)' }}>Jenis Kegiatan</label>
              <select style={inp} value={form.jenis} onChange={e => set('jenis', e.target.value)}>
                {JENIS_OPTIONS.map(j => <option key={j} value={j}>{j}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 6, color: 'var(--c-text)' }}>Status</label>
              <select style={inp} value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="aktif">Aktif</option>
                <option value="selesai">Selesai</option>
              </select>
            </div>
          </div>

          {/* Tanggal */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 6, color: 'var(--c-text)' }}>
                Tanggal Mulai <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input type="date" style={{ ...inp, borderColor: errors.tanggal_mulai ? '#EF4444' : undefined }}
                value={form.tanggal_mulai} onChange={e => set('tanggal_mulai', e.target.value)} />
              {errors.tanggal_mulai && <div style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{errors.tanggal_mulai}</div>}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 6, color: 'var(--c-text)' }}>Tanggal Selesai</label>
              <input type="date" style={inp}
                value={form.tanggal_selesai} onChange={e => set('tanggal_selesai', e.target.value)} />
            </div>
          </div>

          {/* Lokasi + Penyelenggara */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 6, color: 'var(--c-text)' }}>Lokasi</label>
              <input style={inp} value={form.lokasi} onChange={e => set('lokasi', e.target.value)}
                placeholder="Contoh: Aula RKZ Surabaya" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 6, color: 'var(--c-text)' }}>Penyelenggara</label>
              <input style={inp} value={form.penyelenggara} onChange={e => set('penyelenggara', e.target.value)}
                placeholder="Contoh: Divisi Humas RKZ" />
            </div>
          </div>

          {/* Poin */}
          <div style={{ marginBottom: 'var(--sp-4)' }}>
            <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 6, color: 'var(--c-text)' }}>
              Poin Kehadiran
            </label>
            <input type="number" min={0} style={{ ...inp, width: 160 }}
              value={form.poin_kegiatan} onChange={e => set('poin_kegiatan', parseInt(e.target.value) || 0)} />
            <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 4 }}>
              Poin loyalty yang diberikan kepada peserta yang hadir
            </div>
          </div>

          {/* Keterangan */}
          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 6, color: 'var(--c-text)' }}>Keterangan</label>
            <textarea style={{ ...inp, resize: 'vertical', minHeight: 80 }} rows={3}
              value={form.keterangan} onChange={e => set('keterangan', e.target.value)}
              placeholder="Deskripsi singkat kegiatan..." />
          </div>
        </div>

        {/* Kolom kanan — tombol simpan */}
        <div style={{ background: 'white', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)', padding: 'var(--sp-5)', position: 'sticky', top: 24 }}>
          <div style={{ fontWeight: 700, color: 'var(--c-text)', marginBottom: 'var(--sp-4)', fontSize: 'var(--font-size-base)' }}>
            Simpan
          </div>
          <button type="submit" disabled={loading} style={{
            display: 'block', width: '100%', padding: '10px',
            background: loading ? '#94A3B8' : 'var(--c-secondary)',
            color: 'white', border: 'none', borderRadius: 'var(--r-md)',
            fontFamily: 'inherit', fontSize: 'var(--font-size-sm)', fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', marginBottom: 'var(--sp-3)',
          }}>
            {loading ? 'Menyimpan...' : isEdit ? 'Perbarui Kegiatan' : 'Simpan Kegiatan'}
          </button>
          <a href={`/${slug}/kegiatan${isEdit ? `/${id}` : ''}`} style={{
            display: 'block', textAlign: 'center', padding: '10px',
            border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-md)',
            fontSize: 'var(--font-size-sm)', color: 'var(--c-text-faint)', textDecoration: 'none',
          }}>
            Batal
          </a>

          {isEdit && (
            <div style={{ marginTop: 'var(--sp-5)', paddingTop: 'var(--sp-4)', borderTop: '1px solid var(--c-border)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--c-text-faint)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>ID Kegiatan</div>
              <div style={{ fontSize: 11, color: 'var(--c-text-faint)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{id}</div>
            </div>
          )}
        </div>
      </div>
    </form>
  )
}
