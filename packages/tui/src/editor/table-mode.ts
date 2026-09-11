/**
 * 表格网格编辑模式（MT2 方案 A，TUI.md §5）：
 * 光标进入表格 → 网格保持渲染，文档光标即"单元格内插入符"。
 *
 * 核心机制：单元格文本 span（每格 trimmed 文本的绝对区间）从表格源码行扫描得出，
 * 激活判定/所在格/格内偏移全部由 state 纯推导（无旁路状态，undo 天然逐字）。
 * 键位路由与网格渲染都消费这里的 span 模型；行列操作复用内核 tableOps。
 */
import type { EditorState } from '@codemirror/state'
import type { SyntaxNode } from '@lezer/common'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { alignFromDelimiter, parseMarkdownTable } from '@yupmark/live-cm/table'
import type { CellAlign } from '@yupmark/live-cm/table'

/** 表格上下文：源码区间 + 行结构 + 每格文本 span */
export interface TableContext {
  from: number
  to: number
  /** 表格源码行（含表头/分隔行/数据行） */
  lines: string[]
  /** 各行首的绝对偏移（与 lines 一一对应） */
  lineFroms: number[]
  /** 分隔行在 lines 中的下标（通常 1） */
  delimiterIdx: number
  /** 每格 trimmed 文本 span：cells[行][列]，行 0=表头，数据行从 1 起（跳过分隔行） */
  cells: { from: number; to: number }[][]
  /** 列对齐（分隔行解析） */
  align: CellAlign[]
}

/** 表格相关语法节点名（向上找最近的 Table 祖先） */
const TABLE_NODE_NAMES = new Set(['Table', 'TableHeader', 'TableRow', 'TableCell', 'TableDelimiter'])

/** 从节点向上找 Table 祖先 */
function findTableAncestor(node: SyntaxNode | null): SyntaxNode | null {
  let cur: SyntaxNode | null = node
  while (cur !== null) {
    if (cur.name === 'Table') return cur
    cur = cur.parent ?? null
  }
  return null
}

/** 向上找表格语法节点（TableHeader/TableRow/TableCell/TableDelimiter 任一） */
function findTableNode(node: SyntaxNode | null): SyntaxNode | null {
  let cur: SyntaxNode | null = node
  while (cur !== null && !TABLE_NODE_NAMES.has(cur.name)) {
    cur = cur.parent ?? null
  }
  return cur
}

/** 光标处是否在表格内；返回表格上下文（含 span 模型） */
export function tableAt(state: EditorState, pos: number): TableContext | null {
  if (state.doc.lines === 0) return null
  const tree = ensureSyntaxTree(state, Math.min(state.doc.length, pos + 64), 100) ?? syntaxTree(state)
  let table = findTableAncestor(findTableNode(tree.resolveInner(pos, -1)))
  if (table === null) {
    // 表格起点边界：resolveInner(pos, -1) 会解析到前一个节点，向后偏置再试
    const probe = Math.min(pos + 1, state.doc.length)
    if (probe !== pos) {
      table = findTableAncestor(findTableNode(tree.resolveInner(probe, -1)))
    }
  }
  if (table === null) return null
  return buildContext(state, table.from, table.to)
}

/** 从源码区间构建 span 模型（解析失败返回 null） */
function buildContext(state: EditorState, from: number, to: number): TableContext | null {
  const doc = state.doc
  const text = doc.sliceString(from, to)
  const lines = text.split('\n')
  if (lines.length < 2) return null

  const lineFroms: number[] = []
  let off = from
  for (const line of lines) {
    lineFroms.push(off)
    off += line.length + 1
  }

  // 单元格 span 扫描：行内管道分隔，trimmed 文本区间
  const cells: { from: number; to: number }[][] = []
  let delimiterIdx = -1
  lines.forEach((line, i) => {
    const base = lineFroms[i] as number
    if (/^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(line) && line.includes('-')) {
      delimiterIdx = i
      return
    }
    if (!line.includes('|')) return
    const spans: { from: number; to: number }[] = []
    let start: number | null = null
    for (let c = 0; c <= line.length; c++) {
      const ch = c < line.length ? line[c] : '|'
      if (ch === '|') {
        if (start !== null) {
          const raw = line.slice(start, c)
          const lead = raw.length - raw.trimStart().length
          const trail = raw.length - raw.trimEnd().length
          spans.push({ from: base + start + lead, to: base + c - trail })
          start = null
        }
        continue
      }
      if (start === null) start = c
    }
    if (spans.length > 0) cells.push(spans)
  })

  if (delimiterIdx === -1 || cells.length === 0) return null

  // 对齐：分隔行
  const align: CellAlign[] = alignFromDelimiter(lines[delimiterIdx] ?? '')

  return { from, to, lines, lineFroms, delimiterIdx, cells, align }
}

/** 光标 → 网格坐标（row, col, 格内偏移）；不在任何格内返回 null */
export function cellAt(
  ctx: TableContext,
  pos: number,
): { row: number; col: number; offset: number } | null {
  for (let row = 0; row < ctx.cells.length; row++) {
    const spans = ctx.cells[row]
    if (spans === undefined) continue
    for (let col = 0; col < spans.length; col++) {
      const span = spans[col]
      if (span === undefined) continue
      if (pos >= span.from && pos <= span.to) {
        return { row, col, offset: pos - span.from }
      }
    }
  }
  return null
}

/** 光标是否恰好在某格文本起点（含空格区间起点，用于打字插入位置规范化） */
export function snapIntoCell(ctx: TableContext, pos: number, fromEnd: boolean): number {
  const hit = cellAt(ctx, pos)
  if (hit !== null) {
    const span = ctx.cells[hit.row]?.[hit.col]
    return fromEnd ? (span?.to ?? pos) : (span?.from ?? pos)
  }
  // 在分隔行/管道/空隙上：找最近的格
  let best: { pos: number; dist: number } | null = null
  for (const spans of ctx.cells) {
    for (const span of spans) {
      const dEnd = Math.abs(span.to - pos)
      const dStart = Math.abs(span.from - pos)
      const d = fromEnd ? dEnd : dStart
      if (best === null || d < best.dist) {
        best = { pos: fromEnd ? span.to : span.from, dist: d }
      }
    }
  }
  return best?.pos ?? pos
}

/** 网格坐标 → 该格文本起点（坐标越界时夹取到边界格） */
export function cellStart(ctx: TableContext, row: number, col: number): number {
  const r = Math.max(0, Math.min(row, ctx.cells.length - 1))
  const spans = ctx.cells[r] ?? []
  const c = Math.max(0, Math.min(col, spans.length - 1))
  return spans[c]?.from ?? ctx.from
}

/** 解析后的表格数据（供网格渲染复用；span 模型与它同源） */
export function parsedForRender(ctx: TableContext): {
  align: CellAlign[]
  header: string[]
  rows: string[][]
} | null {
  return parseMarkdownTable(ctx.lines.join('\n'))
}
