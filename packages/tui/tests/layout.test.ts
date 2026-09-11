// 视口布局装配单测（MT1）：widget 终端形态、光标反色、CJK 软换行
import { describe, expect, it } from 'vitest'
import { docState } from '../src/state'
import { layoutViewport } from '../src/editor/layout'

const doc = ['# 标题', '', '- 列表项', '- [x] 已完成', '- [ ] 待办', '', '> 引用行', '', '很长的中文行'.repeat(10)].join('\n')

function layoutOf(anchor: number, width = 40, height = 10, firstLine = 1) {
  return layoutViewport(docState(doc, anchor), { width, height, firstLine, cursorPos: anchor })
}

function rowText(row: { segments: { text: string }[] }): string {
  return row.segments.map((s) => s.text).join('')
}

describe('layoutViewport', () => {
  it('列表圆点与任务复选框渲染为终端形态（TUI.md §5）', () => {
    const { rows } = layoutOf(doc.length)
    expect(rowText(rows[2])).toBe('• 列表项 ')
    expect(rowText(rows[3])).toBe('◉ 已完成 ')
    expect(rowText(rows[4])).toBe('○ 待办 ')
  })

  it('光标所在行：标记淡显而非隐藏（渲染态语义）', () => {
    const anchor = doc.indexOf('# 标题')
    const { rows } = layoutOf(anchor)
    expect(rowText(rows[0])).toContain('#')
  })

  it('光标格反色 + 视口坐标', () => {
    const anchor = doc.indexOf('列表项') + 1 // '列' 后
    const { rows, cursor } = layoutOf(anchor)
    expect(cursor).not.toBeNull()
    const seg = rows[cursor!.y].segments.find((s) => s.style.inverse)
    expect(seg?.text).toBe('表') // '列' 后一格是 '表'
  })

  it('EOL 光标落在行尾虚拟空格', () => {
    const anchor = doc.indexOf('已完成') + '已完成'.length
    const { cursor, rows } = layoutOf(anchor)
    expect(cursor).not.toBeNull()
    expect(rows[cursor!.y].segments.some((s) => s.style.inverse)).toBe(true)
  })

  it('软换行：超宽中文行按显示宽度折行且不切半宽字符', () => {
    const longLineFrom = doc.indexOf('很长的中文行')
    const { rows } = layoutOf(longLineFrom, 20, 10)
    // 每视觉行显示宽度 ≤ 20
    const texts = rows.map(rowText).filter((t) => t.includes('很') || t.includes('文行') || t.length > 0)
    expect(texts.length).toBeGreaterThan(0)
    const width = (s: string): number => Array.from(s).reduce((acc, ch) => acc + (ch.charCodeAt(0) > 0xff ? 2 : 1), 0)
    for (const t of texts) expect(width(t)).toBeLessThanOrEqual(20)
  })

  it('补齐到固定高度（短文档）', () => {
    const { rows } = layoutOf(0, 40, 10)
    expect(rows.length).toBe(10)
  })
})
