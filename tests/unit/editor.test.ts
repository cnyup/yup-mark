import { describe, expect, it } from 'vitest'
import { syntaxTree } from '@codemirror/language'
import { createEditorState } from '@yupmark/live-cm/extensions'

describe('editor state (lang-markdown 接线验证)', () => {
  it('解析 ATX 标题节点', () => {
    const state = createEditorState('# Hello\n\n**bold**')
    const first = syntaxTree(state).topNode.firstChild
    expect(first?.name).toBe('ATXHeading1')
  })

  it('GFM 表格语法可用', () => {
    const state = createEditorState('| a | b |\n| --- | --- |\n| 1 | 2 |')
    const names: string[] = []
    syntaxTree(state).iterate({
      enter: (node) => {
        names.push(node.name)
      },
    })
    expect(names).toContain('Table')
  })

  it('空文档可正常创建', () => {
    const state = createEditorState('')
    expect(state.doc.toString()).toBe('')
    expect(state.doc.lines).toBe(1)
  })
})
