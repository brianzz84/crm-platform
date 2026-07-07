const CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  RAWAT_JALAN: { label: 'Rawat Jalan', color: '#006E89', bg: '#E0F4F4' },
  RAWAT_INAP:  { label: 'Rawat Inap',  color: '#0D2B55', bg: '#E8EEF5' },
  PENUNJANG:   { label: 'Penunjang',   color: '#9A6C00', bg: '#FDF3DC' },
}

export default function UnitBadge({ unit }: { unit: string }) {
  const c = CONFIG[unit] || { label: unit, color: '#6B7B8D', bg: '#F1F3F6' }
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 700,
      color: c.color, background: c.bg,
      whiteSpace: 'nowrap',
    }}>
      {c.label}
    </span>
  )
}
