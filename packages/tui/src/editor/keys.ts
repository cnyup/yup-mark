/**
 * 键位翻译层（MT1）：ink useInput → CM6 transaction。
 *
 * D17（Typora 桌面键位映射）的 MT1 子集：
 *   可打印输入/Enter（含列表续写）/Backspace/Delete/Tab/方向键（CJK 码点步进 +
 *   上下行目标列保持）/Home/End/PgUp/PgDn/Ctrl+Home/End/Ctrl+左右词跳/
 *   Shift+方向选择/Ctrl+S 保存/Ctrl+Q 退出/Esc 收选区。
 * 样式快捷键（Ctrl+B/I…）与视图三件套进 MT3。
 */
import type { Key } from 'ink'
import type { EditorSession } from './session'
import { colToIndex, indexToCol, stepBack, stepForward } from './measure'

export interface KeyContext {
  /** 编辑区高度（视觉行数），PgUp/PgDn 用 */
  height: number
  /** 上下移动的目标视觉列；水平移动后置 null */
  goalColumn: number | null
  setGoalColumn(col: number | null): void
}

export type KeyAction = 'none' | 'save' | 'exit'

/** 列表续写：返回新行前缀；空列表项返回 ''（退出列表，Typora 行为）；非列表返回 null */
export function continueListPrefix(lineText: string): string | null {
  const m = /^(\s*)([-*+]|\d+[.)])(\s+)(?:\[([ xX])\]\s+)?(.*)$/.exec(lineText)
  if (!m) return null
  const [, indent, marker, spacing, task, rest] = m
  if (rest === '') return '' // 仅符号无内容 → 退出列表
  let nextMarker = marker
  const ord = /^(\d+)([.)])$/.exec(marker)
  if (ord) nextMarker = `${Number(ord[1]) + 1}${ord[2]}`
  return `${indent}${nextMarker}${spacing}${task !== undefined ? '[ ] ' : ''}`
}

function moveTo(session: EditorSession, head: number, extend: boolean): void {
  const { doc } = session.state
  const pos = Math.max(0, Math.min(doc.length, head))
  const anchor = extend ? session.state.selection.main.anchor : pos
  session.dispatch({ selection: { anchor, head: pos } })
}

/** 上/下一行，保持目标视觉列（CJK 宽度感知） */
function moveVertical(session: EditorSession, dir: -1 | 1, ctx: KeyContext, extend: boolean): void {
  const { doc, selection } = session.state
  const line = doc.lineAt(selection.main.head)
  const cursorIdx = selection.main.head - line.from
  const goal = ctx.goalColumn ?? indexToCol(line.text, cursorIdx)
  ctx.setGoalColumn(goal)
  const targetNo = line.number + dir
  if (targetNo < 1 || targetNo > doc.lines) {
    // 首行上移/末行下移：贴边界
    moveTo(session, dir < 0 ? 0 : doc.length, extend)
    return
  }
  const target = doc.line(targetNo)
  const idx = colToIndex(target.text, goal)
  moveTo(session, target.from + idx, extend)
}

function deleteSelectionOr(session: EditorSession, fn: (from: number, to: number) => void): void {
  const { from, to } = session.state.selection.main
  if (from !== to) {
    session.dispatch({ changes: { from, to } })
    return
  }
  fn(from, to)
}

function deleteCharBefore(session: EditorSession): void {
  const { doc, selection } = session.state
  const head = selection.main.head
  if (head === 0) return
  const line = doc.lineAt(head)
  if (head === line.from) {
    // 行首：与上一行合并（删除换行符）
    session.dispatch({ changes: { from: head - 1, to: head } })
    return
  }
  const start = stepBack(line.text, head - line.from) + line.from
  session.dispatch({ changes: { from: start, to: head } })
}

function deleteCharAfter(session: EditorSession): void {
  const { doc, selection } = session.state
  const head = selection.main.head
  if (head >= doc.length) return
  const line = doc.lineAt(head)
  const end = stepForward(line.text, head - line.from) + line.from
  session.dispatch({ changes: { from: head, to: Math.min(end, doc.length) } })
}

/** Ctrl+左右：按词跳（空白与词字符的边界） */
function wordStep(lineText: string, idx: number, dir: -1 | 1): number {
  const isWord = (ch: string): boolean => /\S/.test(ch)
  let i = idx
  if (dir < 0) {
    while (i > 0 && !isWord(lineText[i - 1])) i--
    while (i > 0 && isWord(lineText[i - 1])) i--
  } else {
    while (i < lineText.length && !isWord(lineText[i])) i++
    while (i < lineText.length && isWord(lineText[i])) i++
  }
  return i
}

/** 主入口：返回需要壳层执行的动作（保存/退出） */
export function handleKey(session: EditorSession, input: string, key: Key, ctx: KeyContext): KeyAction {
  const { doc, selection } = session.state
  const main = selection.main
  const line = doc.lineAt(main.head)

  if (key.ctrl) {
    switch (input) {
      case 's':
        return 'save'
      case 'q':
        return 'exit'
      case 'left':
        moveTo(session, line.from + wordStep(line.text, main.head - line.from, -1), key.shift)
        return 'none'
      case 'right':
        moveTo(session, line.from + wordStep(line.text, main.head - line.from, 1), key.shift)
        return 'none'
      case 'home':
        moveTo(session, 0, key.shift)
        return 'none'
      case 'end':
        moveTo(session, doc.length, key.shift)
        return 'none'
      default:
        return 'none' // Ctrl+C 由 ink exitOnCtrlC 处理；其余 Ctrl 组合 MT3 再接入
    }
  }

  if (key.return) {
    const prefix = continueListPrefix(line.text)
    if (prefix === '') {
      // 空列表项回车：整行仅剩符号 → 清空该行（列表退出，Typora 行为）
      session.dispatch({
        changes: { from: line.from, to: line.to, insert: '' },
        selection: { anchor: line.from },
      })
      return 'none'
    }
    const insert = prefix === null ? '\n' : `\n${prefix}`
    session.dispatch({
      changes: { from: main.head, insert },
      selection: { anchor: main.head + insert.length },
    })
    return 'none'
  }

  if (key.backspace) {
    deleteSelectionOr(session, () => deleteCharBefore(session))
    return 'none'
  }
  if (key.delete) {
    deleteSelectionOr(session, () => deleteCharAfter(session))
    return 'none'
  }
  if (key.tab) {
    session.dispatch({ changes: { from: main.head, insert: '  ' }, selection: { anchor: main.head + 2 } })
    return 'none'
  }

  if (key.leftArrow) {
    ctx.setGoalColumn(null)
    const idx = main.head - line.from
    moveTo(session, main.head === line.from && line.number > 1 ? line.from - 1 : line.from + stepBack(line.text, idx), key.shift)
    return 'none'
  }
  if (key.rightArrow) {
    ctx.setGoalColumn(null)
    const idx = main.head - line.from
    moveTo(session, main.head === line.to && line.number < doc.lines ? line.to + 1 : line.from + stepForward(line.text, idx), key.shift)
    return 'none'
  }
  if (key.upArrow) {
    moveVertical(session, -1, ctx, key.shift)
    return 'none'
  }
  if (key.downArrow) {
    moveVertical(session, 1, ctx, key.shift)
    return 'none'
  }
  if (key.home) {
    moveTo(session, line.from, key.shift)
    return 'none'
  }
  if (key.end) {
    moveTo(session, line.to, key.shift)
    return 'none'
  }
  if (key.pageUp || key.pageDown) {
    const step = ctx.height - 2
    const targetNo = Math.max(1, Math.min(doc.lines, line.number + (key.pageDown ? step : -step)))
    const target = doc.line(targetNo)
    const goal = ctx.goalColumn ?? indexToCol(line.text, main.head - line.from)
    ctx.setGoalColumn(goal)
    moveTo(session, target.from + colToIndex(target.text, goal), key.shift)
    return 'none'
  }
  if (key.escape) {
    session.dispatch({ selection: { anchor: main.head } })
    return 'none'
  }

  // 可打印输入（含多字符粘贴整串）
  if (input.length > 0) {
    const insert = input
    const from = main.from
    const to = main.to
    session.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
    })
  }
  return 'none'
}
