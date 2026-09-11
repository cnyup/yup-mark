/**
 * 视口布局装配（MT1）：EditorState → 可渲染视觉行 + 光标坐标。
 *
 * 管线（TUI.md §3.1）：
 *   collectDecorations(state) 一次性四路分流
 *   → 视口内逐行装 cells（隐藏字符剔除、widget 替换为终端形态、mark 套样式）
 *   → CJK 宽度贪心软换行 → 视觉行（样式段收敛）
 *   → 光标反色叠加 + 视口内 (x,y) 坐标（供 useCursor 的 IME 锚点）
 *
 * 性能约定：装饰对全文档计算一次（内核现状），行装配只发生在视口窗口内。
 */
import type { EditorState } from '@codemirror/state'
import { collectDecorations, classesToStyle, type DecorationIndex, type SpanStyle } from '../preview'
import { BulletWidget, CheckboxWidget } from '@yupmark/live-cm/widgets'
import { charWidth, wrapCells, type Cell } from './measure'

/** 带 doc 偏移与样式的单元格 */
export interface StyledCell extends Cell {
  /** 该字符在文档中的偏移（行尾虚拟格 = line.to；前缀装饰 = -1） */
  docPos: number
  style: SpanStyle
}

export interface RenderSegment {
  text: string
  style: SpanStyle
}

export interface LayoutRow {
  segments: RenderSegment[]
  width: number
}

export interface ViewportLayout {
  rows: LayoutRow[]
  /** 光标在视口内的坐标（x=列，y=行下标）；供反色格与 useCursor 共用 */
  cursor: { x: number; y: number } | null
  /** 光标所在视觉行的宽度（打字机模式预留） */
  cursorRowWidth: number
}

function styleKey(s: SpanStyle): string {
  return [s.bold, s.italic, s.dim, s.underline, s.strikethrough, s.color, s.inverse].join('|')
}

/** widget 的终端替身（TUI.md §5；未列出的 widget 显源码 = 保留原文）。
 *  不带尾随空格：Bullet 只替换 `-`、Checkbox 只替换 `[ ]`，源码空格自然保留。 */
function widgetReplacement(widget: unknown): string | null {
  if (widget instanceof BulletWidget) return '•'
  if (widget instanceof CheckboxWidget) return widget.checked ? '◉' : '○'
  return null
}

/** 单个文档行 → cells（可见字符 + 前缀装饰 + 行尾虚拟空格） */
function buildLineCells(
  state: EditorState,
  lineFrom: number,
  lineTo: number,
  lineText: string,
  idx: DecorationIndex,
): StyledCell[] {
  const doc = state.doc
  const baseClasses = idx.lineBase.get(lineFrom) ?? []
  const base = classesToStyle(baseClasses, {})
  const cells: StyledCell[] = []

  // 引用前缀（非文档字符，光标不可落）
  if (baseClasses.includes('cm-quote-line')) {
    cells.push({ ch: '│ ', w: 2, docPos: -1, style: { dim: true } })
  }

  for (let pos = lineFrom; pos < lineTo; pos++) {
    // 隐藏区间：字符不输出
    if (idx.hidden.some((h) => pos >= h.from && pos < h.to)) continue
    // widget 区间：整段替换为终端形态（或保留源码）
    const wg = idx.widgets.find((w) => pos >= w.from && pos < w.to)
    if (wg) {
      if (pos === wg.from) {
        const rep = widgetReplacement(wg.widget)
        if (rep !== null) {
          const w = charWidth(rep)
          cells.push({ ch: rep, w, docPos: pos, style: { ...base } })
        } else {
          // 显源码：原文照抄（MT2 的表格/数学/占位框在此扩展）
          for (let p = wg.from; p < wg.to; p++) {
            const ch = doc.sliceString(p, p + 1)
            cells.push({ ch, w: charWidth(ch), docPos: p, style: { ...base } })
          }
        }
      }
      continue
    }
    const covering: string[] = []
    for (const m of idx.marks) {
      if (pos >= m.from && pos < m.to) covering.push(...m.classes)
    }
    const ch = lineText[pos - lineFrom] ?? doc.sliceString(pos, pos + 1)
    cells.push({ ch, w: charWidth(ch), docPos: pos, style: classesToStyle(covering, base) })
  }

  // 行尾虚拟空格：EOL 光标与换行边界输入的落点
  cells.push({ ch: ' ', w: 1, docPos: lineTo, style: { ...base } })
  return cells
}

/** cells → 样式段收敛（相邻同样式合并；光标格反色拆分） */
function cellsToSegments(cells: StyledCell[]): RenderSegment[] {
  const segs: RenderSegment[] = []
  let cur: RenderSegment | null = null
  let curKey = ''
  for (const c of cells) {
    const key = styleKey(c.style)
    if (cur === null || key !== curKey) {
      cur = { text: c.ch, style: c.style }
      curKey = key
      segs.push(cur)
    } else {
      cur.text += c.ch
    }
  }
  return segs
}

export interface LayoutOptions {
  width: number
  height: number
  firstLine: number
  cursorPos: number
}

// 同一 state + 同参的装配结果缓存：applyScroll（事件期）与渲染（同帧）共用，每键只算一次
let memoState: EditorState | null = null
let memoKey = ''
let memoVal: ViewportLayout | null = null

/** 装配视口（不含滚动决策——由 viewport.ts 预先修正 firstLine） */
export function layoutViewport(state: EditorState, opts: LayoutOptions): ViewportLayout {
  const key = `${opts.width}|${opts.height}|${opts.firstLine}|${opts.cursorPos}`
  if (state === memoState && key === memoKey && memoVal !== null) return memoVal
  const result = computeViewport(state, opts)
  memoState = state
  memoKey = key
  memoVal = result
  return result
}

function computeViewport(state: EditorState, opts: LayoutOptions): ViewportLayout {
  const { width, height, firstLine, cursorPos } = opts
  const doc = state.doc

  const cursorLine = doc.lineAt(cursorPos)
  // 光标行强制纳入（滚动兜底后正常不会触发）
  const startLine = Math.min(firstLine, cursorLine.number)
  const endLine = Math.min(doc.lines, firstLine + height - 1, Math.max(firstLine + height - 1, cursorLine.number))

  // 装饰按视口行区间装配（内核 range 参数：10k 行每键 90ms → 视口内几 ms）
  const rangeFrom = doc.line(startLine).from
  const rangeTo = doc.line(endLine).to
  const idx: DecorationIndex = collectDecorations(state, { from: rangeFrom, to: rangeTo })

  const rows: LayoutRow[] = []
  let cursor: { x: number; y: number } | null = null
  let cursorRowWidth = 0

  for (let ln = startLine; ln <= endLine; ln++) {
    const line = doc.line(ln)
    const cells = buildLineCells(state, line.from, line.to, line.text, idx)

    // 光标反色叠加
    const cursorCellIdx = cells.findIndex((c) => c.docPos === cursorPos)
    if (cursorCellIdx >= 0) {
      cells[cursorCellIdx] = { ...cells[cursorCellIdx], style: { ...cells[cursorCellIdx].style, inverse: true } }
    }

    const visualRows = wrapCells(cells, Math.max(width, 4))
    for (const vr of visualRows) {
      const rowCells = cells.slice(vr.start, vr.end)
      rows.push({ segments: cellsToSegments(rowCells), width: vr.width })
      if (cursorCellIdx >= vr.start && cursorCellIdx < vr.end) {
        let x = 0
        for (let i = vr.start; i < cursorCellIdx; i++) x += cells[i].w
        cursor = { x, y: rows.length - 1 }
        cursorRowWidth = vr.width
      }
    }
  }

  // 软换行溢出时截断到固定高度（光标行越界由 app 的居中兜底重装配）
  if (rows.length > height) rows.length = height
  // 补齐到固定高度（ink 布局稳定，闪烁抑制）
  while (rows.length < height) rows.push({ segments: [], width: 0 })

  return { rows, cursor, cursorRowWidth }
}
