// 表格网格编辑模式单测（MT2 方案 A）：span 模型 / 进入吸附 / 格间导航 / 格内编辑 / 结构操作
import { describe, expect, it } from 'vitest'
import type { Key } from 'ink'
import { EditorSession } from '../src/editor/session'
import { tableAt, cellAt, snapIntoCell } from '../src/editor/table-mode'
import { handleKey } from '../src/editor/keys'
import { snapCursorIntoTable } from '../src/editor/table-keys'

const doc = ['前文', '', '| 甲 | 乙 |', '| --- | ---: |', '| 苹果 | 3 |', '| 香蕉 | 12 |', '', '后文'].join('\n')

const tableFrom = doc.indexOf('| 甲 | 乙 |')

function makeKey(over: Partial<Key> = {}): Key {
  return {
    upArrow: false, downArrow: false, leftArrow: false, rightArrow: false,
    pageDown: false, pageUp: false, home: false, end: false,
    return: false, escape: false, ctrl: false, shift: false, tab: false,
    backspace: false, delete: false, meta: false, super: false, hyper: false,
    capsLock: false, numLock: false, ...over,
  }
}

function makeCtx(height = 24) {
  let goal: number | null = null
  return {
    height,
    get goalColumn() { return goal },
    set goalColumn(v: number | null) { goal = v },
    setGoalColumn(v: number | null) { goal = v },
  }
}

/** 光标放在 (row, col, offset) */
function atCell(row: number, col: number, offset = 0): EditorSession {
  const s = new EditorSession(null, doc, tableFrom)
  const ctx = tableAt(s.state, tableFrom)!
  const span = ctx.cells[row]?.[col]
  const anchor = span ? span.from + offset : tableFrom
  return new EditorSession(null, doc, anchor)
}

describe('tableAt / cellAt（span 模型）', () => {
  it('表格内位置 → 表格上下文', () => {
    const s = new EditorSession(null, doc, 0)
    const ctx = tableAt(s.state, doc.indexOf('苹果') + 1)
    expect(ctx).not.toBeNull()
    expect(ctx!.from).toBe(tableFrom)
    expect(ctx!.cells.length).toBe(3) // 表头 + 2 数据行
    expect(ctx!.cells[0]).toHaveLength(2)
    expect(ctx!.align[1]).toBe('right')
  })

  it('表格外位置 → null', () => {
    const s = new EditorSession(null, doc, 0)
    expect(tableAt(s.state, 0)).toBeNull()
    expect(tableAt(s.state, doc.length)).toBeNull()
  })

  it('cellAt 定位格与格内偏移；管道上 → snapIntoCell 吸附', () => {
    const s = new EditorSession(null, doc, 0)
    const ctx = tableAt(s.state, doc.indexOf('苹果') + 1)!
    const hit = cellAt(ctx, doc.indexOf('苹果') + 1)
    expect(hit).toEqual({ row: 1, col: 0, offset: 1 })
    // 光标在表头行第二根管道符上（| 甲 | 的收尾 |）
    const pipePos = tableFrom + 4
    expect(cellAt(ctx, pipePos)).toBeNull()
    expect(snapIntoCell(ctx, pipePos, false)).toBe(tableFrom + 2) // 最近格文本起点（甲）
  })
})

describe('网格编辑模式键位', () => {
  it('普通移动进入表格 → 吸附到格（snapCursorIntoTable）', () => {
    const s = new EditorSession(null, doc, doc.indexOf('前文'))
    // 下移两行进入表头行首（管道上）
    s.dispatch({ selection: { anchor: tableFrom } })
    snapCursorIntoTable(s)
    const head = s.state.selection.main.head
    expect(cellAt(tableAt(s.state, head)!, head)).toEqual({ row: 0, col: 0, offset: 0 })
  })

  it('Tab 在格间移动，行尾 wrap 到下一行行首', () => {
    const s = atCell(0, 0)
    handleKey(s, '', makeKey({ tab: true }), makeCtx())
    expect(s.state.selection.main.head).toBe(doc.indexOf('乙'))
    handleKey(s, '', makeKey({ tab: true }), makeCtx())
    // 表头末格 → 第一数据行首格
    expect(s.state.selection.main.head).toBe(doc.indexOf('苹果'))
  })

  it('Shift+Tab 反向，行首 wrap 到上一行行尾', () => {
    const s = atCell(1, 0)
    handleKey(s, '', makeKey({ tab: true, shift: true }), makeCtx())
    // (1,0) → 上一行末格 (0,1) 行尾
    expect(s.state.selection.main.head).toBe(doc.indexOf('乙') + 1)
  })

  it('方向键跨行保持列；首行上行 = 跳出表格', () => {
    const s = atCell(1, 0)
    handleKey(s, '', makeKey({ upArrow: true }), makeCtx())
    expect(s.state.selection.main.head).toBe(doc.indexOf('甲'))
    handleKey(s, '', makeKey({ upArrow: true }), makeCtx())
    // 跳出：表头行上行 → 表格上一行（空行）行尾
    const head = s.state.selection.main.head
    expect(head).toBe(3)
    expect(tableAt(s.state, head)).toBeNull()
  })

  it('末行下行 = 跳出表格到紧邻下一行', () => {
    const s = atCell(2, 0)
    handleKey(s, '', makeKey({ downArrow: true }), makeCtx())
    // 表格后是空行（pos 52），再下才是后文
    expect(s.state.selection.main.head).toBe(52)
    expect(tableAt(s.state, s.state.selection.main.head)).toBeNull()
  })

  it('打字插入格内光标处（源码直写，undo 逐字）', () => {
    const s = atCell(1, 0, 2) // "苹果" 后
    handleKey(s, '汁', makeKey(), makeCtx())
    expect(s.doc).toContain('| 苹果汁 | 3 |')
    expect(s.state.selection.main.head).toBe(doc.indexOf('苹果') + 3)
  })

  it('Backspace 删格内前字符；格首 → 上一格行尾', () => {
    const s = atCell(1, 0, 1)
    handleKey(s, '', makeKey({ backspace: true }), makeCtx())
    expect(s.doc).toContain('| 果 | 3 |')
    const s2 = atCell(1, 0, 0)
    handleKey(s2, '', makeKey({ backspace: true }), makeCtx())
    expect(s2.state.selection.main.head).toBe(doc.indexOf('乙') + 1)
  })

  it('Enter 下一行同列；末行 Enter 追加行', () => {
    const s = atCell(1, 0)
    handleKey(s, '', makeKey({ return: true }), makeCtx())
    expect(s.state.selection.main.head).toBe(doc.indexOf('香蕉'))
    const s2 = atCell(2, 0)
    handleKey(s2, '', makeKey({ return: true }), makeCtx())
    expect(s2.doc).toContain('| 香蕉 | 12 |\n|   |   |')
  })
})

describe('结构性操作（Alt 组合，复用 tableOps）', () => {
  it('Alt+R 在下方插入行', () => {
    const s = atCell(1, 0)
    handleKey(s, 'r', makeKey({ meta: true }), makeCtx())
    expect(s.doc).toContain('| 苹果 | 3 |\n|   |   |\n| 香蕉 | 12 |')
    // 锚定回原格
    expect(s.state.selection.main.head).toBe(doc.indexOf('苹果'))
  })

  it('Alt+N 右侧插入列并右移一格', () => {
    const s = atCell(0, 1)
    handleKey(s, 'n', makeKey({ meta: true }), makeCtx())
    expect(s.doc).toContain('| 甲 | 乙 |   |')
    expect(s.doc).toContain('| 苹果 | 3 |   |')
  })

  it('Alt+D 删除当前行（表头不可删）', () => {
    const s = atCell(1, 0)
    handleKey(s, 'd', makeKey({ meta: true }), makeCtx())
    expect(s.doc).not.toContain('苹果')
    const header = atCell(0, 0)
    handleKey(header, 'd', makeKey({ meta: true }), makeCtx())
    expect(header.doc).toContain('甲') // 表头保留
  })

  it('Alt+X 删除当前列', () => {
    const s = atCell(0, 1)
    handleKey(s, 'x', makeKey({ meta: true }), makeCtx())
    expect(s.doc).toContain('| 甲 |')
    expect(s.doc).not.toContain('乙')
  })

  it('Alt+A 循环对齐写入分隔行', () => {
    const s = atCell(0, 0)
    handleKey(s, 'a', makeKey({ meta: true }), makeCtx())
    expect(s.doc).toContain('| :--- | ---: |')
    handleKey(s, 'a', makeKey({ meta: true }), makeCtx())
    expect(s.doc).toContain('| :---: | ---: |')
  })

  it('Alt+T 删除整个表格', () => {
    const s = atCell(1, 0)
    handleKey(s, 't', makeKey({ meta: true }), makeCtx())
    expect(s.doc).not.toContain('苹果')
    expect(tableAt(s.state, s.state.selection.main.head)).toBeNull()
  })

  it('Ctrl+S 在表格内仍触发保存动作', () => {
    const s = atCell(1, 0)
    expect(handleKey(s, 's', makeKey({ ctrl: true }), makeCtx())).toBe('save')
  })
})
