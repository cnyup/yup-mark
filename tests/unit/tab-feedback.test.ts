// @vitest-environment jsdom
import { describe, expect, it, beforeAll } from 'vitest'
import { EditorView } from '@codemirror/view'
import { useWorkspaceStore } from '@renderer/app/store/workspaceStore'

/**
 * 回归：view.setState 会整体替换状态扩展。若标签快照不带宿主监听，
 * 切换标签后编辑事件不再通知 store（dirty/字数/自动保存/大纲全部失灵）。
 * 本测试不手动调 onDocChanged——必须由挂载状态里的监听器自动触发。
 */
describe('标签挂载后编辑事件链路', () => {
  beforeAll(() => {
    const ok = { ok: true, data: null }
    ;(window as unknown as { soyupmark: unknown }).soyupmark = {
      saveFile: async () => ok,
      saveSession: async () => ok,
      loadSession: async () => null,
      watchDir: async () => ok,
      unwatchDir: async () => ok,
      readTree: async () => ({ ok: true, data: [] }),
      readFile: async () => ({ ok: true, data: '' }),
    }
  })

  it('第二个标签挂载后输入 → dirty 自动置位', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({ state: useWorkspaceStore.getState().createHostState(), parent: host })
    useWorkspaceStore.getState().attachView(view)

    useWorkspaceStore.getState().openDoc('/tmp/first.md', 'one')
    useWorkspaceStore.getState().openDoc('/tmp/second.md', 'two')

    // 在（挂载路径创建的）第二个标签里输入，不手动调 onDocChanged
    view.dispatch({ changes: { from: view.state.doc.length, insert: '!' } })
    await new Promise((r) => setTimeout(r, 50))

    const tab = useWorkspaceStore.getState().tabs.find((t) => t.path === '/tmp/second.md')!
    expect(view.state.doc.toString()).toBe('two!')
    expect(tab.dirty).toBe(true)
    expect(tab.content).toBe('two!')
    view.destroy()
  })
})
