/**
 * 实时渲染规则表（docs/DESIGN.md §4.1.3，Typora 式）：
 * 所有块保持渲染态编辑 —— 样式 mark 永远生效；光标所在块的行级标记（# >）淡显；
 * 行内标记（** ` []()）按选区是否落入语法跨度就近淡显；非活跃块完全隐藏标记。
 * 整节点替换 Widget（表格/图片/数学/分割线）在光标进入其语法范围时显源码。
 * 块级样式（标题字号/引用边线/代码块底色）始终生效。IME 组合区间强制纯源码防打断。
 * 本模块是纯函数（EditorState in → Decoration out），可无头测试。
 */
import type { EditorState, Range, SelectionRange } from '@codemirror/state'
import { Decoration } from '@codemirror/view'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'
import { computeActiveSet, nearestBlock, topLevelBlocks } from './blocks'
import { docDirField } from './docDir'
import { focusModeField, sourceModeField } from './viewModes'
import { alignFromDelimiter } from './table'
import type { TableCellSpec } from './widgets'
import {
  BulletWidget,
  CheckboxWidget,
  CodeLangWidget,
  HrWidget,
  ImageWidget,
  MathWidget,
  MermaidWidget,
  TableWidget,
} from './widgets'

function namedChildren(node: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = []
  let c = node.firstChild
  while (c) {
    out.push(c)
    c = c.nextSibling
  }
  return out
}

/** 从 `![alt](src "title")` 原文中提取 alt 与 src */
function parseImageParts(text: string): { alt: string; src: string } {
  const m = /^!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+[^)]*)?\)$/.exec(text)
  if (!m) return { alt: '', src: '' }
  return { alt: m[1] ?? '', src: m[2] ?? '' }
}

/**
 * 构建全部实时渲染装饰。
 *
 * 隐藏语法符号统一走 Decoration.replace（CM6 代码折叠同款机制）：
 * 不能用 mark + display:none —— 隐藏文本没有布局矩形，会破坏 posAtCoords
 * 的坐标映射，导致点击落点错位。replace 范围完全不在 DOM 中，坐标语义正确。
 *
 * @param extraActive 额外强制显示源码的范围（IME 组合输入冻结用）
 * @param range 可选装配区间：只产出与该文档区间相交的装饰（TUI 视口渲染用，
 *   10k 行文档每键全量重算 60ms+ → 视口内 <2ms）。缺省 = 全文档（桌面行为不变）。
 *   区间内产出与全量计算完全一致（按块状态无关，无跨块副作用）。
 */
export function buildLiveDecorations(
  state: EditorState,
  extraActive: { from: number; to: number }[] = [],
  range?: { from: number; to: number },
): Range<Decoration>[] {
  // 源码模式（⌘/）：语法符号全部可见（着色由 markdown 基础高亮提供），仅保留块样式与行内样式，
  // 并挂行号槽 + 当前行高亮（viewModes 的 Compartment）——Typora 源码视图同款
  const sourceMode = state.field(sourceModeField, false) ?? false
  const out: Range<Decoration>[] = []
  const hidden: { from: number; to: number }[] = []
  const doc = state.doc
  const blocks = topLevelBlocks(state)
  const active = computeActiveSet(blocks, state.selection.ranges as readonly SelectionRange[], extraActive)
  const inRange = (from: number, to: number): boolean =>
    range === undefined || (to >= range.from && from <= range.to)

  const hide = (from: number, to: number): void => {
    if (!sourceMode && to > from) hidden.push({ from, to })
  }

  /** 范围末端若跟着空格则一并吞掉（如 `# ` / `> ` / `- `） */
  const withSpace = (to: number): number => (doc.sliceString(to, to + 1) === ' ' ? to + 1 : to)

  /** mark 所在块是否活跃（活跃 = 行级标记淡显而非隐藏） */
  const shown = (pos: number): boolean => {
    const b = nearestBlock(blocks, pos)
    return b === null || active.has(b)
  }

  /** 选区与行内区间相交：行内标记的淡显判定（Typora 式就近揭示，非整块） */
  const inlineActive = (from: number, to: number): boolean =>
    state.selection.ranges.some((r) => r.from < to && r.to > from)

  /** IME 组合冻结区间：保持纯源码，避免组合期间装饰 DOM 切换打断输入法 */
  const frozen = (from: number, to: number): boolean =>
    extraActive.some((f) => f.from <= from && f.to >= to)

  /** 活跃态淡显标记（文字保留在 DOM，仅淡化颜色）；源码模式下不着色（语法高亮已着色） */
  const dim = (from: number, to: number): void => {
    if (!sourceMode && to > from) out.push(Decoration.mark({ class: 'cm-mark-dim' }).range(from, to))
  }

  const lineClass = (from: number, to: number, cls: string): void => {
    let pos = from
    for (;;) {
      const line = doc.lineAt(pos)
      if (inRange(line.from, line.to)) out.push(Decoration.line({ class: cls }).range(line.from))
      if (line.to >= to) break
      pos = line.to + 1
    }
  }

  // 专注模式：非活跃块整体淡化（当前编辑块保持全亮）
  if (state.field(focusModeField, false)) {
    for (const b of blocks) {
      if (inRange(b.from, b.to) && !active.has(b)) lineClass(b.from, b.to, 'cm-focus-dim')
    }
  }

  const walk = (node: SyntaxNode, parentName: string): void => {
    // 整节点被块级替换时不再递归子节点（避免嵌套替换冲突，如表格单元格里的行内公式）
    let skipChildren = false
    switch (node.name) {
      case 'InlineMath': {
        if (!inlineActive(node.from, node.to)) {
          const tex = doc.sliceString(node.from + 1, node.to - 1)
          out.push(Decoration.replace({ widget: new MathWidget(tex, false), block: false }).range(node.from, node.to))
        }
        break
      }
      case 'Paragraph': {
        // 块级数学：整个段落就是 $$...$$（无自定义块级解析器的轻量方案）
        if (!shown(node.from)) {
          const raw = doc.sliceString(node.from, node.to)
          if (raw.startsWith('$$') && raw.endsWith('$$') && raw.length > 4) {
            out.push(
              Decoration.replace({
                widget: new MathWidget(raw.slice(2, -2).trim(), true),
                block: true,
              }).range(node.from, node.to),
            )
            skipChildren = true
          }
        }
        break
      }
      case 'Table': {
        // 边界不算活跃：光标恰好停在表格首/尾位置（点击表格最前面的落点）时保持渲染态
        const tableActive = state.selection.ranges.some(
          (r) =>
            (r.from > node.from && r.from < node.to) ||
            (r.to > node.from && r.to < node.to) ||
            (r.from <= node.from && r.to >= node.to),
        )
        if (!tableActive) {
          // 结构与单元格区间取自语法树（供单元格级编辑同步回文档），对齐取分隔行文本
          const header: TableCellSpec[] = []
          const rows: TableCellSpec[][] = []
          let delimiter = ''
          const pushCells = (rowNode: SyntaxNode, out: TableCellSpec[]): void => {
            let c = rowNode.firstChild
            while (c) {
              if (c.name === 'TableCell') {
                out.push({ text: doc.sliceString(c.from, c.to), from: c.from, to: c.to })
              }
              c = c.nextSibling
            }
            // GFM 解析器对全空单元格行（如 `| | |`）不产出 TableCell 节点：
            // 手动按竖线切分行文本合成区间，保证空行仍有表格样式、可直接编辑
            if (out.length === 0) {
              const raw = doc.sliceString(rowNode.from, rowNode.to)
              const first = raw.indexOf('|')
              const last = raw.lastIndexOf('|')
              if (last > first) {
                let pos = rowNode.from + first + 1
                for (const seg of raw.slice(first + 1, last).split('|')) {
                  out.push({ text: seg, from: pos, to: pos + seg.length })
                  pos += seg.length + 1
                }
              }
            }
          }
          let child = node.firstChild
          while (child) {
            if (child.name === 'TableHeader') {
              // 结构兼容：新版 lezer-markdown 的 TableHeader 直接挂 TableCell（无 TableRow 包裹）
              const rowNode = child.getChild('TableRow') ?? child
              pushCells(rowNode, header)
            } else if (child.name === 'TableDelimiter') {
              delimiter = doc.sliceString(child.from, child.to)
            } else if (child.name === 'TableRow') {
              const cells: TableCellSpec[] = []
              pushCells(child, cells)
              rows.push(cells)
            }
            child = child.nextSibling
          }
          out.push(
            Decoration.replace({
              widget: new TableWidget({ from: node.from, to: node.to, header, rows, align: alignFromDelimiter(delimiter) }),
              block: true,
            }).range(node.from, node.to),
          )
          skipChildren = true
        }
        break
      }
      case 'ATXHeading1':
      case 'ATXHeading2':
      case 'ATXHeading3':
      case 'ATXHeading4':
      case 'ATXHeading5':
      case 'ATXHeading6': {
        const level = Number(node.name.slice('ATXHeading'.length))
        lineClass(node.from, node.to, `cm-h-line cm-h${level}`)
        const mark = node.getChild('HeaderMark')
        if (mark && !frozen(mark.from, mark.to)) {
          // 光标所在块：# 淡显（Typora 式）；离开后隐藏
          if (shown(mark.from)) dim(mark.from, mark.to)
          else hide(mark.from, withSpace(mark.to))
        }
        break
      }
      case 'StrongEmphasis': {
        if (!frozen(node.from, node.to)) {
          out.push(Decoration.mark({ class: 'cm-strong' }).range(node.from, node.to))
          for (const c of namedChildren(node)) {
            if (c.name === 'EmphasisMark') {
              if (inlineActive(node.from, node.to)) dim(c.from, c.to)
              else hide(c.from, c.to)
            }
          }
        }
        break
      }
      case 'Emphasis': {
        if (!frozen(node.from, node.to)) {
          out.push(Decoration.mark({ class: 'cm-em' }).range(node.from, node.to))
          for (const c of namedChildren(node)) {
            if (c.name === 'EmphasisMark') {
              if (inlineActive(node.from, node.to)) dim(c.from, c.to)
              else hide(c.from, c.to)
            }
          }
        }
        break
      }
      case 'Strikethrough': {
        if (!frozen(node.from, node.to)) {
          out.push(Decoration.mark({ class: 'cm-strike' }).range(node.from, node.to))
          for (const c of namedChildren(node)) {
            if (c.name === 'StrikethroughMark') {
              if (inlineActive(node.from, node.to)) dim(c.from, c.to)
              else hide(c.from, c.to)
            }
          }
        }
        break
      }
      case 'InlineCode': {
        if (!frozen(node.from, node.to)) {
          out.push(Decoration.mark({ class: 'cm-inline-code' }).range(node.from, node.to))
          for (const c of namedChildren(node)) {
            if (c.name === 'CodeMark') {
              if (inlineActive(node.from, node.to)) dim(c.from, c.to)
              else hide(c.from, c.to)
            }
          }
        }
        break
      }
      case 'Link': {
        if (frozen(node.from, node.to)) break
        const reveal = inlineActive(node.from, node.to)
        const kids = namedChildren(node)
        let firstMark: SyntaxNode | null = null
        let secondMark: SyntaxNode | null = null
        let hasImage = false
        for (const c of kids) {
          if (c.name === 'Image') hasImage = true
          if (c.name === 'LinkMark' || c.name === 'URL' || c.name === 'LinkTitle') {
            if (reveal) dim(c.from, c.to)
            else hide(c.from, c.to)
          }
          if (c.name === 'LinkMark') {
            if (!firstMark) firstMark = c
            else if (!secondMark) secondMark = c
          }
        }
        // 链接文字（`[` 与 `]` 之间的匿名文本）始终着色；标签内嵌图片时不加（避免与替换装饰重叠）
        if (firstMark && secondMark && secondMark.from > firstMark.to && !hasImage) {
          out.push(Decoration.mark({ class: 'cm-link-text' }).range(firstMark.to, secondMark.from))
        }
        break
      }
      case 'Image': {
        if (!inlineActive(node.from, node.to)) {
          const { alt, src } = parseImageParts(doc.sliceString(node.from, node.to))
          out.push(
            Decoration.replace({
              widget: new ImageWidget(src, alt, state.field(docDirField, false) ?? null),
              block: false,
            }).range(node.from, node.to),
          )
        }
        break
      }
      case 'Blockquote': {
        lineClass(node.from, node.to, 'cm-quote-line')
        break
      }
      case 'QuoteMark': {
        if (!frozen(node.from, node.to)) {
          if (shown(node.from)) dim(node.from, node.to)
          else hide(node.from, withSpace(node.to))
        }
        break
      }
      case 'HorizontalRule': {
        if (!shown(node.from)) {
          out.push(Decoration.replace({ widget: new HrWidget(), block: true }).range(node.from, node.to))
        }
        break
      }
      case 'FencedCode':
      case 'CodeBlock': {
        // 代码块永远是源码形态（Typora 同款）；mermaid 例外：非活跃时渲染为图表
        lineClass(node.from, node.to, 'cm-code-line')
        if (node.name === 'FencedCode') {
          const info = node.getChild('CodeInfo')
          const code = node.getChild('CodeText')
          const lang = info ? doc.sliceString(info.from, info.to) : ''
          const isMermaid = lang.trim().toLowerCase() === 'mermaid'
          if (isMermaid && code && !shown(node.from)) {
            out.push(
              Decoration.replace({
                widget: new MermaidWidget(doc.sliceString(code.from, code.to)),
                block: true,
              }).range(node.from, node.to),
            )
            skipChildren = true
          } else if (!isMermaid) {
            // 语言选择器（闭合围栏行尾）；首行的 ```lang 源码本身就是直接编辑入口
            const openingMark = node.getChild('CodeMark')
            const infoFrom = info ? info.from : openingMark ? openingMark.to : node.from
            const infoTo = info ? info.to : infoFrom
            out.push(
              Decoration.widget({ widget: new CodeLangWidget(lang, infoFrom, infoTo) }).range(node.to),
            )
          }
        }
        break
      }
      case 'ListItem': {
        // 列表行样式常驻（行距呼吸感）
        lineClass(node.from, node.to, 'cm-list-line')
        const mark = node.getChild('ListMark')
        if (mark) {
          if (parentName === 'OrderedList') {
            // 有序列表编号保持可见
          } else if (node.getChild('Task') || node.getChild('TaskMarker')) {
            // 任务项：`-` 连同其后的空格始终隐藏，由复选框 Widget 接管视觉（编辑任务文字时框不消失）
            hide(mark.from, withSpace(mark.to))
          } else {
            // 无序符号始终渲染（Typora 式，编辑列表文字时圆点保留）
            out.push(Decoration.replace({ widget: new BulletWidget(), block: false }).range(mark.from, mark.to))
          }
        }
        break
      }
      case 'Task': {
        // 任务复选框始终渲染（点击切换，编辑文字时不退回源码）
        const marker = node.getChild('TaskMarker')
        if (marker) {
          const checked = doc.sliceString(marker.from, marker.to).includes('x')
          out.push(
            Decoration.replace({ widget: new CheckboxWidget(checked, marker.from, marker.to), block: false }).range(
              marker.from,
              marker.to,
            ),
          )
        }
        break
      }
      default:
        break
    }
    if (skipChildren) return
    let child = node.firstChild
    while (child) {
      walk(child, node.name)
      child = child.nextSibling
    }
  }

  // CM6 只按需解析视口范围；装饰需要全文档语法树（否则视口外的标题/表格无样式，
  // 行高按默认值渲染，点击映射整体错位）。ensureSyntaxTree 同步补齐（预算 100ms）。
  const tree = ensureSyntaxTree(state, state.doc.length, 100) ?? syntaxTree(state)
  let node = tree.topNode.firstChild
  while (node) {
    if (range !== undefined && node.from > range.to) break // 顶层节点按序，可提前终止
    if (inRange(node.from, node.to)) walk(node, 'Document')
    node = node.nextSibling
  }

  // 隐藏区间排序、合并相邻/重叠段后统一替换（重叠的 replace 装饰非法）
  hidden.sort((a, b) => a.from - b.from || a.to - b.to)
  const merged: { from: number; to: number }[] = []
  for (const r of hidden) {
    const last = merged[merged.length - 1]
    if (last && r.from <= last.to) last.to = Math.max(last.to, r.to)
    else merged.push({ ...r })
  }
  for (const r of merged) {
    out.push(Decoration.replace({}).range(r.from, r.to))
  }

  // 源码模式：丢弃替换型 Widget（表格/图片/圆点等回到纯源码形态）与淡显标记
  if (sourceMode) {
    return out.filter(
      (d) => d.value.spec.widget === undefined && d.value.spec.class !== 'cm-mark-dim',
    )
  }

  // 临时诊断：按模式过滤（定位测量问题后移除）
  // 排序交给 RangeSet.of(sort=true)
  return out
}
