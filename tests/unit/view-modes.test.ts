// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { baseExtensions } from '@renderer/editor/extensions'
import {
  focusModeField,
  setFocusMode,
  setSourceMode,
  setTypewriterMode,
  sourceModeField,
  typewriterModeField,
} from '@renderer/editor/viewModes'

function mount(doc: string, anchor: number): { host: HTMLDivElement; view: EditorView } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: baseExtensions(), selection: { anchor } }),
    parent: host,
  })
  return { host, view }
}

describe('视图三件套（源码/专注/打字机）', () => {
  it('源码模式：整篇切纯源码，再切回实时渲染', () => {
    const doc = '# 标题\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n结尾'
    const { host, view } = mount(doc, doc.indexOf('结尾') + 1) // 光标在末尾块，前两块非活跃

    // 实时渲染态：表格为 Widget，标题 # 被隐藏
    expect(host.querySelector('.cm-table-wrap')).toBeTruthy()
    expect(host.textContent).not.toContain('# 标题')

    // 切源码：Widget 消失、源码全显，块样式（标题行类）保留（Typora 源码视图）
    view.dispatch({ effects: setSourceMode.of(true) })
    expect(view.state.field(sourceModeField)).toBe(true)
    expect(host.querySelector('.cm-table-wrap')).toBeFalsy()
    expect(host.textContent).toContain('# 标题')
    expect(host.textContent).toContain('| a | b |')
    expect(host.querySelector('.cm-h1')).toBeTruthy()

    // 切回：装饰恢复
    view.dispatch({ effects: setSourceMode.of(false) })
    expect(host.querySelector('.cm-table-wrap')).toBeTruthy()

    view.destroy()
    host.remove()
  })

  it('源码模式挂行号槽与当前行高亮（compartment 异步重配置）', async () => {
    const { host, view } = mount('# 标题\n\n正文', 1)
    expect(host.querySelector('.cm-gutters')).toBeFalsy()

    view.dispatch({ effects: setSourceMode.of(true) })
    await new Promise((r) => setTimeout(r, 0))
    expect(host.querySelector('.cm-gutters')).toBeTruthy()
    expect(host.querySelector('.cm-activeLine')).toBeTruthy()

    view.dispatch({ effects: setSourceMode.of(false) })
    await new Promise((r) => setTimeout(r, 0))
    expect(host.querySelector('.cm-gutters')).toBeFalsy()

    view.destroy()
    host.remove()
  })

  it('专注模式：非当前块淡化，当前块保持全亮', () => {
    const doc = '第一段\n\n第二段\n\n第三段'
    const anchor = doc.indexOf('第二段') + 1 // 光标在第二块
    const { host, view } = mount(doc, anchor)

    const dims = (): number => host.querySelectorAll('.cm-focus-dim').length
    expect(dims()).toBe(0)

    view.dispatch({ effects: setFocusMode.of(true) })
    expect(view.state.field(focusModeField)).toBe(true)
    // 第一、三块各 1 行被淡化，第二块（当前）不淡化
    expect(dims()).toBe(2)
    expect(host.textContent).toContain('第二段')

    // 光标移到第三块 → 淡化跟随移动（选择变化驱动重建）
    view.dispatch({ selection: { anchor: doc.indexOf('第三段') + 1 } })
    expect(dims()).toBe(2)

    view.dispatch({ effects: setFocusMode.of(false) })
    expect(dims()).toBe(0)

    view.destroy()
    host.remove()
  })

  it('打字机模式：字段切换（滚动行为需真实布局，此处验证状态）', () => {
    const { view } = mount('hello', 5)
    expect(view.state.field(typewriterModeField)).toBe(false)
    view.dispatch({ effects: setTypewriterMode.of(true) })
    expect(view.state.field(typewriterModeField)).toBe(true)
    view.destroy()
  })
})
