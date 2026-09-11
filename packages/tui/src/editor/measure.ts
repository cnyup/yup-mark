/**
 * CJK 安全的视觉度量（MT1，TUI.md RT3）。
 *
 * 终端一个中文占 2 列；光标移动、软换行、列定位全部经 string-width 计算，
 * 滚动按整视觉行对齐，永不出现半宽字符被切开的列（Ink 文档标注的坑）。
 */
import stringWidth from 'string-width'

/** 单字符显示宽度（CJK/emoji=2，控制符=0） */
export function charWidth(ch: string): number {
  return stringWidth(ch)
}

/** 文本显示宽度合计 */
export function textWidth(text: string): number {
  return stringWidth(text)
}

/**
 * 字符 index → 显示列。index 可等于 text.length（行尾光标位）。
 * 宽字符中间的 index 向下取整到字符起始列。
 */
export function indexToCol(text: string, index: number): number {
  let col = 0
  let i = 0
  while (i < index && i < text.length) {
    const cp = text.codePointAt(i) ?? text.charCodeAt(i)
    const step = cp > 0xffff ? 2 : 1
    if (i + step > index) break // 落在宽字符（代理对）中间：按其起始列
    col += charWidth(text.charAt(i) + (step === 2 ? text.charAt(i + 1) : ''))
    i += step
  }
  return col
}

/** 显示列 → 最近可达该列的字符 index（贪心，宽度超出取最接近者） */
export function colToIndex(text: string, col: number): number {
  let acc = 0
  let i = 0
  let last = 0
  while (i < text.length) {
    const cp = text.codePointAt(i) ?? text.charCodeAt(i)
    const step = cp > 0xffff ? 2 : 1
    const w = charWidth(text.charAt(i) + (step === 2 ? text.charAt(i + 1) : ''))
    if (acc + w > col) break
    acc += w
    i += step
    last = i
  }
  return last
}

/** 光标左移一格的 index（不劈开代理对） */
export function stepBack(text: string, index: number): number {
  if (index <= 0) return 0
  const prev = text.charCodeAt(index - 1)
  // 低代理：与其高代理成对退 2
  if (prev >= 0xdc00 && prev <= 0xdfff) return Math.max(0, index - 2)
  return index - 1
}

/** 光标右移一格的 index */
export function stepForward(text: string, index: number): number {
  if (index >= text.length) return text.length
  const cp = text.codePointAt(index) ?? text.charCodeAt(index)
  return cp > 0xffff ? index + 2 : index + 1
}

export interface VisualRow {
  /** 本视觉行在 cells 中的起始下标 */
  start: number
  /** 结束下标（不含） */
  end: number
  /** 本行显示宽度（用于光标 X 与滚动判断） */
  width: number
}

export interface Cell {
  ch: string
  /** 显示宽度（缓存，避免渲染期重复计算） */
  w: number
}

/**
 * 贪心软换行：按显示宽度把 cells 切成视觉行。
 * 宽字符放不下整格时折到下一行（永不切半）。
 */
export function wrapCells(cells: Cell[], width: number): VisualRow[] {
  const rows: VisualRow[] = []
  let start = 0
  let acc = 0
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    if (acc + cell.w > width && acc > 0) {
      rows.push({ start, end: i, width: acc })
      start = i
      acc = 0
    }
    acc += cell.w
  }
  rows.push({ start, end: cells.length, width: acc })
  return rows
}

/** cells → 拼回字符串（测试与调试用） */
export function cellsToString(cells: Cell[]): string {
  return cells.map((c) => c.ch).join('')
}
