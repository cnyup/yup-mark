/**
 * 无头预览装配器（MT0）：EditorState → 结构化样式行。
 *
 * 这是 TUI.md §3.1 EditorSurface 行装配管线的种子：
 *   buildLiveDecorations(state) → 逐行消费装饰（隐藏/mark/line/widget 分流）
 *   → 产出与终端无关的 Span 结构（无 ANSI、无 Ink 依赖，可无头测试）。
 *
 * MT0 边界：widget 装饰（圆点/复选框/表格/数学/占位框）一律显示源码
 * —— 等价于桌面版"光标进入显源码"态；widget 降级渲染器在 MT1/MT2 落地。
 */
import type { EditorState, Range } from '@codemirror/state'
import type { Decoration } from '@codemirror/view'
import { buildLiveDecorations } from '@yupmark/live-cm/rules'

export interface SpanStyle {
  bold?: boolean
  italic?: boolean
  dim?: boolean
  underline?: boolean
  strikethrough?: boolean
  /** 前景色（终端色名；MT0 固定映射，MT4 换主题调色板） */
  color?: string
  /** 前景/背景反转（光标格） */
  inverse?: boolean
}

export interface Span extends SpanStyle {
  text: string
}

/** 渲染段（grid.ts / layout.ts 共用的产出单元） */
export interface RenderSegment {
  text: string
  style: SpanStyle
}

export interface PreviewLine {
  spans: Span[]
}

export interface MarkRange {
  from: number
  to: number
  classes: string[]
}

/** 标题层级 → 颜色（MT4 主题化前的种子映射） */
const HEADING_COLORS: Record<string, string> = {
  'cm-h1': 'magenta',
  'cm-h2': 'yellow',
  'cm-h3': 'cyan',
  'cm-h4': 'green',
  'cm-h5': 'blue',
  'cm-h6': 'gray',
}


/** 类名 → 样式（与桌面 base.css 的 .cm-* 规则同源，TUI.md §5 映射表） */
export function classesToStyle(classes: string[], base: SpanStyle): SpanStyle {
  const out: SpanStyle = { ...base }
  for (const cls of classes.flatMap((c) => c.split(/\s+/))) {
    switch (cls) {
      case 'cm-strong':
        out.bold = true
        break
      case 'cm-em':
        out.italic = true
        break
      case 'cm-strike':
        out.strikethrough = true
        break
      case 'cm-mark-dim':
        out.dim = true
        break
      case 'cm-inline-code':
        out.color = out.color ?? 'cyan'
        break
      case 'cm-link-text':
        out.color = out.color ?? 'blue'
        out.underline = true
        break
      case 'cm-quote-line':
        out.dim = true
        break
      case 'cm-code-line':
        out.color = out.color ?? 'green'
        break
      default:
        if (HEADING_COLORS[cls] !== undefined) {
          out.bold = true
          out.color = HEADING_COLORS[cls]
        }
    }
  }
  return out
}

/** 样式键：同一字符被多个 mark 覆盖时按属性合并后收敛成一段 */
function styleKey(s: SpanStyle): string {
  return [s.bold, s.italic, s.dim, s.underline, s.strikethrough, s.color].join('|')
}

/** 样式收集结果（layout.ts 与本模块共享） */
export interface DecorationIndex {
  hidden: { from: number; to: number }[]
  marks: MarkRange[]
  lineBase: Map<number, string[]>
  widgets: { from: number; to: number; widget: unknown }[]
}

/** 装饰四路分流：hidden（纯隐藏）/ marks / line（行首 class）/ widgets（替换型） */
export function collectDecorations(
  state: EditorState,
  range?: { from: number; to: number },
): DecorationIndex {
  const decos: Range<Decoration>[] = buildLiveDecorations(state, [], range)
  const idx: DecorationIndex = {
    hidden: [],
    marks: [],
    lineBase: new Map(),
    widgets: [],
  }
  for (const d of decos) {
    const spec = d.value.spec as { class?: unknown; widget?: unknown }
    if (spec.widget != null) {
      idx.widgets.push({ from: d.from, to: d.to, widget: spec.widget })
    } else if (spec.class === undefined) {
      if (d.to > d.from) idx.hidden.push({ from: d.from, to: d.to })
    } else if (d.from === d.to) {
      // Decoration.line：from === to === 行首
      const arr = idx.lineBase.get(d.from) ?? []
      arr.push(String(spec.class))
      idx.lineBase.set(d.from, arr)
    } else {
      idx.marks.push({ from: d.from, to: d.to, classes: [String(spec.class)] })
    }
  }
  return idx
}

/** 装饰 → 样式行。state 需已含 markdown() 扩展与目标选区。 */
export function renderPreviewLines(state: EditorState): PreviewLine[] {
  const doc = state.doc
  const { hidden, marks, lineBase } = collectDecorations(state)

  const isHidden = (pos: number): boolean => hidden.some((h) => pos >= h.from && pos < h.to)

  const lines: PreviewLine[] = []
  for (let ln = 1; ln <= doc.lines; ln++) {
    const line = doc.line(ln)
    const baseClasses = lineBase.get(line.from) ?? []
    const base = classesToStyle(baseClasses, {})
    const isQuote = baseClasses.includes('cm-quote-line')

    const spans: Span[] = []
    // 引用块：行首竖线前缀（桌面左边框的 TUI 等价，TUI.md §5），独立 dim 段
    if (isQuote) spans.push({ text: '│ ', dim: true })

    let current: Span | null = null
    let currentKey = ''
    for (let pos = line.from; pos < line.to; pos++) {
      if (isHidden(pos)) {
        current = null
        continue
      }
      const covering = marks.filter((m) => pos >= m.from && pos < m.to).flatMap((m) => m.classes)
      const style = classesToStyle(covering, base)
      const key = styleKey(style)
      const ch = doc.sliceString(pos, pos + 1)
      if (current === null || key !== currentKey) {
        current = { ...style, text: ch }
        currentKey = key
        spans.push(current)
      } else {
        current.text += ch
      }
    }
    lines.push({ spans })
  }
  return lines
}

/** 仅供非交互输出（CI/管道）：剥离样式为纯文本 */
export function previewToPlainText(lines: PreviewLine[]): string {
  return lines.map((l) => l.spans.map((s) => s.text).join('')).join('\n')
}
