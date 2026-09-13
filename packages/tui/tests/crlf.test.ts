// CRLF 行尾安全（Windows CI 检出 CRLF 文件曾致 docState anchor 越界崩溃）
import { describe, expect, it } from 'vitest'
import { docState } from '../src/state'
import { renderMermaidSequence } from '../src/mermaid-sequence'

describe('CRLF 行尾安全', () => {
  it('docState 归一化 CRLF：anchor 不越界且为文末', () => {
    const s = docState('a\r\nb\r\nc', 7) // 原始长度 7；归一化后 5
    expect(s.doc.toString()).toBe('a\nb\nc')
    expect(s.selection.main.head).toBe(5)
  })

  it('超长 anchor 被钳制（永不触发 Selection outside of document）', () => {
    const s = docState('abc', 99999)
    expect(s.selection.main.head).toBe(3)
  })

  it('CRLF 源码的 mermaid 块照常渲染（块解析不受 \r 污染）', () => {
    const rows = renderMermaidSequence('sequenceDiagram\r\nA->>B: hi\r\n', 60)
    expect(rows).not.toBeNull()
    expect(rows!.some((r) => r.some((seg) => seg.text.includes('hi')))).toBe(true)
  })
})
