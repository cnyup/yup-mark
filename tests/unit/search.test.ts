// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorView } from '@codemirror/view'
import { SearchQuery, setSearchQuery } from '@codemirror/search'
import { createEditorState } from '@yupmark/live-cm/extensions'

describe('查找替换（CM6 search 与实时渲染共存）', () => {
  const setup = (doc: string, anchor: number): { view: EditorView; host: HTMLElement } => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({ state: createEditorState(doc, anchor), parent: host })
    return { view, host }
  }

  it('⌘F 面板打开（查找 + 替换双输入框），命中定位进渲染态块内', async () => {
    const doc = '前文\n\n**hello** 世界\n\n正文 hello 结尾\n'
    const { view, host } = setup(doc, 2)
    const { openSearchPanel, findNext } = await import('@codemirror/search')
    expect(openSearchPanel(view)).toBe(true)
    const panel = host.querySelector('.cm-panel.cm-search') as HTMLElement
    expect(panel).not.toBeNull()
    expect(panel.querySelectorAll('input').length).toBeGreaterThanOrEqual(2)

    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: 'hello' })) })
    await new Promise((r) => setTimeout(r, 50))
    expect(findNext(view)).toBe(true)
    const sel = view.state.selection.main
    expect(doc.slice(sel.from, sel.to)).toBe('hello')
    // 与实时渲染共存：命中所在的渲染块保持渲染态——粗体样式生效、
    // `**` 标记不因选区落入而淡显/显源（统一渲染策略）
    const hitLine = host.querySelectorAll('.cm-line')[2] as HTMLElement
    expect(hitLine.querySelector('.cm-strong')).not.toBeNull()
    expect(hitLine.querySelector('.cm-mark-dim')).toBeNull()
    view.destroy()
    host.remove()
  })

  it('findNext 从文档头跳到渲染态块内的命中位置', async () => {
    const doc = '标题\n\n## 二级 hello\n'
    const { view, host } = setup(doc, 0)
    view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ search: 'hello' })),
    })
    await new Promise((r) => setTimeout(r, 50))
    // 模拟 ⌘F 面板的下一个：直接用面板命令的等价状态推进
    const { findNext } = await import('@codemirror/search')
    expect(findNext(view)).toBe(true)
    const sel = view.state.selection.main
    expect(doc.slice(sel.from, sel.to)).toBe('hello')
    view.destroy()
    host.remove()
  })

  it('替换：replaceAll 对含隐藏语法的块同样生效', async () => {
    const doc = '**foo** 和 foo\n'
    const { view, host } = setup(doc, 1)
    const { replaceAll } = await import('@codemirror/search')
    view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ search: 'foo', replace: 'bar' })),
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(replaceAll(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('**bar** 和 bar\n')
    view.destroy()
    host.remove()
  })
})
