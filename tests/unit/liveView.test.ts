// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { baseExtensions } from '@yupmark/live-cm/extensions'

/** view 级冒烟：装饰管线经过 EditorView 落到真实 DOM（StateField→decorations facet→DOM） */
describe('live render view 集成', () => {
  it('非活跃块的语法在 DOM 中被隐藏类标记', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const doc = '# Head\n\n**bold** text\n\nend'
    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: baseExtensions(),
        selection: { anchor: doc.length }, // 光标在文末，前两块非活跃
      }),
      parent: host,
    })

    // 隐藏走 replace（文本完全不在 DOM），标题/粗体源码符号应从渲染文本中消失
    const text = host.textContent ?? ''
    expect(text).toContain('Head')
    expect(text).toContain('bold text')
    expect(text).not.toContain('#')
    expect(text).not.toContain('**')
    expect(host.querySelector('.cm-h1')).toBeTruthy()
    expect(host.querySelector('.cm-strong')).toBeTruthy()

    view.destroy()
    host.remove()
  })

  it('光标进入块后标记保持隐藏（选择变化驱动重建）', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const doc = '# Head\n\nend'
    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: baseExtensions(),
        selection: { anchor: doc.length },
      }),
      parent: host,
    })

    // 渲染态：# 被替换移除，不在渲染文本中
    expect(host.textContent).not.toContain('#')

    // 光标进入标题块：统一渲染策略下 # 仍隐藏，块样式保留（重建不丢装饰）
    view.dispatch({ selection: { anchor: 1 } })
    expect(host.textContent).not.toContain('#')
    expect(host.querySelector('.cm-h1')).toBeTruthy()

    view.destroy()
    host.remove()
  })
})
