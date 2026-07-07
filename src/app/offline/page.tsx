export default function OfflinePage() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#0F2744', color: 'white', textAlign: 'center', padding: 24,
    }}>
      <img src="/icons/icon-192x192.png" alt="CRM 360" style={{ width: 96, height: 96, marginBottom: 24, borderRadius: 20 }} />
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Tidak ada koneksi</h1>
      <p style={{ fontSize: 14, opacity: 0.6, marginBottom: 32 }}>
        Periksa koneksi internet Anda lalu coba lagi.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '12px 28px', background: '#2D9CDB', color: 'white',
          border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer',
        }}
      >
        Coba Lagi
      </button>
    </div>
  )
}
