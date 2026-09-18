// 视口布局装配单测（MT1）：widget 终端形态、光标坐标、CJK 软换行
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

  it('光标所在标题行：标记保持隐藏（Typora 式渲染态）', () => {
    const anchor = doc.indexOf('# 标题')
    const { rows } = layoutOf(anchor)
    expect(rowText(rows[0])).not.toContain('#')
    expect(rowText(rows[0])).toContain('标题')
  })

  it('光标落在隐藏标题标记内：坐标吸附到可见标题文本', () => {
    const anchor = doc.indexOf('# 标题') + 1
    const { rows, cursor } = layoutOf(anchor)
    expect(cursor).not.toBeNull()
    expect(rowText(rows[0])).not.toContain('#')
    expect(cursor).toMatchObject({ x: 0, y: 0 })
  })

  it('光标坐标对应下一个可编辑字符', () => {
    const anchor = doc.indexOf('列表项') + 1 // '列' 后
    const { rows, cursor } = layoutOf(anchor)
    expect(cursor).not.toBeNull()
    expect(rowText(rows[cursor!.y])).toContain('列表项')
    expect(cursor!.x).toBe(4) // Bullet + space 占 2 列，中文“列”占 2 列
  })

  it('EOL 光标落在行尾虚拟空格位置', () => {
    const anchor = doc.indexOf('已完成') + '已完成'.length
    const { cursor, rows } = layoutOf(anchor)
    expect(cursor).not.toBeNull()
    expect(rowText(rows[cursor!.y])).toContain('已完成')
    expect(cursor!.x).toBe(8) // Checkbox + space 占 2 列，三个中文字符占 6 列
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
