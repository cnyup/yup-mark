/**
 * 表格源码级操作（纯函数，供 TableWidget 工具栏使用）：
 * 以「表格每行文本」为单位做行/列增删与对齐设置，输出新行数组。
 * 行约定：[0]=表头，[1]=分隔行，[2..]=数据行。
 */

/** 把一行表格文本拆成（前缀, 单元格数组, 后缀）：`| a | b |` → ('|', ['a','b'], '|') */
export function splitRow(line: string): { lead: string; cells: string[]; tail: string } {
  const lead = line.startsWith('|') ? '|' : ''
  const body = lead ? line.slice(1) : line
  const tail = body.endsWith('|') ? '|' : ''
  const inner = tail ? body.slice(0, -1) : body
  return { lead, cells: inner.split('|').map((c) => c.trim()), tail }
}

/** 拼回一行表格文本 */
export function joinRow(lead: string, cells: string[], tail: string): string {
  const open = lead ? '| ' : ''
  const close = tail ? ' |' : ''
  return `${open}${cells.join(' | ')}${close}`
}

/** 指定列数的空白数据行 */
export function emptyRow(cols: number): string {
  return `| ${Array.from({ length: cols }, () => ' ').join(' | ')} |`
}

/** 在 rowIdx（0=表头行）后插入一行空行 */
export function insertRowAfter(lines: string[], rowIdx: number): string[] {
  const cols = splitRow(lines[0]).cells.length
  const out = [...lines]
  out.splice(rowIdx + 1, 0, emptyRow(cols))
  return out
}

/** 删除 rowIdx 行（表头/分隔行不可删；最后一行数据不可删） */
export function deleteRow(lines: string[], rowIdx: number): string[] | null {
  if (rowIdx < 2 || rowIdx >= lines.length || lines.length <= 3) return null
  return lines.filter((_, i) => i !== rowIdx)
}

/** 在 colIdx 后插入一列（所有行 + 分隔行同步） */
export function insertColumnAfter(lines: string[], colIdx: number): string[] {
  return lines.map((line, i) => {
    const { lead, cells, tail } = splitRow(line)
    const next = [...cells]
    next.splice(colIdx + 1, 0, i === 1 ? '---' : ' ')
    return joinRow(lead, next, tail || '|')
  })
}

/** 删除 colIdx 列（至少保留一列） */
export function deleteColumn(lines: string[], colIdx: number): string[] | null {
  if (splitRow(lines[0]).cells.length <= 1) return null
  return lines.map((line) => {
    const { lead, cells, tail } = splitRow(line)
    return joinRow(lead, cells.filter((_, i) => i !== colIdx), tail || '|')
  })
}

/** 设置 colIdx 列对齐（left/center/right，null=默认），写进分隔行 */
export function setColumnAlign(
  lines: string[],
  colIdx: number,
  align: 'left' | 'center' | 'right' | null,
): string[] {
  const mark = align === 'left' ? ':---' : align === 'center' ? ':---:' : align === 'right' ? '---:' : '---'
  return lines.map((line, i) => {
    if (i !== 1) return line
    const { lead, cells, tail } = splitRow(line)
    const next = [...cells]
    next[colIdx] = mark
    return joinRow(lead, next, tail || '|')
  })
}
