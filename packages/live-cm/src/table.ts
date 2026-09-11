/** Markdown 表格文本解析（纯函数，可单测） */

export type CellAlign = 'left' | 'center' | 'right' | null

export interface ParsedTable {
  align: CellAlign[]
  header: string[]
  rows: string[][]
}

function splitCells(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim())
}

function delimiterAlign(cell: string): CellAlign | undefined {
  const m = /^(:?)(-{1,})(:?)$/.exec(cell.replace(/\s/g, ''))
  if (!m) return undefined
  const [, lead, , tail] = m
  if (lead && tail) return 'center'
  if (tail) return 'right'
  if (lead) return 'left'
  return null
}

/** 从分隔行文本解析各列对齐（无法解析的列视为默认对齐） */
export function alignFromDelimiter(line: string): CellAlign[] {
  const cells = splitCells(line)
  if (cells.length === 0) return []
  const aligns = cells.map(delimiterAlign)
  if (aligns.some((a) => a === undefined)) return cells.map(() => null)
  return aligns as CellAlign[]
}

/** 解析 GFM 表格原文；非表格结构返回 null */
export function parseMarkdownTable(text: string): ParsedTable | null {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l !== '')
  if (lines.length < 2) return null

  const delimCells = splitCells(lines[1] ?? '')
  const aligns: CellAlign[] = []
  for (const cell of delimCells) {
    const a = delimiterAlign(cell)
    if (a === undefined) return null
    aligns.push(a)
  }
  if (aligns.length === 0) return null

  return {
    align: aligns,
    header: splitCells(lines[0] ?? ''),
    rows: lines.slice(2).map(splitCells),
  }
}
