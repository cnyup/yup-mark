import { describe, expect, it } from 'vitest'
import {
  deleteColumn,
  deleteRow,
  insertColumnAfter,
  insertRowAfter,
  setColumnAlign,
  splitRow,
  joinRow,
} from '@renderer/editor/tableOps'

const base = ['| 功能 | 说明 | 备注 |', '| --- | --- | --- |', '| 截图 | save | 保存 |', '| 录屏 | record | 录制 |']

describe('splitRow / joinRow', () => {
  it('标准行往返', () => {
    const parts = splitRow('| a | b |')
    const { lead, cells, tail } = parts
    expect(lead).toBe('|')
    expect(cells).toEqual(['a', 'b'])
    expect(tail).toBe('|')
    expect(joinRow(lead, cells, tail)).toBe('| a | b |')
  })

  it('无尾竖线的行', () => {
    const { cells, tail } = splitRow('| a | b')
    expect(tail).toBe('')
    expect(cells).toEqual(['a', 'b'])
  })

  it('空单元格行', () => {
    const { cells } = splitRow('|  |  |')
    expect(cells).toEqual(['', ''])
  })
})

describe('行操作', () => {
  it('在数据行上方插入空行', () => {
    const out = insertRowAfter(base, 1) // 第一数据行上方 = 分隔行后
    expect(out[2]).toMatch(/^\|\s+\|/)
    expect(out).toHaveLength(5)
    expect(out[3]).toBe(base[2])
  })

  it('删除数据行', () => {
    const out = deleteRow(base, 2)
    expect(out).toEqual(['| 功能 | 说明 | 备注 |', '| --- | --- | --- |', '| 录屏 | record | 录制 |'])
  })

  it('表头/分隔行/最后一行不可删', () => {
    expect(deleteRow(base, 0)).toBeNull()
    expect(deleteRow(base, 1)).toBeNull()
    expect(deleteRow(['| a |', '| --- |', '| b |'], 2)).toBeNull()
  })
})

describe('列操作', () => {
  it('插入列：所有行同步，分隔行补 ---', () => {
    const out = insertColumnAfter(base, 1)
    expect(splitRow(out[0]).cells).toHaveLength(4)
    expect(splitRow(out[1]).cells[2]).toBe('---')
    expect(splitRow(out[2]).cells).toHaveLength(4)
  })

  it('删除列', () => {
    const out = deleteColumn(base, 0)!
    expect(splitRow(out[0]).cells).toEqual(['说明', '备注'])
    expect(out).toHaveLength(4)
  })

  it('仅剩一列不可删', () => {
    expect(deleteColumn(['| a |', '| --- |', '| b |'], 0)).toBeNull()
  })
})

describe('对齐', () => {
  it('写进分隔行对应列', () => {
    const out = setColumnAlign(base, 1, 'center')
    expect(splitRow(out[1]).cells[1]).toBe(':---:')
    expect(out[0]).toBe(base[0])
  })

  it('默认对齐清除冒号', () => {
    const aligned = setColumnAlign(base, 0, 'right')
    expect(splitRow(aligned[1]).cells[0]).toBe('---:')
    expect(splitRow(setColumnAlign(aligned, 0, null)[1]).cells[0]).toBe('---')
  })
})
