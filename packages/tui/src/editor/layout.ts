/**
 * 视口布局装配（MT1/MT2）：EditorState → 可渲染视觉行 + 光标坐标。
 *
 * 管线（TUI.md §3.1）：
 *   collectDecorations(state, range) 一次性四路分流
 *   → 视口内逐行装配：cells（普通行）/ block（多行 widget：表格网格、
 *     块级数学、占位框、HR）/ absorbed（widget 覆盖的续行，不产出行）
 *   → CJK 宽度贪心软换行 → 视觉行（样式段收敛）
 *   → 光标反色叠加 + 视口内 (x,y) 坐标（useCursor 的 IME 锚点）
 *   → 代码块 token 经 lezer highlightTree 转 ANSI 色（MT2）
 *
 * 性能约定：装饰按视口区间装配（内核 range 参数）；行内 token 高亮仅收集
 * 视口相交范围；同参结果 memo（applyScroll 与渲染每键只算一次）。
 */
import type { EditorState } from '@codemirror/state'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { highlightTree, tagHighlighter, tags as t, type Highlighter } from '@lezer/highlight'
import {
  collectDecorations,
  classesToStyle,
  type DecorationIndex,
  type SpanStyle,
  type RenderSegment,
} from '../preview'
import {
  BulletWidget,
  CheckboxWidget,
  MathWidget,
  MermaidWidget,
  ImageWidget,
  TableWidget,
  HrWidget,
} from '@yupmark/live-cm/widgets'
import { charWidth, wrapCells, type Cell } from './measure'
import { latexToUnicode } from '../math-unicode'
import {
  renderTableGridFromSource,
  renderPlaceholder,
  renderHr,
  renderMathBlock,
  mathInlineStyle,
  mermaidInfo,
} from './grid'

/** 带 doc 偏移与样式的单元格 */
export interface StyledCell extends Cell {
  /** 该字符在文档中的偏移（行尾虚拟格 = line.to；前缀装饰 = -1） */
  docPos: number
  style: SpanStyle
}

export type { RenderSegment }

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

/** 行内 widget 的终端替身（单行 cells 形态）；未列出/不可表达返回 null = 显示源码 */
function inlineWidgetReplacement(widget: unknown): { text: string; style: SpanStyle } | null {
  if (widget instanceof BulletWidget) return { text: '•', style: {} }
  if (widget instanceof CheckboxWidget) return { text: widget.checked ? '◉' : '○', style: {} }
  if (widget instanceof MathWidget && !widget.display) {
    const approx = latexToUnicode(widget.tex)
    return approx === null ? null : { text: approx, style: mathInlineStyle() }
  }
  return null
}

/** 多行块 widget → 预渲染行；非块级 widget 或不可表达返回 null */
function blockWidgetRows(
  widget: unknown,
  source: string,
  width: number,
): RenderSegment[][] | null {
  if (widget instanceof TableWidget) {
    return renderTableGridFromSource(source, { width })
  }
  if (widget instanceof MathWidget && widget.display) {
    const approx = latexToUnicode(widget.tex)
    return approx === null ? null : [renderMathBlock(approx, width)]
  }
  if (widget instanceof MermaidWidget) {
    const info = mermaidInfo(widget.code)
    return [[...renderPlaceholder('▶', `mermaid · ${info.type} · ${info.scale}`, width)]]
  }
  if (widget instanceof ImageWidget) {
    const file = widget.src.replace(/\\/g, '/').split('/').pop() ?? widget.src
    const label = widget.alt !== '' ? `${widget.alt} · ${file}` : file
    return [[...renderPlaceholder('▣', label, width)]]
  }
  if (widget instanceof HrWidget) {
    return [[...renderHr(width)]]
  }
  return null
}

// ---------------------------------------------------------------------------
// 代码块 token 高亮（lezer highlightTree → 类名 → SpanStyle）
// ---------------------------------------------------------------------------

const CODE_HIGHLIGHTER: Highlighter = tagHighlighter([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword], class: 'k' },
  { tag: [t.operator, t.operatorKeyword], class: 'k' },
  { tag: [t.string, t.special(t.string), t.character], class: 's' },
  { tag: [t.number, t.bool, t.null, t.atom], class: 'n' },
  { tag: [t.comment, t.lineComment, t.blockComment], class: 'c' },
  { tag: [t.typeName, t.className, t.namespace], class: 't' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], class: 'f' },
  { tag: [t.propertyName, t.attributeName], class: 'a' },
  { tag: [t.tagName, t.standard(t.tagName)], class: 'g' },
])

const CODE_CLASS_STYLE: Record<string, SpanStyle> = {
  k: { color: 'magenta' },
  s: { color: 'green' },
  n: { color: 'yellow' },
  c: { color: 'gray', italic: true },
  t: { color: 'cyan' },
  f: { color: 'blue' },
  a: { color: 'cyan' },
  g: { color: 'green' },
}

interface CodeToken {
  from: number
  to: number
  style: SpanStyle
}

/** 区间内 FencedCode 范围 */
function codeBlockRanges(state: EditorState, from: number, to: number): { from: number; to: number }[] {
  const tree = ensureSyntaxTree(state, to, 100) ?? syntaxTree(state)
  const out: { from: number; to: number }[] = []
  tree.iterate({
    from,
    to,
    enter: (node) => {
      if (node.name === 'FencedCode') {
        out.push({ from: node.from, to: node.to })
        return false
      }
      return undefined
    },
  })
  return out
}

/** 视口区间内的代码 token 着色（仅 FencedCode 内生效） */
function collectCodeTokens(state: EditorState, from: number, to: number): CodeToken[] {
  const ranges = codeBlockRanges(state, from, to)
  if (ranges.length === 0) return []
  const tokens: CodeToken[] = []
  const tree = ensureSyntaxTree(state, to, 100) ?? syntaxTree(state)
  highlightTree(
    tree,
    CODE_HIGHLIGHTER,
    (f, tTo, classes) => {
      if (classes === '') return
      if (!ranges.some((r) => f >= r.from && tTo <= r.to)) return
      const primary = classes.split(' ')[0] ?? ''
      const style = CODE_CLASS_STYLE[primary]
      if (style !== undefined && tTo > f) tokens.push({ from: f, to: tTo, style })
    },
    from,
    to,
  )
  return tokens
}

// ---------------------------------------------------------------------------
// 行装配
// ---------------------------------------------------------------------------

/** 单行内容三态：普通 cells / 多行块（预渲染行）/ 被 widget 吞并（无行） */
type LineContent =
  | { kind: 'cells'; cells: StyledCell[] }
  | { kind: 'block'; rows: RenderSegment[][] }
  | { kind: 'absorbed' }

/** 单个文档行 → 行内容（blockCache：本趟 widget 实例 → 块渲染结果缓存） */
function buildLineContent(
  state: EditorState,
  lineFrom: number,
  lineTo: number,
  lineText: string,
  idx: DecorationIndex,
  codeTokens: CodeToken[],
  width: number,
  blockCache: Map<unknown, RenderSegment[][] | null>,
): LineContent {
  const doc = state.doc
  const baseClasses = idx.lineBase.get(lineFrom) ?? []
  const base = classesToStyle(baseClasses, {})

  // 多行块 widget（表格/块级数学/mermaid/图片/HR）：首行产出整块，续行 absorbed
  const wgAtLine = idx.widgets.find((w) => w.to > w.from + 1 && lineFrom >= w.from && lineFrom < w.to)
  if (wgAtLine !== undefined) {
    let rows = blockCache.get(wgAtLine.widget)
    if (rows === undefined) {
      const source = doc.sliceString(wgAtLine.from, wgAtLine.to)
      rows = blockWidgetRows(wgAtLine.widget, source, width)
      blockCache.set(wgAtLine.widget, rows)
    }
    if (rows !== null) {
      return lineFrom === wgAtLine.from ? { kind: 'block', rows } : { kind: 'absorbed' }
    }
    // rows === null：块不可表达（复杂公式/坏表格）→ 源码兜底，继续走 cells 路径
  }

  const cells: StyledCell[] = []
  if (baseClasses.includes('cm-quote-line')) {
    cells.push({ ch: '│ ', w: 2, docPos: -1, style: { dim: true } })
  }

  for (let pos = lineFrom; pos < lineTo; pos++) {
    if (idx.hidden.some((h) => pos >= h.from && pos < h.to)) continue
    const wg = idx.widgets.find((w) => pos >= w.from && pos < w.to)
    if (wg) {
      // 本行首次遇到该 widget：行内替身单格，或（块渲染失败的）本行源码段
      if (pos === Math.max(wg.from, lineFrom)) {
        const rep = inlineWidgetReplacement(wg.widget)
        if (rep !== null) {
          cells.push({ ch: rep.text, w: charWidth(rep.text), docPos: pos, style: { ...base, ...rep.style } })
        } else {
          for (let p = pos; p < Math.min(wg.to, lineTo); p++) {
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
    const codeTok = codeTokens.find((tok) => pos >= tok.from && pos < tok.to)
    const style =
      codeTok !== undefined
        ? classesToStyle(covering, { ...base, ...codeTok.style })
        : classesToStyle(covering, base)
    const ch = lineText[pos - lineFrom] ?? doc.sliceString(pos, pos + 1)
    cells.push({ ch, w: charWidth(ch), docPos: pos, style })
  }

  // 行尾虚拟空格：EOL 光标与换行边界输入的落点
  cells.push({ ch: ' ', w: 1, docPos: lineTo, style: { ...base } })
  return { kind: 'cells', cells }
}

/** cells → 样式段收敛（相邻同样式合并） */
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
  const codeTokens = collectCodeTokens(state, rangeFrom, rangeTo)

  const rows: LayoutRow[] = []
  let cursor: { x: number; y: number } | null = null
  let cursorRowWidth = 0
  const blockCache = new Map<unknown, RenderSegment[][] | null>()

  for (let ln = startLine; ln <= endLine; ln++) {
    const line = doc.line(ln)
    const content = buildLineContent(state, line.from, line.to, line.text, idx, codeTokens, width, blockCache)

    if (content.kind === 'absorbed') continue

    if (content.kind === 'block') {
      for (const segs of content.rows) {
        const w = segs.reduce((acc, s) => acc + charWidth(s.text), 0)
        rows.push({ segments: segs, width: w })
      }
      continue
    }

    const cells = content.cells
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
