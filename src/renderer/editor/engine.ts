/**
 * LiveRenderEngine 装配：
 * - 装饰管线（StateField，line/widget 装饰必须来自 field 而非 plugin）
 * - IME 组合输入冻结：组合期间强制所在块保持源码态，防止渲染切换打断输入法
 * - ⌘/Ctrl+点击 打开链接或图片的源地址
 * - 选中文本后输入 * ` $ ~ 自动包裹为对应 Markdown 语法
 */
import { RangeSet, StateEffect, StateField, type Extension } from '@codemirror/state'
import { EditorView, ViewPlugin, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'
import { cursorDocEnd, cursorDocStart, selectDocEnd, selectDocStart } from '@codemirror/commands'
import { buildLiveDecorations } from './rules'
import { nearestBlock, topLevelBlocks } from './blocks'
import { docDirField } from './docDir'
import { smartPasteUrl } from './smartPaste'
import { openEditorContextMenu, tableMarkdown } from './contextMenu'
import { IS_MAC } from './platform'
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
import type { BlockKind } from './blockOps'

/** 段落快捷键（Typora 官方对照，双平台一致）：⌘0 正文 / ⌘1-6 标题 */
const BLOCK_KEYS: ReadonlyArray<{ key: string; kind: BlockKind }> = [
  { key: 'Mod-0', kind: 'paragraph' },
  { key: 'Mod-1', kind: 'h1' },
  { key: 'Mod-2', kind: 'h2' },
  { key: 'Mod-3', kind: 'h3' },
  { key: 'Mod-4', kind: 'h4' },
  { key: 'Mod-5', kind: 'h5' },
  { key: 'Mod-6', kind: 'h6' },
]

/** 列表/引用/任务（Typora 官方两套：mac ⌘⌥ 系，Win Ctrl+Shift 系） */
const LIST_KEYS_MAC: ReadonlyArray<{ key: string; kind: BlockKind }> = [
  { key: 'Mod-Alt-u', kind: 'ul' },
  { key: 'Mod-Alt-o', kind: 'ol' },
  { key: 'Mod-Alt-q', kind: 'quote' },
  { key: 'Mod-Alt-x', kind: 'task' },
]
const LIST_KEYS_WIN: ReadonlyArray<{ key: string; kind: BlockKind }> = [
  { key: 'Mod-Shift-]', kind: 'ul' },
  { key: 'Mod-Shift-[', kind: 'ol' },
  { key: 'Mod-Shift-q', kind: 'quote' },
  { key: 'Mod-Shift-x', kind: 'task' },
]

const blockBinding = ({ key, kind }: { key: string; kind: BlockKind }) => ({
  key,
  run: (v: EditorView) => applyBlockKindToSelection(v, kind),
})

/** 插入块（Typora 官方两套：mac ⌘⌥ 系，Win Ctrl+Shift 系 / Ctrl+T） */
const INSERT_KEYS_MAC = [
  { key: 'Mod-Alt-c', run: (v: EditorView) => insertBlockSnippet(v, '```\n\n```', 4) },
  { key: 'Mod-Alt-b', run: (v: EditorView) => insertBlockSnippet(v, '$$\n\n$$', 3) },
  { key: 'Mod-Alt-t', run: (v: EditorView) => insertBlockSnippet(v, tableMarkdown(3, 4)) },
]
const INSERT_KEYS_WIN = [
  { key: 'Mod-Shift-k', run: (v: EditorView) => insertBlockSnippet(v, '```\n\n```', 4) },
  { key: 'Mod-Shift-m', run: (v: EditorView) => insertBlockSnippet(v, '$$\n\n$$', 3) },
  { key: 'Mod-t', run: (v: EditorView) => insertBlockSnippet(v, tableMarkdown(3, 4)) },
]

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

/** 表格键盘导航 + 段落/格式/编辑组快捷键（Typora 官方对照；需排在 defaultKeymap 之前） */
export const tableAndFormatKeys: Extension[] = [
  keymap.of([
    { key: 'ArrowDown', run: (v) => enterNeighborTable(v, 'down') },
    { key: 'ArrowUp', run: (v) => enterNeighborTable(v, 'up') },
    // 跳到文档首/尾：Win Ctrl+Home/End（CM 默认键位已含）；mac ⌘↑/⌘↓
    { key: 'Mod-ArrowUp', run: cursorDocStart, shift: selectDocStart },
    { key: 'Mod-ArrowDown', run: cursorDocEnd, shift: selectDocEnd },
    // 标题级别升降（⌘= / ⌘-，Win Ctrl+= / Ctrl+-）
    { key: 'Mod-=', run: (v) => adjustHeadingLevel(v, 1) },
    { key: 'Mod--', run: (v) => adjustHeadingLevel(v, -1) },
    // 编辑组：选行/句子 ⌘L、选词 ⌘D、删词 ⇧⌘D、跳转到选区 ⌘J（Win 对应 Ctrl 系）
    { key: 'Mod-l', run: selectLineOrSentence },
    { key: 'Mod-d', run: selectWordAtCursor },
    { key: 'Mod-Shift-d', run: deleteWordAtCursor },
    { key: 'Mod-j', run: jumpToSelection },
    // 视图三件套（Typora）：源码模式 ⌘/（覆盖 CM6 的注释默认键）、专注 F8、打字机 F9
    { key: 'Mod-/', run: toggleSourceMode },
    { key: 'F8', run: toggleFocusMode },
    { key: 'F9', run: toggleTypewriterMode },
    // 格式组（双平台一致）：加粗/斜体/行内代码/链接/清除格式
    { key: 'Mod-b', run: (v) => wrapSelectionWith(v, '**', '**') },
    { key: 'Mod-i', run: (v) => wrapSelectionWith(v, '*', '*') },
    { key: 'Mod-Shift-`', run: (v) => wrapSelectionWith(v, '`', '`') },
    { key: 'Mod-k', run: (v) => wrapSelectionWith(v, '[', '](https://)') },
    { key: 'Mod-\\', run: (v) => clearInlineFormat(v) },
    ...(IS_MAC
      ? [
          // 删除线 ⌃⇧`、图片 ⌃⌘I
          { key: 'Control-Shift-`', run: (v: EditorView) => wrapSelectionWith(v, '~~', '~~') },
          { key: 'Control-Mod-i', run: (v: EditorView) => wrapSelectionWith(v, '![', '](https://)') },
          ...INSERT_KEYS_MAC,
          ...LIST_KEYS_MAC.map(blockBinding),
        ]
      : [
          // 删除线 Alt+Shift+5、图片 Ctrl+Shift+I
          { key: 'Alt-Shift-5', run: (v: EditorView) => wrapSelectionWith(v, '~~', '~~') },
          { key: 'Mod-Shift-i', run: (v: EditorView) => wrapSelectionWith(v, '![', '](https://)') },
          ...INSERT_KEYS_WIN,
          ...LIST_KEYS_WIN.map(blockBinding),
        ]),
    ...BLOCK_KEYS.map(blockBinding),
  ]),
]

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
        deco: RangeSet.of(buildLiveDecorations(tr.state, freeze ? [freeze] : []), true),
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
    if (event.button !== 0 || !(event.metaKey || event.ctrlKey)) return false
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (pos === null) return false
    const url = urlAt(view, pos)
    if (!url) return false
    window.open(url, '_blank', 'noopener,noreferrer')
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
