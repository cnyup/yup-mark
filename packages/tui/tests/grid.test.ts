// TUI widget 渲染器单测（MT2）：表格网格 / 占位框 / mermaid 信息
import { describe, expect, it } from 'vitest'
import type { RenderSegment } from '../src/preview'
import { renderTableGrid, renderTableGridFromSource, renderPlaceholder, renderHr, mermaidInfo } from '../src/editor/grid'
import { textWidth } from '../src/editor/measure'

/** RenderSegment[][]（行 → 段）→ 纯文本行 */
const rowsText = (rows: RenderSegment[][]): string[] => rows.map((r) => r.map((s) => s.text).join(''))

describe('renderTableGrid', () => {
  const table = {
    align: ['left' as const, 'center' as const, 'right' as const],
    header: ['名称', '数量', '单价'],
    rows: [
      ['苹果', '3', '5.5'],
      ['香蕉 Banana Very Long', '12', '2.0'],
    ],
  }

  it('产出 box 边框与表头/数据行', () => {
    const rows = rowsText(renderTableGrid(table, { width: 60 }).rows)
    expect(rows[0]).toMatch(/^┌─*┬─*┬─*┐$/)
    expect(rows[1]).toContain('名称')
    expect(rows[1]).toContain('单价')
    expect(rows[2]).toMatch(/^├─*┼─*┼─*┤$/)
    expect(rows[3]).toContain('苹果')
    expect(rows[4]).toContain('香蕉')
    expect(rows[5]).toMatch(/^└─*┴─*┴─*┘$/)
    expect(rows).toHaveLength(6)
  })

  it('对齐生效：right 列数字右贴', () => {
    const rows = rowsText(renderTableGrid(table, { width: 60 }).rows)
    const dataLine = rows[3]
    // '5.5' 右对齐 → 前面有空格填充
    expect(/ +5\.5 │$/.test(dataLine)).toBe(true)
  })

  it('超宽列截断（显示宽度不超限）', () => {
    const rows = rowsText(renderTableGrid(table, { width: 30 }).rows)
    expect(rows.every((r) => textWidth(r) <= 30)).toBe(true)
    expect(rows[4]).toContain('…')
  })
})

describe('renderTableGridFromSource', () => {
  it('解析 markdown 表格源 → 网格', () => {
    const src = ['| a | b |', '| --- | ---: |', '| 1 | 2 |'].join('\n')
    const rows = renderTableGridFromSource(src, { width: 40 })
    expect(rows).not.toBeNull()
    expect(rowsText(rows!.rows)[1]).toContain('a')
  })

  it('非表格源返回 null（降级源码）', () => {
    expect(renderTableGridFromSource('普通段落', { width: 40 })).toBeNull()
  })
})

describe('mermaidInfo / 占位框', () => {
  it('图类型中文名 + 规模', () => {
    expect(mermaidInfo('flowchart TD\n  A-->B\n  B-->C').type).toBe('流程图')
    expect(mermaidInfo('sequenceDiagram\n  A->>B: hi').type).toBe('时序图')
    expect(mermaidInfo('pie\n  "a": 1').type).toBe('饼图')
    expect(mermaidInfo('flowchart TD\n  A-->B').scale).toBe('2 行')
  })

  it('占位框渲染包含图标与信息', () => {
    const segs = renderPlaceholder('▶', 'mermaid · 流程图 · 2 行', 40)
    const text = segs.map((s) => s.text).join('')
    expect(text).toContain('▶ mermaid · 流程图 · 2 行')
    expect(text).toMatch(/^─.*─$/)
  })

  it('HR 全宽线', () => {
    const text = renderHr(40).map((s) => s.text).join('')
    expect(text).toBe('─'.repeat(38))
  })
})
