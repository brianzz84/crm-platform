/**
 * Halaman status penghapusan data Threads.
 *
 * Alamat halaman ini dikembalikan ke Meta oleh `/api/threads/hapus-data`, dan
 * Meta menampilkannya kepada pengguna yang meminta datanya dihapus.
 *
 * TERBUKA TANPA LOGIN, dan memang harus begitu: yang membukanya adalah orang
 * yang baru saja mencabut aplikasi — ia tidak punya dan tidak seharusnya punya
 * akun di CRM ini.
 *
 * Karena itu halaman ini TIDAK menampilkan data apa pun. Ia hanya menerangkan
 * apa yang disimpan dan apa yang sudah dihapus. Menampilkan nama akun atau
 * apa pun yang bisa diambil dari kode di URL akan menjadikannya kebocoran:
 * kodenya muncul di riwayat peramban dan di log siapa pun yang dilewatinya.
 */

export const metadata = { title: 'Penghapusan Data Threads — CRM 360' }

export default function HapusDataThreads({
  searchParams,
}: { searchParams: { kode?: string } }) {
  const kode = (searchParams.kode ?? '').replace(/[^a-f0-9]/gi, '').slice(0, 32)

  return (
    <main style={{
      maxWidth: 620, margin: '0 auto', padding: '48px 20px',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      color: '#0F172A', lineHeight: 1.7,
    }}>
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>Permintaan penghapusan data diterima</h1>
      <p style={{ color: '#475569', marginTop: 0 }}>
        CRM 360 — RS Katolik St. Vincentius a Paulo (RKZ) Surabaya
      </p>

      <div style={{
        background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10,
        padding: '14px 16px', margin: '24px 0', color: '#15803D',
      }}>
        <strong>Status: selesai.</strong> Penghapusan dilakukan seketika saat
        permintaan diterima — tidak ada antrean yang perlu ditunggu.
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 4 }}>Apa yang disimpan, dan kini dihapus</h2>
      <p style={{ marginTop: 0, color: '#334155' }}>
        Satu-satunya data Threads yang pernah disimpan sistem ini adalah{' '}
        <strong>token akses</strong>, <strong>ID akun</strong>, dan{' '}
        <strong>nama akun</strong> — dipakai semata untuk membaca statistik akun
        Threads milik rumah sakit sendiri. Ketiganya telah dihapus.
      </p>
      <p style={{ color: '#334155' }}>
        Sistem ini <strong>tidak pernah menyimpan</strong> isi unggahan, pesan,
        maupun daftar pengikut Anda.
      </p>

      {kode && (
        <>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>Nomor rujukan</h2>
          <code style={{
            display: 'inline-block', background: '#F1F5F9', padding: '8px 12px',
            borderRadius: 8, fontSize: 14, letterSpacing: '.5px',
          }}>{kode}</code>
          <p style={{ fontSize: 13, color: '#64748B' }}>
            Simpan nomor ini bila Anda perlu merujuk permintaan tersebut.
          </p>
        </>
      )}

      <hr style={{ border: 0, borderTop: '1px solid #E2E8F0', margin: '28px 0' }} />
      <p style={{ fontSize: 13, color: '#64748B' }}>
        Pertanyaan mengenai data Anda dapat disampaikan melalui kanal resmi
        RS Katolik St. Vincentius a Paulo Surabaya.
      </p>
    </main>
  )
}
