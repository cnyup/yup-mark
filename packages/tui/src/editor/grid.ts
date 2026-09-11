/**
 * TUI widget 渲染器（MT2，TUI.md §5/§16-D16）：
 * 表格 box 网格、mermaid/图片信息占位框、HR 线、块级/行内数学挂载。
 * 全部纯函数（无终端/React 依赖），产出 RenderSegment 行。
 */
import type { RenderSegment, SpanStyle } from '../preview'
import { parseMarkdownTable, type ParsedTable } from '@yupmark/live-cm/table'
import { textWidth } from './measure'



const seg = (text: string, style: SpanStyle = {}): RenderSegment => ({ text, style })

// ---------------------------------------------------------------------------
// 表格 box 网格
// ---------------------------------------------------------------------------

interface GridOptions {
  /** 可用显示宽度（终端列宽） */
  width: number
  /** 网格内单元格光标（MT2 预留：编辑模式的反色格） */
  cursorCell?: { row: number; col: number } | null
}

/** 单列宽度收缩到总宽内：从最宽列逐列扣减（保底 3 列宽） */
function fitColumnWidths(rows: string[][], budget: number): number[] {
  const cols = rows[0]?.length ?? 0
  const widths: number[] = []
  for (let c = 0; c < cols; c++) {
    widths.push(Math.max(...rows.map((r) => textWidth(r[c] ?? ''))))
  }
  // 实际行宽 = Σ(列宽 + 左右填充 2) + (cols+1) 个边框字符
  const total = widths.reduce((a, b) => a + b, 0) + 3 * cols + 1
  if (total <= budget) return widths
  let remaining = total - budget
  while (remaining > 0) {
    const maxIdx = widths.indexOf(Math.max(...widths))
    if (widths[maxIdx] <= 3) break
    const cut = Math.min(remaining, widths[maxIdx] - 3)
    widths[maxIdx] -= cut
    remaining -= cut
  }
  return widths
}

/** 按显示宽度截断文本（宽字符不切半），超限补 …；恰好放得下则原样返回 */
function clipToWidth(text: string, width: number): string {
  if (textWidth(text) <= width) return text
  let acc = 0
  let out = ''
  for (const ch of text) {
    const w = textWidth(ch)
    if (acc + w > width - 1) return out + '…'
    acc += w
    out += ch
  }
  return out
}

/** 单元格文本按列宽与对齐填充 */
function padCell(text: string, width: number, align: 'left' | 'center' | 'right' | null): string {
  const clipped = clipToWidth(text, width)
  const pad = Math.max(0, width - textWidth(clipped))
  if (align === 'right') return ' '.repeat(pad) + clipped
  if (align === 'center') {
    const l = Math.floor(pad / 2)
    return ' '.repeat(l) + clipped + ' '.repeat(pad - l)
  }
  return clipped + ' '.repeat(pad)
}

/**
 * ParsedTable → box 网格行（表头粗体，对齐生效）。
 * 单元格内容为源码文本（行内语法在格内不再渲染——与桌面网格一致）。
 */
export function renderTableGrid(table: ParsedTable, opts: GridOptions): RenderSegment[][] {
  const { align, header, rows } = table
  const all = [header, ...rows]
  const widths = fitColumnWidths(all, Math.max(opts.width, all.length + 1))
  const aligns = align

  const border = (left: string, mid: string, right: string): RenderSegment =>
    seg(left + widths.map((w) => '─'.repeat(w + 2)).join(mid) + right, { dim: true })

  const dataRow = (cells: string[], isHeader: boolean, rowIdx: number): RenderSegment[] => {
    const out: RenderSegment[] = []
    for (let c = 0; c < cells.length; c++) {
      const style: SpanStyle = isHeader ? { bold: true } : {}
      const isCursor =
        opts.cursorCell != null && opts.cursorCell.row === rowIdx && opts.cursorCell.col === c
      const padded = padCell(cells[c] ?? '', widths[c] ?? 0, aligns[c] ?? (isHeader ? 'center' : null))
      out.push(seg(c === 0 ? '│' : '│', { dim: true }))
      out.push(seg(` ${padded} `, isCursor ? { ...style, inverse: true } : style))
    }
    out.push(seg('│', { dim: true }))
    return out
  }

  const result: RenderSegment[][] = []
  result.push([border('┌', '┬', '┐')])
  result.push(dataRow(header, true, 0))
  result.push([border('├', '┼', '┤')])
  rows.forEach((r, i) => result.push(dataRow(r, false, i + 1)))
  result.push([border('└', '┴', '┘')])
  return result
}

/** 表格源文本 → 网格行（解析失败返回 null，调用方降级源码） */
export function renderTableGridFromSource(source: string, opts: GridOptions): RenderSegment[][] | null {
  const parsed = parseMarkdownTable(source)
  if (parsed === null) return null
  return renderTableGrid(parsed, opts)
}

// ---------------------------------------------------------------------------
// mermaid / 图片占位框与 HR
// ---------------------------------------------------------------------------

const MERMAID_TYPES: Record<string, string> = {
  flowchart: '流程图',
  graph: '流程图',
  sequenceDiagram: '时序图',
  classDiagram: '类图',
  stateDiagram: '状态图',
  'stateDiagram-v2': '状态图',
  erDiagram: 'ER 图',
  journey: '用户旅程',
  gantt: '甘特图',
  pie: '饼图',
  mindmap: '思维导图',
  gitGraph: 'Git 图',
}

/** mermaid 源 → 图类型中文名 + 规模描述 */
export function mermaidInfo(code: string): { type: string; scale: string } {
  const first = code
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  const head = first === undefined ? '' : first.split(/\s+/)[0] ?? ''
  const type = MERMAID_TYPES[head] ?? (head !== '' ? head : '图表')
  const lines = code.split('\n').filter((l) => l.trim().length > 0).length
  return { type, scale: `${lines} 行` }
}

/** 信息占位框：`─── ▶ mermaid · 流程图 · 12 行 ───`（占满可用宽度） */
export function renderPlaceholder(icon: string, info: string, width: number, style: SpanStyle = {}): RenderSegment[] {
  const core = ` ${icon} ${info} `
  const coreW = textWidth(core)
  const fill = Math.max(0, Math.min(width, 60) - coreW)
  const left = Math.floor(fill / 2)
  const right = fill - left
  return [
    seg('─'.repeat(Math.max(left, 2)), { dim: true }),
    seg(core, { dim: true, ...style }),
    seg('─'.repeat(Math.max(right, 2)), { dim: true }),
  ]
}

/** HR：全宽横线 */
export function renderHr(width: number): RenderSegment[] {
  return [seg('─'.repeat(Math.max(width - 2, 3)), { dim: true })]
}

/** 块级数学：居中渲染 Unicode 近似 */
export function renderMathBlock(approx: string, width: number): RenderSegment[] {
  const pad = Math.max(0, Math.floor((width - textWidth(approx)) / 2))
  return [seg(' '.repeat(pad) + approx, { italic: true, color: 'cyan' })]
}

/** 行内数学：作为文本段（layout 以 cells 形式挂载） */
export function mathInlineStyle(): SpanStyle {
  return { italic: true, color: 'cyan' }
}
