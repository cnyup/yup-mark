// TUI 无头预览装配器单测（MT0）：
// 验证 renderPreviewLines 把内核装饰正确映射为 Span 结构（隐藏/mark/line/引用前缀）。
import { describe, expect, it } from 'vitest'
import { renderPreviewLines, previewToPlainText, type Span } from '../src/preview'
import { docState } from '../src/state'

const doc = [
  '# 标题一',
  '',
  '正文 **加粗**、~~删除~~ 与 `code`',
  '',
  '> 引用行',
  '',
  '- 列表一',
].join('\n')

/** 光标在文末：全部块非活跃 → 行级/行内标记隐藏（渲染态） */
function stateAtEnd(): ReturnType<typeof docState> {
  return docState(doc)
}

/** 光标位置不会改变 Markdown 标记的可见性。 */
function stateAt(pos: number): ReturnType<typeof docState> {
  return docState(doc, pos)
}

function plainLine(spans: Span[]): string {
  return spans.map((s) => s.text).join('')
}

describe('renderPreviewLines（无头装配）', () => {
  it('非活跃标题：# 隐藏，文本加粗+着色', () => {
    const lines = renderPreviewLines(stateAtEnd())
    const heading = lines[0]
    expect(plainLine(heading.spans)).toBe('标题一')
    expect(heading.spans[0]).toMatchObject({ text: '标题一', bold: true, color: 'h1' })
  })

  it('非活跃块行内标记隐藏，样式 mark 保留（含 GFM 删除线）', () => {
    const lines = renderPreviewLines(stateAtEnd())
    const para = plainLine(lines[2].spans)
    expect(para).toBe('正文 加粗、删除 与 code')
    const boldSpan = lines[2].spans.find((s) => s.text === '加粗')
    expect(boldSpan?.bold).toBe(true)
    const strikeSpan = lines[2].spans.find((s) => s.text === '删除')
    expect(strikeSpan?.strikethrough).toBe(true)
    const codeSpan = lines[2].spans.find((s) => s.text === 'code')
    expect(codeSpan?.color).toBe('codeInline')
    expect(lines[2].spans.some((s) => s.text.includes('*'))).toBe(false)
    expect(lines[2].spans.some((s) => s.text.includes('~~'))).toBe(false)
  })

  it('引用块：竖线前缀 + 淡显，> 标记隐藏', () => {
    const lines = renderPreviewLines(stateAtEnd())
    const quote = lines[4]
    expect(quote.spans[0]).toMatchObject({ text: '│ ', dim: true })
    expect(plainLine(quote.spans)).toBe('│ 引用行')
  })

  it('光标进入标题：# 仍隐藏，保持渲染态', () => {
    const lines = renderPreviewLines(stateAt(0))
    expect(plainLine(lines[0].spans)).toBe('标题一')
    expect(lines[0].spans.some((s) => s.text.includes('#'))).toBe(false)
  })

  it('previewToPlainText 剥离样式（CI 输出路径）', () => {
    const text = previewToPlainText(renderPreviewLines(stateAtEnd()))
    expect(text.split('\n')[0]).toBe('标题一')
    expect(text).not.toContain('**')
    expect(text).not.toContain('~~')
    expect(text).not.toContain('`code`')
  })

  it('空行产出空 span 列表', () => {
    const lines = renderPreviewLines(stateAtEnd())
    expect(lines[1].spans).toEqual([])
  })
})
