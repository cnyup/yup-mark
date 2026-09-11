/**
 * 表格网格编辑模式的键位路由（MT2 方案 A）。
 *
 * 模型（见 table-mode.ts）：文档光标 = 单元格内插入符。
 * 打字/删除直接作用于源码光标处（undo 逐字、无需整表重写）；
 * 跨格移动在格 span 之间跳；结构性操作（行列增删/对齐/删表）
 * 复用内核 tableOps 整表重写后重新锚定格光标。
 *
 * 底部上下文栏（app.tsx）：Alt+R 加行 · Alt+N 加列 · Alt+D 删行 ·
 * Alt+X 删列 · Alt+A 对齐 · Alt+T 删表。
 */
import type { Key } from 'ink'
import type { EditorSession } from './session'
import type { KeyContext } from './keys'
import { tableAt, cellAt, snapIntoCell, type TableContext } from './table-mode'
import {
  insertRowAfter,
  deleteRow,
  insertColumnAfter,
  deleteColumn,
  setColumnAlign,
} from '@yupmark/live-cm/tableOps'

/** 网格行 → tableOps lines 下标（[0]=表头 [1]=分隔 [2..]=数据） */
function lineIndexOfRow(row: number): number {
  return row === 0 ? 0 : row + 1
}

function tableAtSafe(session: EditorSession, pos: number): TableContext | null {
  try {
    return tableAt(session.state, pos)
  } catch {
    return null
  }
}

/** 光标落入表格但不在格文本上（管道/空隙）→ 吸附到最近格起点 */
export function snapCursorIntoTable(session: EditorSession): void {
  const head = session.state.selection.main.head
  const ctx = tableAtSafe(session, head)
  if (ctx === null) return
  if (cellAt(ctx, head) === null) {
    const snapped = snapIntoCell(ctx, head, false)
    session.dispatch({ selection: { anchor: snapped } })
  }
}

/** 格文本（从 span 区间切源码） */
function spanText(table: TableContext, from: number, to: number): string {
  const src = table.lines.join('\n')
  return src.slice(from - table.from, to - table.from)
}

/** 当前格（保证在格内：不在则按吸附后的位置算） */
function currentCell(
  table: TableContext,
  head: number,
): { row: number; col: number; offset: number; spanFrom: number; spanTo: number } {
  let hit = cellAt(table, head)
  if (hit === null) {
    const snapped = snapIntoCell(table, head, false)
    hit = cellAt(table, snapped) ?? { row: 0, col: 0, offset: 0 }
  }
  const span = table.cells[hit.row]?.[hit.col]
  return {
    ...hit,
    spanFrom: span?.from ?? table.from,
    spanTo: span?.to ?? table.from,
  }
}

/** 移动光标到指定格（offset 贴格文本；越界行列与偏移自动夹取） */
function gotoCell(
  session: EditorSession,
  table: TableContext,
  row: number,
  col: number,
  offset?: number,
): void {
  const r = Math.max(0, Math.min(row, table.cells.length - 1))
  const spans = table.cells[r] ?? []
  const c = Math.max(0, Math.min(col, spans.length - 1))
  const span = spans[c]
  if (span === undefined) return
  const pos = span.from + Math.max(0, Math.min(offset ?? 0, span.to - span.from))
  session.dispatch({ selection: { anchor: pos } })
}

/** 跳出表格（dir<0 上 / dir>0 下） */
function exitTable(session: EditorSession, table: TableContext, dir: -1 | 1): void {
  const doc = session.state.doc
  if (dir < 0) {
    const startLine = doc.lineAt(table.from)
    if (startLine.number > 1) {
      const prev = doc.line(startLine.number - 1)
      session.dispatch({ selection: { anchor: prev.to } })
    } else {
      session.dispatch({ selection: { anchor: 0 } })
    }
  } else {
    const endLine = doc.lineAt(table.to)
    if (endLine.number < doc.lines) {
      const next = doc.line(endLine.number + 1)
      session.dispatch({ selection: { anchor: next.from } })
    } else {
      session.dispatch({ selection: { anchor: doc.length } })
    }
  }
}

/** 结构性操作：整表重写（tableOps）+ 锚定回原网格坐标 */
function applyOp(
  session: EditorSession,
  table: TableContext,
  newLines: string[],
  anchorRow: number,
  anchorCol: number,
): void {
  const insert = newLines.join('\n')
  session.dispatch({
    changes: { from: table.from, to: table.to, insert },
    selection: { anchor: table.from },
  })
  const next = tableAtSafe(session, table.from)
  if (next !== null) gotoCell(session, next, anchorRow, anchorCol, 0)
}

/** 码点步进（与 measure.stepBack/stepForward 同义，格文本域内） */
function stepBackIn(text: string, i: number): number {
  if (i <= 0) return 0
  const prev = text.charCodeAt(i - 1)
  if (prev >= 0xdc00 && prev <= 0xdfff) return i - 2
  return i - 1
}
function stepForwardIn(text: string, i: number): number {
  if (i >= text.length) return text.length
  const cp = text.codePointAt(i) ?? text.charCodeAt(i)
  return cp > 0xffff ? i + 2 : i + 1
}

/**
 * 表格键处理。'none' = 已消费；null = 非表格场景键，回落普通处理。
 */
export function handleTableKey(
  session: EditorSession,
  input: string,
  key: Key,
  table: TableContext,
  kctx: KeyContext,
): 'none' | null {
  const head = session.state.selection.main.head
  const cur = currentCell(table, head)
  const text = spanText(table, cur.spanFrom, cur.spanTo)
  const lastRow = table.cells.length - 1
  const lastCol = (table.cells[cur.row] ?? []).length - 1
  const move = (target: number): void => {
    session.dispatch({ selection: { anchor: target } })
  }

  if (key.meta) {
    switch (input) {
      case 'r':
        applyOp(session, table, insertRowAfter(table.lines, lineIndexOfRow(cur.row)), cur.row, cur.col)
        return 'none'
      case 'n':
        applyOp(session, table, insertColumnAfter(table.lines, cur.col), cur.row, cur.col + 1)
        return 'none'
      case 'd': {
        const next = deleteRow(table.lines, lineIndexOfRow(cur.row))
        if (next !== null) applyOp(session, table, next, Math.max(0, cur.row - 1), cur.col)
        return 'none'
      }
      case 'x': {
        const next = deleteColumn(table.lines, cur.col)
        if (next !== null) applyOp(session, table, next, cur.row, Math.max(0, cur.col - 1))
        return 'none'
      }
      case 'a': {
        const cycle: Array<'left' | 'center' | 'right' | null> = [null, 'left', 'center', 'right']
        const next = cycle[(cycle.indexOf(table.align[cur.col] ?? null) + 1) % cycle.length] ?? null
        applyOp(session, table, setColumnAlign(table.lines, cur.col, next), cur.row, cur.col)
        return 'none'
      }
      case 't':
        session.dispatch({
          changes: { from: table.from, to: table.to, insert: '' },
          selection: { anchor: Math.max(0, table.from - 1) },
        })
        return 'none'
      default:
        return null
    }
  }

  if (key.return) {
    if (cur.row < lastRow) gotoCell(session, table, cur.row + 1, cur.col)
    else applyOp(session, table, insertRowAfter(table.lines, lineIndexOfRow(cur.row)), cur.row + 1, cur.col)
    return 'none'
  }

  if (key.tab) {
    if (key.shift) {
      if (cur.row === 0 && cur.col === 0) exitTable(session, table, -1)
      else if (cur.col > 0) gotoCell(session, table, cur.row, cur.col - 1, Number.MAX_SAFE_INTEGER)
      else gotoCell(session, table, cur.row - 1, lastCol, Number.MAX_SAFE_INTEGER)
    } else if (cur.row === lastRow && cur.col === lastCol) {
      applyOp(session, table, insertRowAfter(table.lines, lineIndexOfRow(cur.row)), cur.row + 1, 0)
    } else if (cur.col < lastCol) {
      gotoCell(session, table, cur.row, cur.col + 1)
    } else {
      gotoCell(session, table, cur.row + 1, 0)
    }
    return 'none'
  }

  if (key.backspace) {
    if (cur.offset > 0) {
      const start = cur.spanFrom + stepBackIn(text, cur.offset)
      session.dispatch({ changes: { from: start, to: cur.spanFrom + cur.offset } })
    } else if (cur.col > 0) {
      gotoCell(session, table, cur.row, cur.col - 1, Number.MAX_SAFE_INTEGER)
    } else if (cur.row > 0) {
      gotoCell(session, table, cur.row - 1, lastCol, Number.MAX_SAFE_INTEGER)
    }
    return 'none'
  }

  if (key.delete) {
    if (cur.offset < text.length) {
      const end = cur.spanFrom + stepForwardIn(text, cur.offset)
      session.dispatch({ changes: { from: cur.spanFrom + cur.offset, to: end } })
    } else if (cur.col < lastCol) {
      gotoCell(session, table, cur.row, cur.col + 1)
    } else if (cur.row < lastRow) {
      gotoCell(session, table, cur.row + 1, 0)
    }
    return 'none'
  }

  if (key.leftArrow) {
    if (cur.offset > 0) move(cur.spanFrom + stepBackIn(text, cur.offset))
    else if (cur.col > 0) gotoCell(session, table, cur.row, cur.col - 1, Number.MAX_SAFE_INTEGER)
    else if (cur.row > 0) gotoCell(session, table, cur.row - 1, lastCol, Number.MAX_SAFE_INTEGER)
    return 'none'
  }
  if (key.rightArrow) {
    if (cur.offset < text.length) move(cur.spanFrom + stepForwardIn(text, cur.offset))
    else if (cur.col < lastCol) gotoCell(session, table, cur.row, cur.col + 1)
    else if (cur.row < lastRow) gotoCell(session, table, cur.row + 1, 0)
    return 'none'
  }
  if (key.upArrow) {
    if (cur.row > 0) gotoCell(session, table, cur.row - 1, cur.col, cur.offset)
    else exitTable(session, table, -1)
    return 'none'
  }
  if (key.downArrow) {
    if (cur.row < lastRow) gotoCell(session, table, cur.row + 1, cur.col, cur.offset)
    else exitTable(session, table, 1)
    return 'none'
  }

  if (key.home) {
    move(cur.spanFrom)
    return 'none'
  }
  if (key.end) {
    move(cur.spanTo)
    return 'none'
  }
  if (key.escape) {
    move(head)
    return 'none'
  }
  if (key.pageUp || key.pageDown) {
    const step = Math.max(1, kctx.height - 2)
    const target = cur.row + (key.pageDown ? step : -step)
    if (target < 0) exitTable(session, table, -1)
    else if (target > lastRow) exitTable(session, table, 1)
    else gotoCell(session, table, target, cur.col, cur.offset)
    return 'none'
  }

  // 可打印输入（粘贴的换行压成空格，保持表格结构）
  if (input.length > 0 && !key.ctrl) {
    const insert = input.replace(/\r?\n/g, ' ')
    session.dispatch({
      changes: { from: head, insert },
      selection: { anchor: head + insert.length },
    })
    return 'none'
  }

  return null
}
