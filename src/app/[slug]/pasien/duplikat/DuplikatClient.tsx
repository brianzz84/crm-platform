'use client'

import { useCallback, useEffect, useState } from 'react'

interface Calon {
  person_a_id: string; person_b_id: string
  a_nama: string; a_no_rm: string | null; a_no_hp: string | null; a_tanggal_lahir: string | null
  b_nama: string; b_no_rm: string | null; b_no_hp: string | null; b_tanggal_lahir: string | null
  dasar: string
  keyakinan: 'tinggi' | 'sedang' | 'rendah'
}

interface RiwayatRow {
  id: string
  alasan: string
  dilakukan_at: string
  dibatalkan_at: string | null
  sumber: { id: string; name: string; no_rm: string | null } | null
  tujuan: { id: string; name: string; no_rm: string | null } | null
  dipindahkan: Record<string, unknown>
}

const WARNA_KEYAKINAN: Record<Calon['keyakinan'], { bg: string; fg: string; label: string }> = {
  tinggi: { bg: '#FDECEA', fg: '#C0392B', label: 'Keyakinan tinggi' },
  sedang: { bg: '#FDF3DC', fg: '#9A6C00', label: 'Keyakinan sedang' },
  rendah: { bg: '#EEF2F7', fg: '#546E7A', label: 'Keyakinan rendah' },
}

const fmtTgl = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const kartu: React.CSSProperties = {
  background: 'white', border: '1px solid var(--c-border)',
  borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-sm)',
}

export default function DuplikatClient({ slug }: { slug: string }) {
  const [tab, setTab]         = useState<'antrean' | 'riwayat'>('antrean')
  const [calon, setCalon]     = useState<Calon[]>([])
  const [riwayat, setRiwayat] = useState<RiwayatRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [pesan, setPesan]     = useState('')
  const [sibuk, setSibuk]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const url  = tab === 'antrean' ? `/api/${slug}/pasien/duplikat` : `/api/${slug}/pasien/duplikat/riwayat`
      const res  = await fetch(url)
      const json = await res.json()
      if (!json.success) { setError(json.error || 'Gagal memuat data'); return }
      if (tab === 'antrean') setCalon(json.data ?? [])
      else                   setRiwayat(json.data ?? [])
    } catch { setError('Gagal memuat data') }
    finally { setLoading(false) }
  }, [slug, tab])

  useEffect(() => { load() }, [load])

  async function kirim(url: string, body: object, sukses: string, kunci: string) {
    setSibuk(kunci); setError(''); setPesan('')
    try {
      const res  = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.success) { setError(json.error || 'Gagal'); return }
      setPesan(sukses)
      await load()
    } catch { setError('Gagal menghubungi server') }
    finally { setSibuk(null) }
  }

  function gabung(c: Calon, sumberId: string, tujuanId: string) {
    const namaSumber = sumberId === c.person_a_id ? c.a_nama : c.b_nama
    const namaTujuan = tujuanId === c.person_a_id ? c.a_nama : c.b_nama
    const alasan = window.prompt(
      `Gabungkan "${namaSumber}" ke dalam "${namaTujuan}".\n\n` +
      `Data kunjungan, percakapan, dan riwayat campaign akan pindah ke "${namaTujuan}". ` +
      `Baris lama tetap disimpan (tidak dihapus) dan penggabungan ini bisa dibatalkan.\n\n` +
      `Tulis alasan penggabungan:`,
      'Duplikat — RM ganda untuk orang yang sama',
    )
    if (!alasan?.trim()) return
    kirim(`/api/${slug}/pasien/duplikat/gabung`,
      { sumber_id: sumberId, tujuan_id: tujuanId, alasan: alasan.trim() },
      `Digabungkan ke "${namaTujuan}".`, `${c.person_a_id}-${c.person_b_id}`)
  }

  function abaikan(c: Calon) {
    kirim(`/api/${slug}/pasien/duplikat/abaikan`,
      { person_a_id: c.person_a_id, person_b_id: c.person_b_id },
      'Ditandai bukan duplikat.', `${c.person_a_id}-${c.person_b_id}`)
  }

  function batalkan(r: RiwayatRow) {
    if (!window.confirm(`Batalkan penggabungan "${r.sumber?.name}" → "${r.tujuan?.name}"?\n\nData yang tadi berpindah akan dikembalikan.`)) return
    kirim(`/api/${slug}/pasien/duplikat/batal`, { merge_log_id: r.id }, 'Penggabungan dibatalkan.', r.id)
  }

  return (
    <div style={{ padding: 'var(--sp-5)', flex: 1 }}>
      <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--c-primary)', marginBottom: 4 }}>
        Duplikat Pasien
      </h1>
      <p style={{ fontSize: 13, color: 'var(--c-text-muted)', marginBottom: 'var(--sp-5)', maxWidth: 760, lineHeight: 1.6 }}>
        Sistem hanya <strong>mengusulkan</strong> — penggabungan selalu keputusan petugas. Perlu diingat satu
        nomor HP lazim dipakai bersama satu keluarga, jadi nomor yang sama saja belum tentu orang yang sama.
        Penggabungan hanya berlaku di sistem pemasaran ini dan <strong>tidak mengubah data di SIMRS</strong>.
      </p>

      <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--sp-4)' }}>
        {([['antrean', 'Perlu Ditinjau'], ['riwayat', 'Riwayat Penggabungan']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{
              padding: '8px 16px', borderRadius: 'var(--r-md)', fontFamily: 'inherit',
              fontSize: 'var(--font-size-sm)', fontWeight: tab === k ? 700 : 500, cursor: 'pointer',
              border: tab === k ? '2px solid var(--c-secondary)' : '1.5px solid var(--c-border)',
              background: tab === k ? 'white' : 'transparent',
              color: tab === k ? 'var(--c-secondary)' : 'var(--c-text-muted)',
            }}>
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: '#FDECEA', border: '1px solid #FBBABA', borderRadius: 'var(--r-md)', padding: '10px 14px', fontSize: 13, color: '#C0392B', marginBottom: 'var(--sp-4)' }}>
          ⚠ {error}
        </div>
      )}
      {pesan && (
        <div style={{ background: '#E8F5E9', border: '1px solid #A5D6A7', borderRadius: 'var(--r-md)', padding: '10px 14px', fontSize: 13, color: '#278B58', marginBottom: 'var(--sp-4)' }}>
          ✓ {pesan}
        </div>
      )}

      {loading ? (
        <div style={{ ...kartu, padding: 32, textAlign: 'center', color: 'var(--c-text-muted)' }}>Memuat…</div>
      ) : tab === 'antrean' ? (
        calon.length === 0 ? (
          <div style={{ ...kartu, padding: 32, textAlign: 'center', color: 'var(--c-text-muted)' }}>
            Tidak ada calon duplikat yang perlu ditinjau.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            {calon.map(c => {
              const w = WARNA_KEYAKINAN[c.keyakinan]
              const kunci = `${c.person_a_id}-${c.person_b_id}`
              const proses = sibuk === kunci
              return (
                <div key={kunci} style={{ ...kartu, padding: 'var(--sp-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--sp-3)', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: w.bg, color: w.fg }}>
                      {w.label}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--c-text-muted)' }}>Dasar: {c.dasar}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--sp-3)' }}>
                    {[
                      { id: c.person_a_id, nama: c.a_nama, rm: c.a_no_rm, hp: c.a_no_hp, lahir: c.a_tanggal_lahir, lawan: c.person_b_id },
                      { id: c.person_b_id, nama: c.b_nama, rm: c.b_no_rm, hp: c.b_no_hp, lahir: c.b_tanggal_lahir, lawan: c.person_a_id },
                    ].map(p => (
                      <div key={p.id} style={{ border: '1.5px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)' }}>
                        <a href={`/${slug}/pasien/${p.id}`} target="_blank" rel="noreferrer"
                          style={{ fontWeight: 700, color: 'var(--c-secondary)', fontSize: 'var(--font-size-sm)', textDecoration: 'none' }}>
                          {p.nama} ↗
                        </a>
                        <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginTop: 6, lineHeight: 1.7 }}>
                          <div>No. RM: <strong style={{ color: 'var(--c-text)' }}>{p.rm || '—'}</strong></div>
                          <div>No. HP: <strong style={{ color: 'var(--c-text)' }}>{p.hp || '—'}</strong></div>
                          <div>Lahir: <strong style={{ color: 'var(--c-text)' }}>{fmtTgl(p.lahir)}</strong></div>
                        </div>
                        <button onClick={() => gabung(c, p.lawan, p.id)} disabled={proses}
                          style={{
                            marginTop: 10, width: '100%', padding: '7px 12px', borderRadius: 'var(--r-sm)',
                            border: 'none', background: proses ? 'var(--c-border)' : 'var(--c-secondary)',
                            color: proses ? 'var(--c-text-faint)' : 'white',
                            fontWeight: 600, fontSize: 12, fontFamily: 'inherit',
                            cursor: proses ? 'not-allowed' : 'pointer',
                          }}>
                          Pertahankan yang ini
                        </button>
                      </div>
                    ))}
                  </div>

                  <button onClick={() => abaikan(c)} disabled={proses}
                    style={{
                      marginTop: 'var(--sp-3)', padding: '7px 14px', borderRadius: 'var(--r-sm)',
                      border: '1.5px solid var(--c-border)', background: 'white',
                      color: 'var(--c-text-muted)', fontWeight: 600, fontSize: 12,
                      fontFamily: 'inherit', cursor: proses ? 'not-allowed' : 'pointer',
                    }}>
                    Bukan duplikat — jangan tampilkan lagi
                  </button>
                </div>
              )
            })}
          </div>
        )
      ) : riwayat.length === 0 ? (
        <div style={{ ...kartu, padding: 32, textAlign: 'center', color: 'var(--c-text-muted)' }}>
          Belum ada penggabungan.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          {riwayat.map(r => (
            <div key={r.id} style={{ ...kartu, padding: 'var(--sp-4)', opacity: r.dibatalkan_at ? 0.6 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--c-text)' }}>
                    {r.sumber?.name ?? '(terhapus)'} <span style={{ color: 'var(--c-text-muted)' }}>→</span> {r.tujuan?.name ?? '(terhapus)'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginTop: 3 }}>
                    {r.alasan} · {new Date(r.dilakukan_at).toLocaleString('id-ID')}
                    {r.dibatalkan_at && <strong style={{ color: '#C0392B' }}> · DIBATALKAN</strong>}
                  </div>
                </div>
                {!r.dibatalkan_at && (
                  <button onClick={() => batalkan(r)} disabled={sibuk === r.id}
                    style={{
                      padding: '7px 14px', borderRadius: 'var(--r-sm)', alignSelf: 'flex-start',
                      border: '1.5px solid var(--c-border)', background: 'white',
                      color: 'var(--c-text)', fontWeight: 600, fontSize: 12,
                      fontFamily: 'inherit', cursor: sibuk === r.id ? 'not-allowed' : 'pointer',
                    }}>
                    Batalkan
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
