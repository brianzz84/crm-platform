'use client'

import React from 'react'

/**
 * Renderer markdown ringan untuk balasan AI Partner — tanpa dependensi eksternal
 * (CSP artifact ketat, dan cukup subset yang benar-benar dipakai AI):
 *   **tebal**, *miring*, `kode`, heading (#..######), bullet (- / *) & angka,
 *   dan TABEL gaya GFM (| a | b |). Sisanya tampil apa adanya.
 *
 * Sengaja minimalis & aman: tidak mengeksekusi HTML mentah, hanya membangun
 * elemen React dari teks.
 */

// ── inline: **bold**, *italic*, `code` ──
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  // Pisah berdasar token, pertahankan urutan
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let last = 0, m: RegExpExecArray | null, i = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**'))      out.push(<strong key={`${keyPrefix}-${i}`}>{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('`'))  out.push(<code key={`${keyPrefix}-${i}`} style={{ background: 'var(--c-bg)', padding: '1px 5px', borderRadius: 4, fontSize: '0.9em', fontFamily: 'monospace' }}>{tok.slice(1, -1)}</code>)
    else                           out.push(<em key={`${keyPrefix}-${i}`}>{tok.slice(1, -1)}</em>)
    last = m.index + tok.length
    i++
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function splitRow(line: string): string[] {
  return line.replace(/^\||\|$/g, '').split('|').map(c => c.trim())
}
const isSeparator = (line: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-')

export default function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n')
  const blocks: React.ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let k = 0

  const flushList = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(
      <Tag key={`l-${k++}`} style={{ margin: '4px 0 8px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {list.items.map((it, idx) => <li key={idx}>{renderInline(it, `li-${k}-${idx}`)}</li>)}
      </Tag>
    )
    list = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // ── Tabel GFM: baris header | ... | diikuti baris separator ──
    if (line.includes('|') && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      flushList()
      const header = splitRow(line)
      const rows: string[][] = []
      let j = i + 2
      while (j < lines.length && lines[j].includes('|') && lines[j].trim()) {
        rows.push(splitRow(lines[j])); j++
      }
      blocks.push(
        <div key={`t-${k++}`} style={{ overflowX: 'auto', margin: '6px 0 10px' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.92em', width: '100%' }}>
            <thead>
              <tr>{header.map((h, ci) => (
                <th key={ci} style={{ textAlign: 'left', padding: '5px 10px', borderBottom: '2px solid var(--c-border)', background: 'var(--c-bg)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {renderInline(h, `th-${k}-${ci}`)}
                </th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>{header.map((_, ci) => (
                  <td key={ci} style={{ padding: '5px 10px', borderBottom: '1px solid var(--c-border)', verticalAlign: 'top' }}>
                    {renderInline(r[ci] ?? '', `td-${k}-${ri}-${ci}`)}
                  </td>
                ))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      i = j - 1
      continue
    }

    // ── Heading ──
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      flushList()
      const lvl = h[1].length
      const size = lvl <= 2 ? '1.05em' : lvl === 3 ? '1em' : '0.95em'
      blocks.push(
        <div key={`h-${k++}`} style={{ fontWeight: 800, fontSize: size, margin: '10px 0 4px', color: 'var(--c-primary)' }}>
          {renderInline(h[2], `h-${k}`)}
        </div>
      )
      continue
    }

    // ── List item (- , * , 1.) ──
    const ul = line.match(/^\s*[-*]\s+(.*)$/)
    const ol = line.match(/^\s*\d+\.\s+(.*)$/)
    if (ul || ol) {
      const ordered = !!ol
      const item = (ul ? ul[1] : ol![1])
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] } }
      list.items.push(item)
      continue
    }

    // ── Baris kosong = pemisah ──
    if (!line.trim()) { flushList(); continue }

    // ── Paragraf biasa ──
    flushList()
    blocks.push(<p key={`p-${k++}`} style={{ margin: '2px 0' }}>{renderInline(line, `p-${k}`)}</p>)
  }
  flushList()

  return <div style={{ lineHeight: 1.55 }}>{blocks}</div>
}
