// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorView } from '@codemirror/view'
import { createEditorState } from '@yupmark/live-cm/extensions'
import { adjustListIndent } from '@yupmark/live-cm/engine'
import { adjustListIndentLines, isListLine, renumberOrderedLines } from '@yupmark/live-cm/blockOps'

describe('列表 Tab 升降层级（纯函数）', () => {
  it('isListLine 识别三种列表行', () => {
    expect(isListLine('- a')).toBe(true)
    expect(isListLine('2. b')).toBe(true)
    expect(isListLine('- [x] c')).toBe(true)
    expect(isListLine('# 标题')).toBe(false)
    expect(isListLine('正文')).toBe(false)
  })

  it('升一级：行首加 2 空格', () => {
    expect(adjustListIndentLines(['- a', '  - b'], 1)).toEqual(['  - a', '    - b'])
  })

  it('降一级：去掉 2 空格；0 缩进时整体失败（回落默认行为）', () => {
    expect(adjustListIndentLines(['  - a'], -1)).toEqual(['- a'])
    expect(adjustListIndentLines(['- a', '  - b'], -1)).toBeNull()
  })

  it('非列表行混入 → null', () => {
    expect(adjustListIndentLines(['- a', '正文'], 1)).toBeNull()
    expect(adjustListIndentLines([], 1)).toBeNull()
  })

  it('renumberOrderedLines：同级连续重编号、更深子项不打断父级、只报变化行', () => {
    const changed = renumberOrderedLines(['1. a', '3. b', '  5. c', '2. d'])
    expect(changed.get(1)).toBe('2. b')
    expect(changed.get(2)).toBe('  1. c') // 子项独立成 run，从 1 起
    expect(changed.get(3)).toBe('3. d') // 深缩进子项不打断父级编号，d 接续为 3
    expect(changed.has(0)).toBe(false)
  })

  it('renumberOrderedLines：正文/标题打断编号，空行不打断（宽松列表）', () => {
    const changed = renumberOrderedLines(['1. a', '', '3. b', '正文', '5. c'])
    expect(changed.get(2)).toBe('2. b') // 下标 2 是 '3. b'
    expect(changed.get(4)).toBe('1. c') // 正文之后的 ol 重新从 1 开始
    expect(changed.has(0)).toBe(false)
  })
})

describe('列表 Tab 升降层级（编辑器链路）', () => {
  const setup = (doc: string, anchor: number): { view: EditorView; host: HTMLElement } => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({ state: createEditorState(doc, anchor), parent: host })
    return { view, host }
  }

  it('列表行 Tab → 缩进 2 空格；有序列表兄弟行重编号', () => {
    const doc = '- a\n- b\n- c\n'
    const { view, host } = setup(doc, doc.indexOf('b'))
    expect(adjustListIndent(view, 1)).toBe(true)
    expect(view.state.doc.toString()).toBe('- a\n  - b\n- c\n')
    view.destroy()
    host.remove()
  })

  it('缩进的有序项重新从 1 编号，原兄弟行顺延', () => {
    const doc = '1. a\n2. b\n3. c\n'
    const { view, host } = setup(doc, doc.indexOf('b'))
    adjustListIndent(view, 1)
    expect(view.state.doc.toString()).toBe('1. a\n  1. b\n2. c\n')
    view.destroy()
    host.remove()
  })

  it('Shift-Tab 降级并重编号（10. 宽度变化也在替换内）', () => {
    const doc = '- a\n  - b\n  - c\n'
    const { view, host } = setup(doc, doc.indexOf('c'))
    expect(adjustListIndent(view, -1)).toBe(true)
    expect(view.state.doc.toString()).toBe('- a\n  - b\n- c\n')
    view.destroy()
    host.remove()
  })

  it('0 缩进行 Shift-Tab → 返回 false（文档不变，回落默认）', () => {
    const doc = '- a\n'
    const { view, host } = setup(doc, 1)
    expect(adjustListIndent(view, -1)).toBe(false)
    expect(view.state.doc.toString()).toBe(doc)
    view.destroy()
    host.remove()
  })

  it('正文行 Tab → 返回 false（不接管）', () => {
    const doc = '普通段落\n'
    const { view, host } = setup(doc, 2)
    expect(adjustListIndent(view, 1)).toBe(false)
    view.destroy()
    host.remove()
  })

  it('多行选区整体升降', () => {
    const doc = '- a\n- b\n- c\n'
    const { view, host } = setup(doc, doc.indexOf('a'))
    view.dispatch({ selection: { anchor: doc.indexOf('a'), head: doc.indexOf('c') + 2 } })
    expect(adjustListIndent(view, 1)).toBe(true)
    expect(view.state.doc.toString()).toBe('  - a\n  - b\n  - c\n')
    view.destroy()
    host.remove()
  })
})
