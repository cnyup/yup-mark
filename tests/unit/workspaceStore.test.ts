// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { baseExtensions } from '@renderer/editor/extensions'
import { useWorkspaceStore } from '@renderer/app/store/workspaceStore'

function freshView(): EditorView {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return new EditorView({
    state: EditorState.create({ doc: '', extensions: baseExtensions() }),
    parent: host,
  })
}

/** 每个用例重置 store 原始状态 */
function resetStore(): void {
  useWorkspaceStore.setState({
    view: null,
    tabs: [],
    activeId: null,
    workspaceRoot: null,
    tree: [],
    treeLoading: false,
    expandedDirs: {},
    sidebarOpen: true,
    sidebarPanel: 'files',
    saving: false,
    saveError: null,
    conflict: null,
    cursorPos: 0,
  })
}

beforeEach(() => {
  resetStore()
  window.soyupmark = {
    watchDir: vi.fn().mockResolvedValue({ ok: true, data: null }),
    unwatchDir: vi.fn().mockResolvedValue({ ok: true, data: null }),
    saveFile: vi.fn().mockResolvedValue({ ok: true, data: null }),
    readFile: vi.fn(),
    saveSession: vi.fn().mockResolvedValue({ ok: true, data: null }),
  } as unknown as typeof window.soyupmark
})

describe('workspaceStore 多标签逻辑', () => {
  it('attachView 无标签时创建未命名文档', () => {
    const view = freshView()
    useWorkspaceStore.getState().attachView(view)
    const s = useWorkspaceStore.getState()
    expect(s.tabs).toHaveLength(1)
    expect(s.tabs[0]?.path).toBeNull()
    expect(s.activeId).toBe(s.tabs[0]?.id)
    view.destroy()
  })

  it('openDoc 打开新 tab 并激活；重复打开走已有 tab', () => {
    const view = freshView()
    const store = useWorkspaceStore.getState()
    store.attachView(view)

    useWorkspaceStore.getState().openDoc('/a/one.md', 'one')
    useWorkspaceStore.getState().openDoc('/a/two.md', 'two')
    let s = useWorkspaceStore.getState()
    expect(s.tabs).toHaveLength(3) // 初始未命名 + 两个文件
    expect(s.activeId).toBe(s.tabs[2]?.id)

    useWorkspaceStore.getState().openDoc('/a/one.md', 'one')
    s = useWorkspaceStore.getState()
    expect(s.tabs).toHaveLength(3)
    expect(s.activeId).toBe(s.tabs[1]?.id)
    view.destroy()
  })

  it('activateTab 保留内容与滚动位置', () => {
    const view = freshView()
    const store = useWorkspaceStore.getState()
    store.attachView(view)
    useWorkspaceStore.getState().openDoc('/a/one.md', 'one')
    useWorkspaceStore.getState().openDoc('/a/two.md', 'two')

    // 在 two 里编辑（直接改 view）
    view.dispatch({ changes: { from: 0, insert: 'edit: ' } })
    useWorkspaceStore.getState().onDocChanged()

    useWorkspaceStore.getState().activateTab(useWorkspaceStore.getState().tabs[1]!.id)
    const s = useWorkspaceStore.getState()
    const two = s.tabs.find((t) => t.path === '/a/two.md')
    expect(two?.content).toBe('edit: two')
    expect(two?.dirty).toBe(true)
    view.destroy()
  })

  it('closeTab 关闭激活 tab 后切到邻居', async () => {
    const view = freshView()
    const store = useWorkspaceStore.getState()
    store.attachView(view)
    useWorkspaceStore.getState().openDoc('/a/one.md', 'one')
    useWorkspaceStore.getState().openDoc('/a/two.md', 'two')

    const s1 = useWorkspaceStore.getState()
    await useWorkspaceStore.getState().closeTab(s1.tabs[2]!.id)
    const s2 = useWorkspaceStore.getState()
    expect(s2.tabs).toHaveLength(2)
    expect(s2.tabs.find((t) => t.path === '/a/two.md')).toBeUndefined()
    expect(s2.activeId).toBe(s2.tabs[1]?.id)
    view.destroy()
  })

  it('外部修改：无未保存改动时静默重载', async () => {
    const view = freshView()
    const store = useWorkspaceStore.getState()
    store.attachView(view)
    useWorkspaceStore.getState().openDoc('/a/one.md', 'one')

    ;(window.soyupmark.readFile as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: 'one-new' })
    useWorkspaceStore.getState().handleFsEvent({ dir: '/a', file: 'one.md' })
    // 异步流程
    await new Promise((r) => setTimeout(r, 10))

    const s = useWorkspaceStore.getState()
    const tab = s.tabs.find((t) => t.path === '/a/one.md')
    expect(tab?.savedContent).toBe('one-new')
    expect(tab?.dirty).toBe(false)
    expect(s.conflict).toBeNull()
    view.destroy()
  })

  it('外部修改：有未保存改动时弹冲突', async () => {
    const view = freshView()
    const store = useWorkspaceStore.getState()
    store.attachView(view)
    useWorkspaceStore.getState().openDoc('/a/one.md', 'one')

    view.dispatch({ changes: { from: 0, to: 3, insert: 'MY' } })
    useWorkspaceStore.getState().onDocChanged()

    ;(window.soyupmark.readFile as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: 'disk-version' })
    useWorkspaceStore.getState().handleFsEvent({ dir: '/a', file: 'one.md' })
    await new Promise((r) => setTimeout(r, 10))

    const s = useWorkspaceStore.getState()
    expect(s.conflict).not.toBeNull()
    expect(s.conflict?.diskContent).toBe('disk-version')
    view.destroy()
  })

  it('resolveConflict load-disk 覆盖本地', async () => {
    const view = freshView()
    const store = useWorkspaceStore.getState()
    store.attachView(view)
    useWorkspaceStore.getState().openDoc('/a/one.md', 'one')

    view.dispatch({ changes: { from: 0, to: 3, insert: 'MY' } })
    useWorkspaceStore.getState().onDocChanged()

    ;(window.soyupmark.readFile as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: 'disk-version' })
    useWorkspaceStore.getState().handleFsEvent({ dir: '/a', file: 'one.md' })
    await new Promise((r) => setTimeout(r, 10))

    await useWorkspaceStore.getState().resolveConflict('load-disk')
    const s = useWorkspaceStore.getState()
    const tab = s.tabs.find((t) => t.path === '/a/one.md')
    expect(tab?.content).toBe('disk-version')
    expect(tab?.dirty).toBe(false)
    expect(view.state.doc.toString()).toBe('disk-version')
    view.destroy()
  })
})
