/**
 * 编辑器命令（右键菜单与快捷键共用）：段落转换、行内包裹、清除格式、块插入、
 * Typora 编辑组（选行/选词/删词/跳转选区/标题升降级）。
 */
import { EditorView } from '@codemirror/view'
import { clearInlineMarks, shiftHeading, transformLines, type BlockKind } from './blockOps'
import { topLevelBlocks } from './blocks'

/** 用标记包裹选区（无选区时插入标记并把光标放到中间） */
export function wrapSelectionWith(view: EditorView, before: string, after: string): boolean {
  const sel = view.state.selection.main
  const text = view.state.doc.sliceString(sel.from, sel.to)
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: `${before}${text}${after}` },
    selection: { anchor: sel.from + before.length },
  })
  view.focus()
  return true
}

/** 清除选中文本的行内标记（** * ~~ `） */
export function clearInlineFormat(view: EditorView): boolean {
  const sel = view.state.selection.main
  const text = view.state.doc.sliceString(sel.from, sel.to)
  view.dispatch({ changes: { from: sel.from, to: sel.to, insert: clearInlineMarks(text) } })
  view.focus()
  return true
}

/** 对选区覆盖的整行应用段落转换 */
export function applyBlockKindToSelection(view: EditorView, kind: BlockKind): boolean {
  const sel = view.state.selection.main
  const fromLine = view.state.doc.lineAt(sel.from)
  const toLine = view.state.doc.lineAt(sel.to)
  const lines: string[] = []
  for (let n = fromLine.number; n <= toLine.number; n++) lines.push(view.state.doc.line(n).text)
  view.dispatch({
    changes: { from: fromLine.from, to: toLine.to, insert: transformLines(lines, kind).join('\n') },
    selection: { anchor: fromLine.from },
  })
  view.focus()
  return true
}

/** 在当前行下方插入块级片段（当前行有内容则先换行），光标落到片段尾 */
export function insertBlockSnippet(view: EditorView, snippet: string, cursorOffset?: number): boolean {
  const sel = view.state.selection.main
  const line = view.state.doc.lineAt(sel.from)
  const onEmptyLine = line.text.trim() === ''
  const at = onEmptyLine ? line.from : line.to
  const insert = onEmptyLine ? snippet : `\n${snippet}`
  view.dispatch({
    changes: { from: at, to: Math.max(at, sel.to > line.to ? sel.to : at), insert },
    selection: { anchor: at + (cursorOffset ?? insert.length) },
  })
  view.focus()
  return true
}

/** 标题行级别 ±1（Typora ⌘= / ⌘-，Win Ctrl+= / Ctrl+-；非标题行不动） */
export function adjustHeadingLevel(view: EditorView, delta: number): boolean {
  const sel = view.state.selection.main
  const fromLine = view.state.doc.lineAt(sel.from)
  const toLine = view.state.doc.lineAt(sel.to)
  const lines: string[] = []
  for (let n = fromLine.number; n <= toLine.number; n++) lines.push(view.state.doc.line(n).text)
  const next = lines.map((l) => shiftHeading(l, delta))
  if (next.join('\n') === lines.join('\n')) return false
  view.dispatch({
    changes: { from: fromLine.from, to: toLine.to, insert: next.join('\n') },
    selection: { anchor: fromLine.from },
  })
  view.focus()
  return true
}

/** 选行/句子（Typora ⌘L / Ctrl+L）：先选当前行，整行已选中时扩展到整个块 */
export function selectLineOrSentence(view: EditorView): boolean {
  const sel = view.state.selection.main
  const line = view.state.doc.lineAt(sel.head)
  if (!sel.empty && sel.from === line.from && sel.to === line.to) {
    const block = topLevelBlocks(view.state).find((b) => line.from >= b.from && line.from <= b.to)
    if (block) {
      view.dispatch({ selection: { anchor: block.from, head: block.to } })
      return true
    }
  }
  view.dispatch({ selection: { anchor: line.from, head: line.to } })
  return true
}

/** 选中光标处单词（Typora ⌘D / Ctrl+D） */
export function selectWordAtCursor(view: EditorView): boolean {
  const sel = view.state.selection.main
  if (!sel.empty) return false
  const word = view.state.wordAt(sel.head)
  if (!word || word.empty) return false
  view.dispatch({ selection: { anchor: word.from, head: word.to } })
  return true
}

/** 删除光标处单词（有选区时删选区）（Typora ⇧⌘D / Ctrl+Shift+D） */
export function deleteWordAtCursor(view: EditorView): boolean {
  const sel = view.state.selection.main
  const range = sel.empty ? view.state.wordAt(sel.head) : sel
  if (!range || range.from === range.to) return false
  view.dispatch({ changes: { from: range.from, to: range.to } })
  return true
}

/** 跳转到选区（Typora ⌘J / Ctrl+J）：光标滚动到视口中央 */
export function jumpToSelection(view: EditorView): boolean {
  view.dispatch({
    effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'center' }),
  })
  return true
}
