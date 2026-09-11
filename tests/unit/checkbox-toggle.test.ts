// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorView } from '@codemirror/view'
import { createEditorState } from '@yupmark/live-cm/extensions'

describe('任务列表复选框点击切换', () => {
  it('点击 [ ] → 源码变 [x]，再点击还原', async () => {
    const doc = '- [ ] 待办一\n- [x] 已完成\n'
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({ state: createEditorState(doc, doc.length), parent: host })
    await new Promise((r) => setTimeout(r, 150))

    const boxes = host.querySelectorAll('.cm-checkbox')
    expect(boxes.length).toBe(2)

    boxes[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    await new Promise((r) => setTimeout(r, 50))
    expect(view.state.doc.toString()).toContain('- [x] 待办一')

    const boxes2 = host.querySelectorAll('.cm-checkbox')
    boxes2[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    await new Promise((r) => setTimeout(r, 50))
    expect(view.state.doc.toString()).toContain('- [ ] 待办一')

    view.destroy()
    host.remove()
  })
})
