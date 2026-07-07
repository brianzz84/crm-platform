interface TagChipProps {
  name: string
  warna?: string
  sumber?: string
  onRemove?: () => void
}

export default function TagChip({ name, warna = '#0089A8', sumber, onRemove }: TagChipProps) {
  const isAi = sumber === 'auto_ai'
  const bg   = warna + '18'  // ~10% opacity hex trick

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px',
      borderRadius: 99,
      fontSize: 12, fontWeight: 700,
      background: bg,
      color: warna,
      border: `1.5px solid ${warna}40`,
      whiteSpace: 'nowrap',
    }}>
      {isAi && <span title="Auto-tag AI" style={{ fontSize: 10 }}>🤖</span>}
      {name}
      {onRemove && (
        <button
          onClick={onRemove}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'inherit', opacity: 0.6, fontSize: 14, lineHeight: 1,
            padding: 0, marginLeft: 2,
          }}
        >
          ×
        </button>
      )}
    </span>
  )
}
