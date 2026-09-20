/**
 * LiveRenderEngine 装配：
 * - 装饰管线（StateField，line/widget 装饰必须来自 field 而非 plugin）
 * - IME 组合输入冻结：组合期间强制所在块保持源码态，防止渲染切换打断输入法
 * - ⌘/Ctrl+点击 打开链接或图片的源地址
 * - 选中文本后输入 * ` $ ~ 自动包裹为对应 Markdown 语法
 */
import { Compartment, RangeSet, StateEffect, StateField, type Extension } from '@codemirror/state'
import { EditorView, ViewPlugin, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'
import { cursorDocEnd, cursorDocStart, selectDocEnd, selectDocStart } from '@codemirror/commands'
import { openSearchPanel } from '@codemirror/search'
import { buildLiveDecorations } from './rules'
import { nearestBlock, topLevelBlocks } from './blocks'
import { docDirField } from './docDir'
import { smartPasteUrl } from './smartPaste'
import { openEditorContextMenu, tableMarkdown } from './contextMenu'
import { MathWidget, MermaidWidget } from './widgets'
import { effectiveBindings } from './keybindings'
import {
  focusModeField,
  sourceModeField,
  toggleFocusMode,
  toggleSourceMode,
  toggleTypewriterMode,
  viewModeExtensions,
} from './viewModes'
import {
  adjustHeadingLevel,
  applyBlockKindToSelection,
  clearInlineFormat,
  deleteWordAtCursor,
  insertBlockSnippet,
  jumpToSelection,
  selectLineOrSentence,
  selectWordAtCursor,
  wrapSelectionWith,
} from './commands'
import { adjustListIndentLines, renumberOrderedLines } from './blockOps'

/** 光标紧邻表格时按上/下键 → 聚焦表格首/末单元格（而不是落进被替换的源码文本里）。
 *  覆盖三种位置：块内、块间空行（空隙）、表格首尾边界。 */
export function enterNeighborTable(view: EditorView, dir: 'up' | 'down'): boolean {
  const blocks = topLevelBlocks(view.state)
  const head = view.state.selection.main.head
  const idx = blocks.findIndex((b) => head >= b.from && head <= b.to)

  if (idx === -1) {
    // 空隙（块间空行）：光标上方/下方的邻块是表格时接管，避免落进隐藏源码
    const nextIdx = blocks.findIndex((b) => b.from > head)
    const prev = nextIdx === -1 ? blocks[blocks.length - 1] : blocks[nextIdx - 1]
    const next = nextIdx === -1 ? undefined : blocks[nextIdx]
    const target = dir === 'down' ? next : prev
    if (!target || target.name !== 'Table') return false
    return focusTableCell(view, target.from, dir)
  }

  const current = blocks[idx]
  if (current.name === 'Table') {
    // 恰在表格首/尾边界：向下离开头部 / 向上离开尾部 → 进入表格
    const enterFromTop = dir === 'down' && head === current.from
    const enterFromBottom = dir === 'up' && head === current.to
    if (!enterFromTop && !enterFromBottom) return false
    return focusTableCell(view, current.from, dir)
  }
  const target = dir === 'down' ? blocks[idx + 1] : blocks[idx - 1]
  if (!target || target.name !== 'Table') return false
  return focusTableCell(view, target.from, dir)
}

function focusTableCell(view: EditorView, tableFrom: number, dir: 'up' | 'down'): boolean {
  const wrap = view.dom.querySelector(`.cm-table-wrap[data-pos="${tableFrom}"]`)
  if (!wrap) return false
  const cell =
    dir === 'down'
      ? wrap.querySelector<HTMLElement>('th,td')
      : (Array.from(wrap.querySelectorAll<HTMLElement>('tbody tr:last-child td'))[0] ??
        wrap.querySelector<HTMLElement>('th,td'))
  if (!cell) return false
  cell.scrollIntoView?.({ block: 'nearest' })
  cell.focus()
  // focus 未能生效的环境（或单元格不可聚焦）：退回源码态定位到该单元格
  if (document.activeElement !== cell) {
    const from = Number(cell.dataset.from)
    if (Number.isFinite(from)) {
      view.dispatch({ selection: { anchor: from } })
      view.focus()
      return true
    }
    return false
  }
  return true
}

/**
 * 列表行 Tab/Shift-Tab 升降层级（Typora 语义；非列表行返回 false 回落默认缩进）。
 * 升降后对全文档有序列表重编号（同级缩进连续 ol 行按出现顺序 1..n），
 * 逐行生成最小替换，光标由事务自动映射。
 */
export function adjustListIndent(view: EditorView, delta: 1 | -1): boolean {
  const { state } = view
  const sel = state.selection.main
  const firstLine = state.doc.lineAt(Math.min(sel.from, sel.to))
  const lastLine = state.doc.lineAt(Math.max(sel.from, sel.to))
  const lines: string[] = []
  for (let n = firstLine.number; n <= lastLine.number; n++) lines.push(state.doc.line(n).text)
  // 选区触到文档末尾时，末行换行会产生一条幻影空行（lineAt(doc.length) 落到它），剔除后再判定
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  const adjusted = adjustListIndentLines(lines, delta)
  if (!adjusted) return false

  const oldLines = state.doc.toJSON()
  const newLines = [...oldLines]
  for (let i = 0; i < adjusted.length; i++) newLines[firstLine.number - 1 + i] = adjusted[i]
  for (const [index, renumbered] of renumberOrderedLines(newLines)) newLines[index] = renumbered

  const changes = []
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n)
    if (newLines[n - 1] !== line.text) changes.push({ from: line.from, to: line.to, insert: newLines[n - 1] })
  }
  if (changes.length === 0) return false
  view.dispatch({ changes, userEvent: 'input.indent' })
  return true
}

/**
 * 打开查找面板；focusReplace 时把焦点移到替换输入（面板第二个输入框）。
 * CM6 search 面板没有官方的“聚焦替换框”API，此处 DOM 定位是_best effort_，找不到则停在查找框。
 */
function openSearchPanelWithReplaceFocus(focusReplace: boolean) {
  return (view: EditorView): boolean => {
    if (!openSearchPanel(view)) return false
    if (focusReplace) {
      const inputs = view.dom.querySelectorAll<HTMLElement>('.cm-panel.cm-search input')
      inputs[1]?.focus()
    }
    return true
  }
}

/** 命令 id → 执行器（键位由 keybindings.ts 注册表 + 覆盖解析） */
const COMMAND_RUNNERS: Record<string, (v: EditorView) => boolean> = {
  'find.open': openSearchPanelWithReplaceFocus(false),
  'find.replace': openSearchPanelWithReplaceFocus(true),
  'edit.heading-up': (v) => adjustHeadingLevel(v, 1),
  'edit.heading-down': (v) => adjustHeadingLevel(v, -1),
  'edit.select-line': selectLineOrSentence,
  'edit.select-word': selectWordAtCursor,
  'edit.delete-word': deleteWordAtCursor,
  'edit.jump-selection': jumpToSelection,
  'view.source': toggleSourceMode,
  'view.focus': toggleFocusMode,
  'view.typewriter': toggleTypewriterMode,
  'format.bold': (v) => wrapSelectionWith(v, '**', '**'),
  'format.italic': (v) => wrapSelectionWith(v, '*', '*'),
  'format.code': (v) => wrapSelectionWith(v, '`', '`'),
  'format.strike': (v) => wrapSelectionWith(v, '~~', '~~'),
  'format.link': (v) => wrapSelectionWith(v, '[', '](https://)'),
  'format.image': (v) => wrapSelectionWith(v, '![', '](https://)'),
  'format.clear': (v) => clearInlineFormat(v),
  'insert.code': (v) => insertBlockSnippet(v, '```\n\n```', 4),
  'insert.math': (v) => insertBlockSnippet(v, '$$\n\n$$', 3),
  'insert.table': (v) => insertBlockSnippet(v, tableMarkdown(3, 4)),
  'list.ul': (v) => applyBlockKindToSelection(v, 'ul'),
  'list.ol': (v) => applyBlockKindToSelection(v, 'ol'),
  'list.quote': (v) => applyBlockKindToSelection(v, 'quote'),
  'list.task': (v) => applyBlockKindToSelection(v, 'task'),
  'paragraph.body': (v) => applyBlockKindToSelection(v, 'paragraph'),
  'paragraph.h1': (v) => applyBlockKindToSelection(v, 'h1'),
  'paragraph.h2': (v) => applyBlockKindToSelection(v, 'h2'),
  'paragraph.h3': (v) => applyBlockKindToSelection(v, 'h3'),
  'paragraph.h4': (v) => applyBlockKindToSelection(v, 'h4'),
  'paragraph.h5': (v) => applyBlockKindToSelection(v, 'h5'),
  'paragraph.h6': (v) => applyBlockKindToSelection(v, 'h6'),
}

/**
 * 按注册表构建键位扩展（overrides 为渲染层持久化的显式覆盖，未知 id 忽略）。
 * 固定键（表格方向导航/列表 Tab/文档首尾）不参与重绑。
 */
export function buildTableAndFormatKeys(overrides?: Record<string, string>): Extension[] {
  const bindings = effectiveBindings(overrides)
  const rebindable = Object.entries(bindings)
    .map(([id, key]) => ({ key, run: COMMAND_RUNNERS[id] }))
    .filter((e): e is { key: string; run: (v: EditorView) => boolean } => typeof e.run === 'function')
  return [
    keymap.of([
      { key: 'ArrowDown', run: (v) => enterNeighborTable(v, 'down') },
      { key: 'ArrowUp', run: (v) => enterNeighborTable(v, 'up') },
      // 列表行 Tab/Shift-Tab 升降层级（非列表行回落 CM 默认空格缩进）
      { key: 'Tab', run: (v) => adjustListIndent(v, 1) },
      { key: 'Shift-Tab', run: (v) => adjustListIndent(v, -1) },
      // 跳到文档首/尾：Win Ctrl+Home/End（CM 默认键位已含）；mac ⌘↑/⌘↓
      { key: 'Mod-ArrowUp', run: cursorDocStart, shift: selectDocStart },
      { key: 'Mod-ArrowDown', run: cursorDocEnd, shift: selectDocEnd },
      ...rebindable,
    ]),
  ]
}

/** 默认键位（= 全部命令走平台默认）；兼容既有引用 */
export const tableAndFormatKeys: Extension[] = buildTableAndFormatKeys()

/** 键位热重配通道：设置页改快捷键后，宿主 dispatch reconfigure（见 EditorHost） */
export const formatKeysCompartment = new Compartment()

export { setDocDir } from './docDir'

/** 组合输入冻结范围（null = 无冻结） */
const compositionFreeze = StateEffect.define<{ from: number; to: number } | null>()

/**
 * 语法树推进刷新：Markdown 解析是异步分片的，首次装饰构建时远处的块可能还是占位节点
 * （表现为标题没样式、高度按默认行高渲染，点击映射整体错位）。解析推进后强制重建装饰。
 */
const parseRefresh = StateEffect.define<null>()

interface LiveState {
  deco: DecorationSet
  freeze: { from: number; to: number } | null
}

const liveField = StateField.define<LiveState>({
  create: (state) => ({ deco: RangeSet.of(buildLiveDecorations(state), true), freeze: null }),
  update: (prev, tr) => {
    let freeze = prev.freeze
    let freezeChanged = false
    for (const eff of tr.effects) {
      if (eff.is(compositionFreeze)) {
        freeze = eff.value
        freezeChanged = true
      }
    }
    if (tr.docChanged && freeze) {
      freeze = { from: tr.changes.mapPos(freeze.from), to: tr.changes.mapPos(freeze.to, 1) }
    }
    const parseAdvanced = tr.effects.some((e) => e.is(parseRefresh))
    // 源码/专注模式切换需要整体重建装饰
    const viewModeChanged =
      tr.startState.field(sourceModeField, false) !== tr.state.field(sourceModeField, false) ||
      tr.startState.field(focusModeField, false) !== tr.state.field(focusModeField, false)
    if (tr.docChanged || tr.selection || freezeChanged || parseAdvanced || viewModeChanged) {
      return {
        deco: RangeSet.of(buildLiveDecorations(tr.state, freeze ? [freeze] : [], undefined, { splitBlocks: true }), true),
        freeze,
      }
    }
    return { deco: prev.deco.map(tr.changes), freeze }
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.deco),
})

/** 观察语法树推进：树对象更新（且非文档变化驱动）时派发刷新，让装饰跟上解析结果 */
const parseWatcher = ViewPlugin.fromClass(
  class {
    private last: unknown

    constructor(view: EditorView) {
      this.last = syntaxTree(view.state)
    }

    update(update: ViewUpdate): void {
      const tree = syntaxTree(update.view.state)
      if (tree !== this.last) {
        this.last = tree
        if (!update.docChanged) {
          // 不允许在 update 循环内 dispatch；挪到微任务外
          queueMicrotask(() => update.view.dispatch({ effects: parseRefresh.of(null) }))
        }
      }
    }
  },
)

/** 在装饰集中找 pos 附近的数学/mermaid 替换区间，返回可置入的内部锚点（无则 null）。
 *  供点击渲染结果进入编辑：锚点必须严格落在区间内，才能触发显源码判定 */
export function revealAnchorAt(decos: DecorationSet, pos: number): number | null {
  let anchor: number | null = null
  decos.between(pos - 1, pos + 1, (from, to, deco) => {
    if (anchor !== null) return
    const w = deco.spec.widget
    if ((w instanceof MathWidget || w instanceof MermaidWidget) && to > from + 1) {
      anchor = Math.min(Math.max(pos, from + 1), to - 1)
    }
  })
  return anchor
}

/** 找到 pos 所在链接/图片节点的 URL 子节点文本 */
function urlAt(view: EditorView, pos: number): string | null {
  let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, -1)
  while (node && node.name !== 'Link' && node.name !== 'Image') {
    node = node.parent
  }
  if (!node) return null
  let child = node.firstChild
  while (child) {
    if (child.name === 'URL') return view.state.sliceDoc(child.from, child.to)
    child = child.nextSibling
  }
  return null
}

/** 选中文本后输入配对字符 → 包裹（* → **粗体**，` $ ~ 同理） */
const WRAP_PAIRS: Record<string, [string, string]> = {
  '*': ['**', '**'],
  '`': ['`', '`'],
  '$': ['$', '$'],
  '~': ['~~', '~~'],
}

const wrapSelection = EditorView.inputHandler.of((view, from, to, text) => {
  const pair = WRAP_PAIRS[text]
  if (!pair) return false
  const sel = view.state.selection.main
  if (sel.empty || from !== sel.from || to !== sel.to) return false
  const [open, close] = pair
  const inner = view.state.sliceDoc(sel.from, sel.to)
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: open + inner + close },
    selection: { anchor: sel.from + open.length, head: sel.to + open.length },
  })
  return true
})

const interactionHandlers = EditorView.domEventHandlers({
  compositionstart: (_event, view) => {
    const head = view.state.selection.main.head
    const block = nearestBlock(topLevelBlocks(view.state), head)
    const range = block ? { from: block.from, to: block.to } : { from: head, to: head }
    view.dispatch({ effects: compositionFreeze.of(range) })
  },
  compositionend: (_event, view) => {
    view.dispatch({ effects: compositionFreeze.of(null) })
  },
  mousedown: (event, view) => {
    if (event.button !== 0) return false
    if (event.metaKey || event.ctrlKey) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos === null) return false
      const url = urlAt(view, pos)
      if (!url) return false
      window.open(url, '_blank', 'noopener,noreferrer')
      return true
    }
    // 点击行内公式渲染结果 → 光标置入语法区间，原地显源码进入编辑（Typora 行为）。
    // 块级数学/mermaid 走分栏 Widget（自带源码窗格），不在此列；
    // Widget 的 ignoreEvent=true 使编辑器不接管其点击，这里统一代管行内公式。
    const target = event.target
    if (!(target instanceof Element)) return false
    if (!target.closest('.cm-math-inline')) return false
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (pos === null) return false
    const anchor = revealAnchorAt(view.state.field(liveField).deco, pos)
    if (anchor === null) return false
    view.focus()
    view.dispatch({ selection: { anchor } })
    return true
  },
  // 右键菜单：剪切/复制/粘贴/全选 + 格式 + 插入
  contextmenu: (event, view) => {
    event.preventDefault()
    return openEditorContextMenu(view, event.clientX, event.clientY)
  },
  // 智能粘贴：选中文字 + 粘贴纯 URL → [文字](URL)
  paste: (event, view) => {
    const sel = view.state.selection.main
    if (sel.empty) return false
    const clip = event.clipboardData?.getData('text/plain') ?? ''
    const selected = view.state.sliceDoc(sel.from, sel.to)
    const replacement = smartPasteUrl(selected, clip)
    if (!replacement) return false
    event.preventDefault()
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: replacement },
      selection: { anchor: sel.from + 1, head: sel.from + 1 + selected.length },
    })
    return true
  },
})

/** 块级实时渲染引擎总扩展 */
export function liveRender(): Extension {
  return [docDirField, ...viewModeExtensions(), liveField, parseWatcher, interactionHandlers, wrapSelection]
}
