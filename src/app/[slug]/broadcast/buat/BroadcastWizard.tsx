'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/* ─── Types ─── */
interface Segment { id: string; nama: string; deskripsi: string | null; _count: { segment_persons: number } }
interface FormState {
  segment_id:   string
  channel:      'WA' | 'IG' | 'FB'
  template_id:  string
  pesan:        string
  nama:         string
  jadwal_type:  'sekarang' | 'jadwal'
  jadwal_kirim: string   // ISO string
}

/* ─── Helpers ─── */
const CHANNEL_OPT = [
  { val: 'WA', label: 'WhatsApp',          icon: '📱', desc: 'Via Wappin API — template pra-approved' },
  { val: 'IG', label: 'Instagram DM',      icon: '📸', desc: 'Membutuhkan koneksi IG Business' },
  { val: 'FB', label: 'Facebook Messenger',icon: '📘', desc: 'Membutuhkan koneksi Facebook Page' },
] as const

const STEP_LABELS = ['Segmen', 'Pesan', 'Jadwal', 'Konfirmasi']

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px',
  fontFamily: 'inherit', fontSize: 'var(--font-size-sm)',
  border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-md)',
  background: 'white', color: 'var(--c-text)', outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600,
  color: 'var(--c-text)', marginBottom: 6,
}

function FieldWrap({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 'var(--sp-5)' }}>
      <label style={labelStyle}>{label}</label>
      {hint && <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 6 }}>{hint}</div>}
      {children}
    </div>
  )
}

/* ─── Stepper indicator ─── */
function Stepper({ step }: { step: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 'var(--sp-7)' }}>
      {STEP_LABELS.map((l, i) => {
        const done   = i < step
        const active = i === step
        return (
          <div key={l} style={{ display: 'flex', alignItems: 'center', flex: i < STEP_LABELS.length - 1 ? 1 : 'initial' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', fontSize: 13, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? 'var(--c-success)' : active ? 'var(--c-secondary)' : 'var(--c-border)',
                color: done || active ? 'white' : 'var(--c-text-muted)',
                transition: 'background .2s',
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 11, fontWeight: active ? 700 : 400, color: active ? 'var(--c-secondary)' : done ? 'var(--c-success)' : 'var(--c-text-muted)', whiteSpace: 'nowrap' }}>
                {l}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? 'var(--c-success)' : 'var(--c-border)', margin: '0 8px', marginBottom: 20, transition: 'background .2s' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ─── Main Wizard ─── */
export default function BroadcastWizard({ slug, defaultSegmentId }: { slug: string; defaultSegmentId?: string }) {
  const router   = useRouter()
  const [step, setStep]       = useState(0)
  const [form, setForm]       = useState<FormState>({
    segment_id: defaultSegmentId || '', channel: 'WA', template_id: '', pesan: '',
    nama: '', jadwal_type: 'sekarang', jadwal_kirim: '',
  })
  const [segments, setSegments]   = useState<Segment[]>([])
  const [loadingSeg, setLoadingSeg] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState('')
  const [successId, setSuccessId]   = useState('')

  // Character counter ref
  const charCount = form.pesan.length

  useEffect(() => {
    fetch(`/api/${slug}/segmen`)
      .then(r => r.json())
      .then(j => { if (j.success) setSegments(j.data) })
      .finally(() => setLoadingSeg(false))
  }, [slug])

  const upd = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }))

  const selectedSegment = segments.find(s => s.id === form.segment_id)

  /* ─── Validate per step ─── */
  function canNext() {
    if (step === 0) return !!form.segment_id
    if (step === 1) return form.nama.trim().length >= 3 && form.pesan.trim().length >= 10
    if (step === 2) return form.jadwal_type === 'sekarang' || !!form.jadwal_kirim
    return true
  }

  /* ─── Submit ─── */
  async function submit() {
    setSubmitting(true); setError('')
    try {
      const payload = {
        nama:         form.nama,
        channel:      form.channel,
        pesan:        form.pesan,
        segment_id:   form.segment_id || null,
        template_id:  form.template_id || null,
        jadwal_kirim: form.jadwal_type === 'jadwal' ? form.jadwal_kirim : null,
      }
      const res  = await fetch(`/api/${slug}/broadcast`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json()
      if (!json.success) throw new Error(JSON.stringify(json.error))
      setSuccessId(json.data.id)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  /* ─── Success state ─── */
  if (successId) {
    return (
      <div style={{ background: 'white', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', padding: 'var(--sp-8)', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ fontSize: 56, marginBottom: 'var(--sp-4)' }}>🎉</div>
        <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 8 }}>
          Campaign Berhasil Dibuat!
        </h2>
        <p style={{ color: 'var(--c-text-muted)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--sp-6)' }}>
          {form.jadwal_type === 'jadwal'
            ? `Campaign dijadwalkan untuk dikirim pada ${new Date(form.jadwal_kirim).toLocaleString('id-ID')}.`
            : 'Campaign tersimpan sebagai draft. Aktifkan dari halaman detail.'}
        </p>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href={`/${slug}/broadcast/${successId}`}
            style={{ padding: '10px 24px', borderRadius: 'var(--r-md)', background: 'var(--c-secondary)', color: 'white', fontWeight: 700, textDecoration: 'none' }}>
            Lihat Campaign
          </a>
          <a href={`/${slug}/broadcast`}
            style={{ padding: '10px 24px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--c-border)', color: 'var(--c-text)', fontWeight: 600, textDecoration: 'none' }}>
            Kembali ke Daftar
          </a>
        </div>
      </div>
    )
  }

  const card: React.CSSProperties = {
    background: 'white', border: '1px solid var(--c-border)',
    borderRadius: 'var(--r-lg)', padding: 'var(--sp-7)',
    boxShadow: 'var(--shadow-sm)',
  }

  return (
    <div>
      <Stepper step={step} />

      <div style={card}>
        {/* ═══ STEP 0: Pilih Segmen ═══ */}
        {step === 0 && (
          <div>
            <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--c-primary)', marginBottom: 4 }}>Pilih Segmen Penerima</h2>
            <p style={{ fontSize: 13, color: 'var(--c-text-muted)', marginBottom: 'var(--sp-6)' }}>Pilih kelompok pasien yang akan menerima pesan broadcast ini.</p>

            {loadingSeg ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--c-text-muted)' }}>Memuat segmen...</div>
            ) : segments.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--c-text-muted)' }}>
                Belum ada segmen. Buat segmen terlebih dahulu di modul Segmentasi.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                {segments.map(s => {
                  const selected = form.segment_id === s.id
                  return (
                    <button key={s.id} onClick={() => upd('segment_id', s.id)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: 'var(--sp-4)', borderRadius: 'var(--r-md)', cursor: 'pointer', textAlign: 'left',
                        border: selected ? '2px solid var(--c-secondary)' : '1.5px solid var(--c-border)',
                        background: selected ? 'var(--c-secondary)08' : 'white',
                        fontFamily: 'inherit',
                        transition: 'border-color .15s, background .15s',
                      }}>
                      <div>
                        <div style={{ fontWeight: 600, color: selected ? 'var(--c-secondary)' : 'var(--c-text)', fontSize: 'var(--font-size-sm)' }}>
                          {selected && '✓ '}{s.nama}
                        </div>
                        {s.deskripsi && <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginTop: 2 }}>{s.deskripsi}</div>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: selected ? 'var(--c-secondary)' : 'var(--c-primary)' }}>
                          {s._count.segment_persons.toLocaleString('id-ID')}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>pasien</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ STEP 1: Susun Pesan ═══ */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--c-primary)', marginBottom: 4 }}>Susun Pesan</h2>
            <p style={{ fontSize: 13, color: 'var(--c-text-muted)', marginBottom: 'var(--sp-6)' }}>Tulis nama campaign dan isi pesan yang akan dikirim ke {selectedSegment?._count.segment_persons.toLocaleString('id-ID') ?? '—'} pasien.</p>

            <FieldWrap label="Nama Campaign">
              <input value={form.nama} onChange={e => upd('nama', e.target.value)}
                placeholder="Contoh: Reminder Kontrol Jantung - Juli 2026"
                style={inputStyle} />
            </FieldWrap>

            <FieldWrap label="Channel Pengiriman">
              <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                {CHANNEL_OPT.map(c => {
                  const sel = form.channel === c.val
                  return (
                    <button key={c.val} onClick={() => upd('channel', c.val)}
                      style={{
                        padding: '10px 16px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                        border: sel ? '2px solid var(--c-secondary)' : '1.5px solid var(--c-border)',
                        background: sel ? 'var(--c-secondary)08' : 'white', fontFamily: 'inherit', textAlign: 'left',
                      }}>
                      <div style={{ fontSize: 20, marginBottom: 4 }}>{c.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: sel ? 700 : 500, color: sel ? 'var(--c-secondary)' : 'var(--c-text)' }}>{c.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>{c.desc}</div>
                    </button>
                  )
                })}
              </div>
            </FieldWrap>

            {form.channel === 'WA' && (
              <FieldWrap label="Template ID Wappin" hint="Opsional. ID template pre-approved dari dasbor Wappin.">
                <input value={form.template_id} onChange={e => upd('template_id', e.target.value)}
                  placeholder="Contoh: reminder_kontrol_v2"
                  style={inputStyle} />
              </FieldWrap>
            )}

            <FieldWrap label="Isi Pesan">
              <div style={{ position: 'relative' }}>
                <textarea value={form.pesan} onChange={e => upd('pesan', e.target.value)}
                  rows={7} placeholder="Halo {nama}, kami mengingatkan..."
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
                <div style={{ position: 'absolute', bottom: 10, right: 12, fontSize: 11, color: charCount > 1000 ? 'var(--c-danger)' : 'var(--c-text-faint)' }}>
                  {charCount} karakter
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--c-text-muted)' }}>
                Variabel: <code style={{ background: 'var(--c-bg)', padding: '1px 5px', borderRadius: 3 }}>{'{nama}'}</code>{' '}
                <code style={{ background: 'var(--c-bg)', padding: '1px 5px', borderRadius: 3 }}>{'{no_rm}'}</code>{' '}
                <code style={{ background: 'var(--c-bg)', padding: '1px 5px', borderRadius: 3 }}>{'{poli}'}</code>
              </div>
            </FieldWrap>

            {/* Preview bubble */}
            {form.pesan && (
              <div style={{ background: '#ECF9F1', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', marginTop: 'var(--sp-2)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#278B58', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Preview Pesan
                </div>
                <div style={{
                  background: 'white', borderRadius: '0 12px 12px 12px',
                  padding: '10px 14px', maxWidth: 340,
                  fontSize: 13, lineHeight: 1.6, color: 'var(--c-text)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                  whiteSpace: 'pre-wrap',
                }}>
                  {form.pesan.replace('{nama}', 'Budi Santoso').replace('{no_rm}', 'RM-001234').replace('{poli}', 'Poli Jantung')}
                </div>
                <div style={{ fontSize: 11, color: '#278B58', marginTop: 6, textAlign: 'right', maxWidth: 340 }}>
                  {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} ✓✓
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ STEP 2: Jadwal Kirim ═══ */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--c-primary)', marginBottom: 4 }}>Jadwal Pengiriman</h2>
            <p style={{ fontSize: 13, color: 'var(--c-text-muted)', marginBottom: 'var(--sp-6)' }}>Tentukan kapan pesan akan dikirim.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginBottom: 'var(--sp-5)' }}>
              {[
                { val: 'sekarang', label: 'Simpan sebagai Draft', desc: 'Campaign disimpan. Aktifkan manual dari halaman detail.', icon: '📝' },
                { val: 'jadwal',   label: 'Jadwalkan Pengiriman',  desc: 'Tentukan tanggal dan jam pengiriman otomatis.', icon: '📅' },
              ].map(o => {
                const sel = form.jadwal_type === o.val
                return (
                  <button key={o.val} onClick={() => upd('jadwal_type', o.val)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', padding: 'var(--sp-4)',
                      borderRadius: 'var(--r-md)', cursor: 'pointer', textAlign: 'left',
                      border: sel ? '2px solid var(--c-secondary)' : '1.5px solid var(--c-border)',
                      background: sel ? 'var(--c-secondary)08' : 'white', fontFamily: 'inherit',
                    }}>
                    <span style={{ fontSize: 28 }}>{o.icon}</span>
                    <div>
                      <div style={{ fontWeight: sel ? 700 : 500, color: sel ? 'var(--c-secondary)' : 'var(--c-text)', fontSize: 14 }}>
                        {sel && '✓ '}{o.label}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginTop: 2 }}>{o.desc}</div>
                    </div>
                  </button>
                )
              })}
            </div>

            {form.jadwal_type === 'jadwal' && (
              <FieldWrap label="Tanggal & Jam Pengiriman">
                <input type="datetime-local" value={form.jadwal_kirim}
                  onChange={e => upd('jadwal_kirim', e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  style={inputStyle} />
              </FieldWrap>
            )}
          </div>
        )}

        {/* ═══ STEP 3: Konfirmasi ═══ */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--c-primary)', marginBottom: 4 }}>Konfirmasi Campaign</h2>
            <p style={{ fontSize: 13, color: 'var(--c-text-muted)', marginBottom: 'var(--sp-6)' }}>Periksa kembali sebelum menyimpan.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginBottom: 'var(--sp-6)' }}>
              {[
                { label: 'Nama Campaign', val: form.nama },
                { label: 'Segmen',        val: selectedSegment ? `${selectedSegment.nama} (${selectedSegment._count.segment_persons.toLocaleString('id-ID')} pasien)` : '—' },
                { label: 'Channel',       val: CHANNEL_OPT.find(c => c.val === form.channel)?.label ?? form.channel },
                { label: 'Template ID',   val: form.template_id || '(tidak ada)' },
                { label: 'Jadwal',        val: form.jadwal_type === 'jadwal' ? new Date(form.jadwal_kirim).toLocaleString('id-ID') : 'Disimpan sebagai Draft' },
              ].map(row => (
                <div key={row.label} style={{
                  display: 'flex', gap: 'var(--sp-4)',
                  padding: 'var(--sp-3) var(--sp-4)', borderRadius: 'var(--r-sm)',
                  background: 'var(--c-bg)', fontSize: 'var(--font-size-sm)',
                }}>
                  <span style={{ color: 'var(--c-text-muted)', minWidth: 130, flexShrink: 0 }}>{row.label}</span>
                  <span style={{ fontWeight: 500, color: 'var(--c-text)' }}>{row.val}</span>
                </div>
              ))}
            </div>

            {/* Pesan preview */}
            <div style={{ background: 'var(--c-bg)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', marginBottom: 'var(--sp-5)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Isi Pesan</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--c-text)', whiteSpace: 'pre-wrap' }}>{form.pesan}</div>
            </div>

            {error && (
              <div style={{ background: '#FDECEA', border: '1px solid #FBBABA', borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)', fontSize: 13, color: '#C0392B', marginBottom: 'var(--sp-4)' }}>
                ⚠ {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--sp-5)' }}>
        <button
          onClick={() => setStep(s => s - 1)}
          disabled={step === 0}
          style={{
            padding: '10px 24px', borderRadius: 'var(--r-md)',
            border: '1.5px solid var(--c-border)', background: 'white',
            color: step === 0 ? 'var(--c-text-faint)' : 'var(--c-text)',
            fontWeight: 600, fontSize: 'var(--font-size-sm)',
            cursor: step === 0 ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ← Sebelumnya
        </button>

        {step < 3 ? (
          <button
            onClick={() => setStep(s => s + 1)}
            disabled={!canNext()}
            style={{
              padding: '10px 28px', borderRadius: 'var(--r-md)',
              background: canNext() ? 'var(--c-secondary)' : 'var(--c-border)',
              color: canNext() ? 'white' : 'var(--c-text-faint)',
              fontWeight: 700, fontSize: 'var(--font-size-sm)',
              border: 'none', cursor: canNext() ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
            }}
          >
            Berikutnya →
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={submitting}
            style={{
              padding: '10px 32px', borderRadius: 'var(--r-md)',
              background: submitting ? 'var(--c-border)' : 'var(--c-secondary)',
              color: submitting ? 'var(--c-text-faint)' : 'white',
              fontWeight: 700, fontSize: 'var(--font-size-sm)',
              border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {submitting ? '⏳ Menyimpan...' : '✓ Simpan Campaign'}
          </button>
        )}
      </div>
    </div>
  )
}
