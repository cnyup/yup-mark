/**
 * 上下文菜单动作（MT3b）：格式包裹 / 插入模板。
 * 全部为 session 上的纯事务操作，与桌面右键菜单三段布局对应（TUI 单层简化）。
 */
import type { EditorSession } from './session'

export interface MenuAction {
  key: string // 触发数字/字母键
  label: string
  run(session: EditorSession): void
}

const selection = (s: EditorSession) => s.state.selection.main

/** 用前后标记包裹选区（无选区时插入空标记对） */
function wrap(s: EditorSession, mark: string): void {
  const { from, to } = selection(s)
  const text = s.state.doc.sliceString(from, to)
  s.dispatch({
    changes: { from, to, insert: `${mark}${text}${mark}` },
    selection: { anchor: from + mark.length, head: from + mark.length + text.length },
  })
}

/** 在光标行下方插入块模板 */
function insertBelow(s: EditorSession, block: string): void {
  const head = selection(s).head
  const line = s.state.doc.lineAt(head)
  const insert = `\n${block}\n`
  s.dispatch({
    changes: { from: line.to, insert },
    selection: { anchor: line.to + insert.length },
  })
}

const TABLE_TEMPLATE = ['| 列一 | 列二 | 列三 |', '| --- | --- | --- |', '|  |  |  |'].join('\n')

export const MENU_ACTIONS: MenuAction[] = [
  { key: '1', label: '粗体 **', run: (s) => wrap(s, '**') },
  { key: '2', label: '斜体 *', run: (s) => wrap(s, '*') },
  { key: '3', label: '删除线 ~~', run: (s) => wrap(s, '~~') },
  { key: '4', label: '行内代码 `', run: (s) => wrap(s, '`') },
  { key: '5', label: '插入表格 3×3', run: (s) => insertBelow(s, TABLE_TEMPLATE) },
  { key: '6', label: '插入代码块', run: (s) => insertBelow(s, '```\n\n```') },
  { key: '7', label: '插入分割线', run: (s) => insertBelow(s, '---') },
  { key: '8', label: '任务列表 - [ ] ', run: (s) => wrap(s, '- [ ] ') },
]
