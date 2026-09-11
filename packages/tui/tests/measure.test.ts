// CJK 视觉度量单测（MT1，TUI.md RT3）
import { describe, expect, it } from 'vitest'
import { charWidth, colToIndex, indexToCol, stepBack, stepForward, wrapCells, type Cell } from '../src/editor/measure'

const cells = (text: string): Cell[] =>
  Array.from(text).map((ch) => ({ ch, w: charWidth(ch) }))

describe('宽度计算', () => {
  it('ASCII=1，中文=2，emoji=2', () => {
    expect(charWidth('a')).toBe(1)
    expect(charWidth('中')).toBe(2)
    expect(charWidth('👍')).toBe(2)
  })
})

describe('index ↔ 列（视觉）换算', () => {
  it('混合文本 indexToCol', () => {
    // 'a中b' → 列: a=0, 中=1..2, b=3
    expect(indexToCol('a中b', 0)).toBe(0)
    expect(indexToCol('a中b', 1)).toBe(1)
    expect(indexToCol('a中b', 2)).toBe(3)
    expect(indexToCol('a中b', 3)).toBe(4) // 行尾
  })

  it('colToIndex 与 indexToCol 互逆（CJK 对齐点）', () => {
    const text = '中文abc混合'
    for (const idx of [0, 1, 2, 3, 4, 5, 6]) {
      expect(colToIndex(text, indexToCol(text, idx))).toBe(idx)
    }
  })

  it('colToIndex 半宽列落在宽字符前', () => {
    expect(colToIndex('中文', 1)).toBe(0)
    expect(colToIndex('中文', 2)).toBe(1)
  })
})

describe('码点步进', () => {
  it('不劈开代理对', () => {
    const text = 'a👍b'
    expect(stepForward(text, 1)).toBe(3)
    expect(stepBack(text, 3)).toBe(1)
  })
})

describe('贪心软换行', () => {
  it('按显示宽度折行，宽字符不切半', () => {
    const rows = wrapCells(cells('中文ab中文'), 6)
    expect(rows.map((r) => r.width)).toEqual([6, 4]) // 中文ab | 中文
  })

  it('宽度 4 时中文一个字符也放不下则独占一行（不丢字符）', () => {
    const rows = wrapCells(cells('中中'), 2)
    expect(rows.map((r) => r.width)).toEqual([2, 2])
  })

  it('空 cells 产出一行空行', () => {
    expect(wrapCells([], 10)).toEqual([{ start: 0, end: 0, width: 0 }])
  })
})
