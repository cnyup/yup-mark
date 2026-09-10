import { describe, expect, it } from 'vitest'
import { createEditorState } from '@renderer/editor/extensions'
import { activeOutlineItem, extractOutline } from '@renderer/editor/outline'

describe('extractOutline 大纲提取', () => {
  const doc = ['# One', '', 'text', '', '## Two', '', '### Three', '', '普通段落', '', 'Setext H1', '=====', '', 'end'].join('\n')

  it('按层级抽取标题', () => {
    const items = extractOutline(createEditorState(doc))
    expect(items.map((i) => i.level)).toEqual([1, 2, 3, 1])
    expect(items.map((i) => i.text)).toEqual(['One', 'Two', 'Three', 'Setext H1'])
  })

  it('标题文本剥离 # 符号', () => {
    const items = extractOutline(createEditorState('##  标题  ##\n'))
    expect(items[0]?.text).toBe('标题')
  })

  it('activeOutlineItem 定位光标所在章节', () => {
    const items = extractOutline(createEditorState(doc))
    const posOf = (s: string) => doc.indexOf(s)
    expect(activeOutlineItem(items, posOf('text'))?.text).toBe('One')
    // 光标落在 ### Three 自身的文本里 → 该标题即当前章节
    expect(activeOutlineItem(items, posOf('Three'))?.text).toBe('Three')
    expect(activeOutlineItem(items, 0)?.text).toBe('One')
    expect(activeOutlineItem(items, posOf('end'))?.text).toBe('Setext H1')
  })
})

describe('大纲覆盖完整文档（懒解析回归）', () => {
  it('长文档尾部的标题也进入大纲', () => {
    const body = Array.from({ length: 150 }, (_, i) => `这是第 ${i} 段的正文内容，用来把文档撑长。`).join('\n\n')
    const doc = `# 文档标题\n\n${body}\n\n## 尾部章节\n\n结尾正文`
    const items = extractOutline(createEditorState(doc))
    expect(items.map((i) => i.text)).toContain('文档标题')
    expect(items.map((i) => i.text)).toContain('尾部章节')
  })
})
