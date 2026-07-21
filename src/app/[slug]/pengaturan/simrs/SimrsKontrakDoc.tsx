'use client'

import { useCallback, useEffect, useState } from 'react'

type StatusField = 'wajib' | 'penting' | 'opsional'
type Bagian = 'non_fungsional' | 'kesepakatan' | 'pertanyaan_terbuka'

interface FieldKontrak {
  endpoint: 'kunjungan' | 'pasien'
  fieldNama: string
  status: StatusField
  contoh: string | null
  catatan: string | null
}
interface ItemKontrak {
  id: string
  bagian: Bagian
  judul: string | null
  isi: string
  status: string | null
  urutan: number
}
interface QueryParam { nama: string; contoh: string; keterangan: string }
interface EndpointSpec { kunci: 'kunjungan' | 'pasien'; method: string; pathContoh: string; queryParams: QueryParam[] }
interface EndpointDoc { spec: EndpointSpec; contohRespons: string }
interface KontrakDoc {
  endpointKunjungan: EndpointDoc
  endpointPasien: EndpointDoc
  fieldsKunjungan: FieldKontrak[]
  fieldsPasien: FieldKontrak[]
  nonFungsional: ItemKontrak[]
  kesepakatan: ItemKontrak[]
  pertanyaanTerbuka: ItemKontrak[]
  catatanUmum: string
}

const STATUS_CFG: Record<StatusField, { label: string; color: string; bg: string }> = {
  wajib:    { label: 'Wajib',    color: '#A3271F', bg: '#FBEAE9' },
  penting:  { label: 'Penting',  color: '#8A5A0A', bg: '#FCF1DC' },
  opsional: { label: 'Opsional', color: '#57606A', bg: '#EEF0F2' },
}

const kartu: React.CSSProperties = {
  background: 'white', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)',
  padding: 'var(--sp-5)', boxShadow: 'var(--shadow-sm)', marginBottom: 'var(--sp-5)',
}
const judulKartu: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: 'var(--c-primary)', marginBottom: 12 }
const inp: React.CSSProperties = {
  padding: '7px 10px', fontFamily: 'inherit', fontSize: 13,
  border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-sm)',
  outline: 'none', background: 'white', color: 'var(--c-text)', boxSizing: 'border-box', width: '100%',
}

// Blok kode read-only dengan tombol Salin. Isi endpoint & respons diturunkan dari
// kode (bukan diedit di sini), supaya dokumentasi tidak bisa menyimpang dari yang
// sungguhan dipanggil sync.
function KodeBlok({ teks }: { teks: string }) {
  const [tersalin, setTersalin] = useState(false)
  async function salin() {
    try { await navigator.clipboard.writeText(teks); setTersalin(true); setTimeout(() => setTersalin(false), 1500) } catch {}
  }
  return (
    <div style={{ position: 'relative', background: 'var(--c-bg)', border: '1px solid var(--c-border)', borderRadius: 8, marginTop: 8, overflowX: 'auto' }}>
      <button onClick={salin} type="button"
        style={{ position: 'absolute', top: 6, right: 6, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 5, border: '1px solid var(--c-border)', background: 'white', color: tersalin ? '#278B58' : 'var(--c-text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>
        {tersalin ? 'Tersalin ✓' : 'Salin'}
      </button>
      <pre style={{ margin: 0, padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6, color: 'var(--c-text)', whiteSpace: 'pre', minWidth: 0 }}>{teks}</pre>
    </div>
  )
}

function EndpointBlok({ judul, endpoint }: { judul: string; endpoint: EndpointDoc }) {
  const [showRespons, setShowRespons] = useState(false)
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)', marginBottom: 6 }}>{judul}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: '#E4F2F0', color: '#0E6E66' }}>{endpoint.spec.method}</span>
        <code style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--c-text)', wordBreak: 'break-all' }}>{endpoint.spec.pathContoh}</code>
      </div>

      {endpoint.spec.queryParams.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>{['Parameter', 'Contoh', 'Keterangan'].map(h => (
                <th key={h} style={{ padding: '5px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', borderBottom: '2px solid var(--c-border)' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {endpoint.spec.queryParams.map(q => (
                <tr key={q.nama} style={{ borderBottom: '1px solid var(--c-border)' }}>
                  <td style={{ padding: '5px 10px', fontFamily: 'monospace', fontWeight: 600 }}>{q.nama}</td>
                  <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: 'var(--c-text-muted)' }}>{q.contoh}</td>
                  <td style={{ padding: '5px 10px', color: 'var(--c-text-muted)' }}>{q.keterangan}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button onClick={() => setShowRespons(s => !s)} type="button"
        style={{ marginTop: 10, fontSize: 12, color: 'var(--c-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontWeight: 600 }}>
        {showRespons ? '▲ Sembunyikan bentuk respons' : '▼ Lihat bentuk respons (contoh)'}
      </button>
      {showRespons && (
        <>
          <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 6 }}>
            Dibangun otomatis dari contoh tiap field di bawah — ikut berubah saat contoh diperbarui.
          </div>
          <KodeBlok teks={endpoint.contohRespons} />
        </>
      )}
    </div>
  )
}

function FieldTable({
  judul, fields, onSave,
}: {
  judul: string
  fields: FieldKontrak[]
  onSave: (f: FieldKontrak, contoh: string, catatan: string) => Promise<void>
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [contoh, setContoh] = useState('')
  const [catatan, setCatatan] = useState('')
  const [saving, setSaving] = useState(false)

  function mulaiEdit(f: FieldKontrak) {
    setEditing(f.fieldNama); setContoh(f.contoh ?? ''); setCatatan(f.catatan ?? '')
  }
  async function simpan(f: FieldKontrak) {
    setSaving(true)
    try { await onSave(f, contoh, catatan); setEditing(null) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)', marginBottom: 8 }}>{judul}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Field', 'Status', 'Contoh', 'Catatan', ''].map(h => (
                <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', borderBottom: '2px solid var(--c-border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fields.map(f => {
              const cfg = STATUS_CFG[f.status]
              const isEditing = editing === f.fieldNama
              return (
                <tr key={f.fieldNama} style={{ borderBottom: '1px solid var(--c-border)' }}>
                  <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>{f.fieldNama}</td>
                  <td style={{ padding: '6px 10px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
                  </td>
                  {isEditing ? (
                    <>
                      <td style={{ padding: '6px 10px' }}><input value={contoh} onChange={e => setContoh(e.target.value)} style={inp} placeholder="contoh nilai" /></td>
                      <td style={{ padding: '6px 10px' }}><input value={catatan} onChange={e => setCatatan(e.target.value)} style={inp} placeholder="catatan" /></td>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                        <button onClick={() => simpan(f)} disabled={saving} style={{ marginRight: 6, border: 'none', background: 'var(--c-secondary)', color: 'white', borderRadius: 5, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Simpan</button>
                        <button onClick={() => setEditing(null)} style={{ border: '1px solid var(--c-border)', background: 'white', borderRadius: 5, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Batal</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 12, color: 'var(--c-text-muted)' }}>{f.contoh || '—'}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--c-text-muted)' }}>{f.catatan || '—'}</td>
                      <td style={{ padding: '6px 10px' }}>
                        <button onClick={() => mulaiEdit(f)} style={{ border: '1px solid var(--c-border)', background: 'white', borderRadius: 5, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--c-text-muted)' }}>Edit</button>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DaftarBebas({
  judul, bagian, items, tampilStatus, opsiStatus, onTambah, onUbah, onHapus,
}: {
  judul: string
  bagian: Bagian
  items: ItemKontrak[]
  tampilStatus: boolean
  opsiStatus?: { label: string; value: string }[]
  onTambah: (bagian: Bagian, judul: string | null, isi: string, status: string | null) => Promise<void>
  onUbah: (id: string, data: { judul?: string | null; isi?: string; status?: string | null }) => Promise<void>
  onHapus: (id: string) => Promise<void>
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [barisJudul, setBarisJudul] = useState('')
  const [barisIsi, setBarisIsi] = useState('')
  const [barisStatus, setBarisStatus] = useState(opsiStatus?.[0]?.value ?? '')
  const [saving, setSaving] = useState(false)

  async function tambah() {
    if (!barisIsi.trim()) return
    setSaving(true)
    try {
      await onTambah(bagian, barisJudul.trim() || null, barisIsi.trim(), opsiStatus ? barisStatus : null)
      setBarisJudul(''); setBarisIsi(''); setShowAdd(false)
    } finally { setSaving(false) }
  }

  return (
    <div style={kartu}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={judulKartu}>{judul}</div>
        <button onClick={() => setShowAdd(s => !s)}
          style={{ border: '1px solid var(--c-border)', background: 'white', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--c-secondary)' }}>
          {showAdd ? '✕ Batal' : '+ Tambah'}
        </button>
      </div>

      {showAdd && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, padding: 12, background: 'var(--c-bg)', borderRadius: 8 }}>
          {opsiStatus === undefined && judul.includes('Non-Fungsional') && (
            <input value={barisJudul} onChange={e => setBarisJudul(e.target.value)} placeholder="Aspek (mis. Ukuran halaman)" style={inp} />
          )}
          <textarea value={barisIsi} onChange={e => setBarisIsi(e.target.value)} placeholder="Isi" rows={2} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
          {opsiStatus && (
            <select value={barisStatus} onChange={e => setBarisStatus(e.target.value)} style={inp}>
              {opsiStatus.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          <button onClick={tambah} disabled={saving || !barisIsi.trim()}
            style={{ alignSelf: 'flex-start', border: 'none', background: 'var(--c-secondary)', color: 'white', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Simpan
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--c-text-muted)' }}>Belum ada.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(item => (
            <BarisBebas key={item.id} item={item} tampilStatus={tampilStatus} opsiStatus={opsiStatus} onUbah={onUbah} onHapus={onHapus} />
          ))}
        </div>
      )}
    </div>
  )
}

function BarisBebas({
  item, tampilStatus, opsiStatus, onUbah, onHapus,
}: {
  item: ItemKontrak
  tampilStatus: boolean
  opsiStatus?: { label: string; value: string }[]
  onUbah: (id: string, data: { judul?: string | null; isi?: string; status?: string | null }) => Promise<void>
  onHapus: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [isi, setIsi] = useState(item.isi)
  const [judul, setJudul] = useState(item.judul ?? '')
  const [status, setStatus] = useState(item.status ?? '')
  const [busy, setBusy] = useState(false)

  async function simpan() {
    setBusy(true)
    try { await onUbah(item.id, { judul: judul.trim() || null, isi, status: tampilStatus ? status : null }); setEditing(false) }
    finally { setBusy(false) }
  }
  async function hapus() {
    setBusy(true)
    try { await onHapus(item.id) } finally { setBusy(false) }
  }
  async function toggleTerjawab() {
    setBusy(true)
    try { await onUbah(item.id, { status: item.status === 'terjawab' ? 'terbuka' : 'terjawab' }) } finally { setBusy(false) }
  }

  const statusOpen = opsiStatus?.some(o => o.value === 'terjawab')

  return (
    <div style={{
      border: '1px solid var(--c-border)', borderRadius: 8, padding: '10px 14px',
      display: 'flex', gap: 10, alignItems: 'flex-start',
      opacity: item.status === 'terjawab' ? 0.6 : 1,
    }}>
      {statusOpen && (
        <input type="checkbox" checked={item.status === 'terjawab'} onChange={toggleTerjawab} disabled={busy}
          style={{ marginTop: 3, width: 16, height: 16, accentColor: 'var(--c-secondary)', cursor: 'pointer' }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {item.judul !== null && <input value={judul} onChange={e => setJudul(e.target.value)} style={inp} />}
            <textarea value={isi} onChange={e => setIsi(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
            {tampilStatus && !statusOpen && opsiStatus && (
              <select value={status} onChange={e => setStatus(e.target.value)} style={inp}>
                {opsiStatus.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
            <div>
              <button onClick={simpan} disabled={busy} style={{ marginRight: 6, border: 'none', background: 'var(--c-secondary)', color: 'white', borderRadius: 5, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Simpan</button>
              <button onClick={() => setEditing(false)} style={{ border: '1px solid var(--c-border)', background: 'white', borderRadius: 5, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Batal</button>
            </div>
          </div>
        ) : (
          <>
            {item.judul && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>{item.judul}</div>}
            <div style={{ fontSize: 13, color: 'var(--c-text)', textDecoration: item.status === 'terjawab' ? 'line-through' : 'none' }}>{item.isi}</div>
            {tampilStatus && item.status && !statusOpen && (
              <span style={{ fontSize: 11, color: 'var(--c-text-muted)', marginTop: 2, display: 'inline-block' }}>{item.status}</span>
            )}
          </>
        )}
      </div>
      {!editing && (
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button onClick={() => setEditing(true)} style={{ border: '1px solid var(--c-border)', background: 'white', borderRadius: 5, padding: '4px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--c-text-muted)' }}>Edit</button>
          <button onClick={hapus} disabled={busy} style={{ border: '1px solid var(--c-border)', background: 'white', borderRadius: 5, padding: '4px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: '#C0392B' }}>Hapus</button>
        </div>
      )}
    </div>
  )
}

export default function SimrsKontrakDoc({ slug }: { slug: string }) {
  const [doc, setDoc] = useState<KontrakDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [catatanUmum, setCatatanUmum] = useState('')
  const [editingCatatan, setEditingCatatan] = useState(false)
  const [savingCatatan, setSavingCatatan] = useState(false)

  const muat = useCallback(async () => {
    try {
      const res  = await fetch(`/api/${slug}/simrs/kontrak`)
      const json = await res.json()
      if (json.success) { setDoc(json.data); setCatatanUmum(json.data.catatanUmum) }
      else setError(json.error || 'Gagal memuat dokumentasi')
    } catch { setError('Gagal menghubungi server') }
    setLoading(false)
  }, [slug])

  useEffect(() => { muat() }, [muat])

  async function simpanField(f: FieldKontrak, contoh: string, catatan: string) {
    await fetch(`/api/${slug}/simrs/kontrak/field`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: f.endpoint, field_nama: f.fieldNama, contoh: contoh || null, catatan: catatan || null }),
    })
    await muat()
  }

  async function tambahItem(bagian: Bagian, judul: string | null, isi: string, status: string | null) {
    await fetch(`/api/${slug}/simrs/kontrak/item`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bagian, judul, isi, status }),
    })
    await muat()
  }
  async function ubahItem(id: string, data: { judul?: string | null; isi?: string; status?: string | null }) {
    await fetch(`/api/${slug}/simrs/kontrak/item`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...data }),
    })
    await muat()
  }
  async function hapusItemUi(id: string) {
    if (!window.confirm('Hapus baris ini?')) return
    await fetch(`/api/${slug}/simrs/kontrak/item?id=${id}`, { method: 'DELETE' })
    await muat()
  }
  async function simpanCatatan() {
    setSavingCatatan(true)
    try {
      await fetch(`/api/${slug}/simrs/kontrak/catatan`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catatan_umum: catatanUmum }),
      })
      setEditingCatatan(false)
    } finally { setSavingCatatan(false) }
  }

  if (loading) return <div style={{ ...kartu, textAlign: 'center', color: 'var(--c-text-muted)' }}>Memuat dokumentasi…</div>
  if (error) return <div style={{ ...kartu, color: '#C0392B' }}>⚠ {error}</div>
  if (!doc) return null

  return (
    <div>
      <div style={kartu}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={judulKartu}>📄 Dokumentasi Kontrak API SIMRS</div>
          {!editingCatatan && (
            <button onClick={() => setEditingCatatan(true)}
              style={{ border: '1px solid var(--c-border)', background: 'white', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--c-secondary)' }}>
              Edit Catatan
            </button>
          )}
        </div>
        <p style={{ fontSize: 13, color: 'var(--c-text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
          Acuan field yang perlu disiapkan tim IT sebelum endpoint SIMRS dibangun. Nama & status field
          (Wajib/Penting/Opsional) ikut kontrak yang sungguhan dipakai sistem — hanya contoh nilai dan
          catatan yang bisa disesuaikan, supaya dokumentasi ini tidak pernah menyimpang dari yang benar-benar divalidasi.
        </p>
        {editingCatatan ? (
          <div>
            <textarea value={catatanUmum} onChange={e => setCatatanUmum(e.target.value)} rows={6}
              placeholder="Ringkasan, autentikasi, proses kalau kontrak berubah, dsb."
              style={{ ...inp, resize: 'vertical', fontFamily: 'inherit', marginBottom: 8 }} />
            <button onClick={simpanCatatan} disabled={savingCatatan}
              style={{ marginRight: 6, border: 'none', background: 'var(--c-secondary)', color: 'white', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {savingCatatan ? 'Menyimpan…' : 'Simpan'}
            </button>
            <button onClick={() => { setEditingCatatan(false); setCatatanUmum(doc.catatanUmum) }}
              style={{ border: '1px solid var(--c-border)', background: 'white', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              Batal
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--c-text)', whiteSpace: 'pre-wrap', background: 'var(--c-bg)', padding: 12, borderRadius: 8 }}>
            {doc.catatanUmum || <span style={{ color: 'var(--c-text-faint)' }}>Belum ada catatan.</span>}
          </div>
        )}
      </div>

      <div style={kartu}>
        <EndpointBlok judul="Endpoint Kunjungan (Delta Harian)" endpoint={doc.endpointKunjungan} />
        <FieldTable judul="Field Kunjungan" fields={doc.fieldsKunjungan} onSave={simpanField} />
      </div>

      <div style={kartu}>
        <EndpointBlok judul="Endpoint Pasien (by No. RM)" endpoint={doc.endpointPasien} />
        <FieldTable judul="Field Pasien" fields={doc.fieldsPasien} onSave={simpanField} />
      </div>

      <DaftarBebas
        judul="Aturan Non-Fungsional"
        bagian="non_fungsional"
        items={doc.nonFungsional}
        tampilStatus
        onTambah={tambahItem} onUbah={ubahItem} onHapus={hapusItemUi}
      />

      <DaftarBebas
        judul="Kesepakatan yang Sudah Dikonfirmasi"
        bagian="kesepakatan"
        items={doc.kesepakatan}
        tampilStatus={false}
        onTambah={tambahItem} onUbah={ubahItem} onHapus={hapusItemUi}
      />

      <DaftarBebas
        judul="Pertanyaan Terbuka"
        bagian="pertanyaan_terbuka"
        items={doc.pertanyaanTerbuka}
        tampilStatus
        opsiStatus={[{ label: 'Terbuka', value: 'terbuka' }, { label: 'Terjawab', value: 'terjawab' }]}
        onTambah={tambahItem} onUbah={ubahItem} onHapus={hapusItemUi}
      />
    </div>
  )
}
