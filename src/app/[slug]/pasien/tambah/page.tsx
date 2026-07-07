'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function TambahPasienPage({ params }: { params: { slug: string } }) {
  const router      = useRouter()
  const searchParams = useSearchParams()

  const noHpDefault = searchParams.get('no_hp') || ''
  const dariInbox   = searchParams.get('dari') === 'inbox'

  const [form, setForm] = useState({
    name:           '',
    no_hp:          noHpDefault,
    email:          '',
    jenis_kelamin:  '',
    tanggal_lahir:  '',
    nik:            '',
    alamat:         '',
    no_rm:          '',
    kategori:       'pasien',
  })
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  function set(field: string, val: string) {
    setForm(f => ({ ...f, [field]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const res  = await fetch(`/api/${params.slug}/pasien`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      const json = await res.json()
      if (!json.success) { setError(json.error || 'Gagal menyimpan'); return }

      if (dariInbox) {
        router.push(`/${params.slug}/inbox`)
      } else {
        router.push(`/${params.slug}/pasien/${json.data.id}`)
      }
    } catch {
      setError('Terjadi kesalahan jaringan')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 'var(--r-md)',
    border: '1.5px solid var(--c-border)', fontSize: 'var(--font-size-sm)',
    fontFamily: 'inherit', color: 'var(--c-text)', background: 'white', outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 700,
    color: 'var(--c-text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px',
  }
  const fieldStyle: React.CSSProperties = { marginBottom: 20 }

  return (
    <div style={{ padding: 'var(--sp-6)', flex: 1, maxWidth: 640 }}>
      {/* Header */}
      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-secondary)', fontSize: 14, fontWeight: 600, padding: 0, marginBottom: 8 }}
        >
          ← Kembali
        </button>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
          Tambah Pasien Manual
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--c-text-muted)' }}>
          Daftarkan kontak baru ke dalam sistem.
        </p>
      </div>

      <div style={{ background: 'var(--c-surface)', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)', padding: 'var(--sp-6)', boxShadow: 'var(--shadow-sm)' }}>
        <form onSubmit={handleSubmit}>

          {error && (
            <div style={{
              background: 'var(--c-error-light)', border: '1px solid var(--c-error)',
              color: 'var(--c-error)', borderRadius: 'var(--r-md)', padding: '10px 16px',
              fontSize: 'var(--font-size-sm)', marginBottom: 20,
            }}>
              {error}
            </div>
          )}

          <div style={fieldStyle}>
            <label style={labelStyle}>Nama Lengkap *</label>
            <input
              style={inputStyle} required
              placeholder="Nama lengkap pasien"
              value={form.name} onChange={e => set('name', e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, ...fieldStyle }}>
            <div>
              <label style={labelStyle}>No. HP / WhatsApp</label>
              <input
                style={inputStyle} type="tel"
                placeholder="0812xxxxxxxx"
                value={form.no_hp} onChange={e => set('no_hp', e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input
                style={inputStyle} type="email"
                placeholder="email@contoh.com"
                value={form.email} onChange={e => set('email', e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, ...fieldStyle }}>
            <div>
              <label style={labelStyle}>Jenis Kelamin</label>
              <select style={inputStyle} value={form.jenis_kelamin} onChange={e => set('jenis_kelamin', e.target.value)}>
                <option value="">— Pilih —</option>
                <option value="L">Laki-laki</option>
                <option value="P">Perempuan</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Tanggal Lahir</label>
              <input
                style={inputStyle} type="date"
                value={form.tanggal_lahir} onChange={e => set('tanggal_lahir', e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, ...fieldStyle }}>
            <div>
              <label style={labelStyle}>NIK</label>
              <input
                style={inputStyle} maxLength={16}
                placeholder="16 digit NIK KTP"
                value={form.nik} onChange={e => set('nik', e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>No. Rekam Medis</label>
              <input
                style={inputStyle}
                placeholder="No. RM (opsional)"
                value={form.no_rm} onChange={e => set('no_rm', e.target.value)}
              />
            </div>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Alamat</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
              placeholder="Alamat lengkap (opsional)"
              value={form.alamat} onChange={e => set('alamat', e.target.value)}
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Kategori</label>
            <select style={inputStyle} value={form.kategori} onChange={e => set('kategori', e.target.value)}>
              <option value="pasien">Pasien</option>
              <option value="keluarga">Keluarga Pasien</option>
              <option value="umum">Umum</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="button" onClick={() => router.back()}
              style={{
                padding: '10px 20px', borderRadius: 'var(--r-md)',
                border: '1.5px solid var(--c-border)', background: 'white',
                color: 'var(--c-text)', fontSize: 'var(--font-size-sm)',
                fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Batal
            </button>
            <button
              type="submit" disabled={saving}
              style={{
                padding: '10px 24px', borderRadius: 'var(--r-md)',
                border: 'none', background: saving ? 'var(--c-border)' : 'var(--c-secondary)',
                color: 'white', fontSize: 'var(--font-size-sm)',
                fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
              }}
            >
              {saving ? 'Menyimpan...' : '＋ Simpan Pasien'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
