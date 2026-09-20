/**
 * 工作区状态：多标签文档 + 文件树 + 侧栏 + 会话持久化 + 外部修改检测。
 * 文档内容以每个 tab 的 CM6 EditorState 快照为权威；LRU 超限时降级为纯文本。
 */
import { create } from 'zustand'
import type { EditorState, Extension } from '@codemirror/state'
import type { FileEntry, FsEventData, SessionState , FileSortMode } from '@shared/ipc'
import { countStats, type TextStats } from '@shared/stats'
import { dirname } from '@yupmark/live-cm/paths'
import { createEditorState } from '@yupmark/live-cm/extensions'
import { EditorView } from '@codemirror/view'
import { setDocDir } from '@yupmark/live-cm/engine'
import { extractOutline, type OutlineItem } from '@yupmark/live-cm/outline'
import { findGapAnchor } from '@yupmark/live-cm/blocks'
import { useAppSettings } from './appSettings'

const AUTOSAVE_DELAY_MS = 800
const SESSION_SAVE_DELAY_MS = 1000
const TREE_REFRESH_DELAY_MS = 400
const OUTLINE_RECOMPUTE_DELAY_MS = 250
const MAX_LIVE_TAB_STATES = 8

export interface Tab {
  id: string
  path: string | null
  savedContent: string
  content: string
  dirty: boolean
  /** CM6 状态快照；LRU 降级后为 null（用 content 重建） */
  cm: EditorState | null
  scrollTop: number
  stats: TextStats
  outline: OutlineItem[]
  lastActiveAt: number
  /** 冲突抑制：该磁盘内容已被告知用户，不再重复弹窗 */
  conflictDismissed: string | null
  /** 保存完成标记（标签页短暂显示 ✓ 后自动淡出） */
  savedFlash?: boolean
}

interface WorkspaceStore {
  view: EditorView | null
  tabs: Tab[]
  activeId: string | null
  workspaceRoot: string | null
  tree: FileEntry[]
  treeLoading: boolean
  expandedDirs: Record<string, boolean>
  sidebarOpen: boolean
  sidebarPanel: 'files' | 'outline'
  fileView: 'tree' | 'list'
  fileSort: FileSortMode
  saving: boolean
  saveError: string | null
  conflict: { tabId: string; tabPath: string | null; diskContent: string } | null
  cursorPos: number

  attachView(view: EditorView): void
  detachView(): void
  /** EditorHost 初始视图状态（自带宿主事件监听） */
  createHostState(): EditorState

  newTab(): void
  /** 用已知内容打开（打开对话框/最近文件/会话恢复共用） */
  openDoc(path: string | null, content: string, opts?: { activate?: boolean }): void
  activateTab(id: string): void
  closeTab(id?: string): Promise<void>

  onDocChanged(): void
  onSelectionChanged(pos: number): void
  saveActiveNow(): Promise<void>
  saveActiveAs(): Promise<void>

  openWorkspace(): Promise<void>
  /** expandRoot=false 时根目录保持折叠（打开单个文件的采纳场景，不打扰） */
  restoreWorkspace(root: string, opts?: { expandRoot?: boolean }): Promise<void>
  refreshTree(): Promise<void>
  toggleDir(path: string): void
  toggleSidebar(): void
  setPanel(panel: 'files' | 'outline'): void
  setFileView(view: 'tree' | 'list'): void
  setFileSort(sort: FileSortMode): void

  handleFsEvent(event: FsEventData): void
  resolveConflict(choice: 'keep-mine' | 'load-disk' | 'later'): Promise<void>

  restoreSession(): Promise<void>
  persistSessionNow(): void
}

/** 会话里可能存有历史排序值，恢复前校验 */
const SORT_MODES: readonly FileSortMode[] = ['folder', 'natural-desc', 'name', 'created', 'mtime']

const nowId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

function makeTab(path: string | null, content: string): Tab {
  return {
    id: nowId(),
    path,
    savedContent: path ? content : '',
    content,
    dirty: path ? false : content !== '',
    cm: docState(content),
    scrollTop: 0,
    stats: countStats(content),
    outline: extractOutline(createEditorState(content)),
    lastActiveAt: Date.now(),
    conflictDismissed: null,
  }
}

/** 宿主事件监听：编辑/选区变化 → store。
 *  必须内建在每个状态里：view.setState 会整体替换扩展，
 *  若只在 EditorHost 初始视图挂监听，切换标签后就会丢失（dirty/字数/自动保存全部失灵） */
const hostEvents = (): Extension =>
  EditorView.updateListener.of((update) => {
    const store = useWorkspaceStore.getState()
    if (update.docChanged) store.onDocChanged()
    if (update.selectionSet) store.onSelectionChanged(update.state.selection.main.head)
  })

/** 从内容新建文档状态：光标置于空闲锚点（块间空隙），打开即全渲染（Typora 行为）。
 *  键位 Compartment 注入当前覆盖（baseExtensions 的默认值被后位覆盖取代），tab 快照因此带着自定义键位 */
function docState(content: string): EditorState {
  return createEditorState(
    content,
    findGapAnchor(createEditorState(content)),
    [hostEvents()],
    useAppSettings.getState().keybindings,
  )
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null
let sessionTimer: ReturnType<typeof setTimeout> | null = null
let treeTimer: ReturnType<typeof setTimeout> | null = null
let outlineTimer: ReturnType<typeof setTimeout> | null = null

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => {
  const active = (): Tab | undefined => get().tabs.find((t) => t.id === get().activeId)

  const patchTab = (id: string, patch: Partial<Tab>): void => {
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
  }

  /** 标签页“已保存 ✓”短暂反馈：1.6s 后淡出；新保存刷新计时（序号防串扰） */
  let savedFlashTimer: ReturnType<typeof setTimeout> | null = null
  let savedFlashSeq = 0
  const flashSaved = (id: string): void => {
    savedFlashSeq += 1
    const seq = savedFlashSeq
    if (savedFlashTimer) clearTimeout(savedFlashTimer)
    patchTab(id, { savedFlash: true })
    savedFlashTimer = setTimeout(() => {
      if (seq === savedFlashSeq) patchTab(id, { savedFlash: false })
    }, 1600)
  }

  const scheduleAutosave = (): void => {
    if (autosaveTimer) clearTimeout(autosaveTimer)
    autosaveTimer = setTimeout(() => {
      void get().saveActiveNow()
    }, AUTOSAVE_DELAY_MS)
  }

  const scheduleSessionPersist = (): void => {
    if (sessionTimer) clearTimeout(sessionTimer)
    sessionTimer = setTimeout(() => get().persistSessionNow(), SESSION_SAVE_DELAY_MS)
  }

  const syncDocDir = (): void => {
    const { view } = get()
    const tab = active()
    if (!view || !tab) return
    view.dispatch({ effects: setDocDir.of(tab.path ? dirname(tab.path) : null) })
  }

  /** LRU：活跃 tab 之外最多保留 MAX_LIVE_TAB_STATES 个 CM 状态快照 */
  const evictStaleStates = (): void => {
    const tabs = get().tabs
    const withState = tabs
      .filter((t) => t.cm !== null && t.id !== get().activeId)
      .sort((a, b) => a.lastActiveAt - b.lastActiveAt)
    let excess = withState.length - MAX_LIVE_TAB_STATES
    for (const t of withState) {
      if (excess-- <= 0) break
      patchTab(t.id, { cm: null })
    }
  }

  /** 把视图切换到指定 tab（状态替换 + 滚动恢复 + docDir 同步） */
  const mountTabIntoView = (tab: Tab): void => {
    const { view } = get()
    if (!view) return
    const state = tab.cm ?? docState(tab.content)
    view.setState(state)
    if (tab.cm === null) patchTab(tab.id, { cm: state })
    requestAnimationFrame(() => {
      const v = get().view
      if (v) {
        v.scrollDOM.scrollTop = tab.scrollTop
        // 不做打开时的主动全量测量（会滚屏）：
        // 视口内高度在首次绘制时已精确；跳滚漂移由滚动空闲自愈器处理
      }
    })
    syncDocDir()
  }

  return {
    view: null,
    tabs: [],
    activeId: null,
    workspaceRoot: null,
    tree: [],
    treeLoading: false,
    expandedDirs: {},
    sidebarOpen: true,
    sidebarPanel: 'files',
    fileView: 'tree',
    fileSort: 'folder',
    saving: false,
    saveError: null,
    conflict: null,
    cursorPos: 0,

    attachView: (view) => {
      set({ view })
      const { tabs, activeId } = get()
      const tab = tabs.find((t) => t.id === activeId) ?? tabs[0]
      if (tab) {
        set({ activeId: tab.id })
        mountTabIntoView(tab)
      } else {
        const fresh = makeTab(null, '')
        set({ tabs: [fresh], activeId: fresh.id })
        mountTabIntoView(fresh)
        scheduleSessionPersist()
      }
    },

    createHostState: () => docState(''),

    detachView: () => {
      if (autosaveTimer) clearTimeout(autosaveTimer)
      autosaveTimer = null
      set({ view: null })
    },

    newTab: () => {
      const tab = makeTab(null, '')
      set((s) => ({ tabs: [...s.tabs, tab] }))
      get().activateTab(tab.id)
    },

    openDoc: (path, content, opts) => {
      const existing = get().tabs.find((t) => t.path === path)
      if (existing) {
        if (opts?.activate !== false) get().activateTab(existing.id)
        return
      }
      const tab = makeTab(path, content)
      set((s) => ({ tabs: [...s.tabs, tab] }))
      if (opts?.activate !== false) get().activateTab(tab.id)
      // 单文件模式：不采纳所在目录为工作区（侧栏只列已打开文档）；
      // 仅监听其目录感知外部修改
      if (path && !path.startsWith(get().workspaceRoot ?? '\0')) {
        void window.yupmark.watchDir(dirname(path), false)
      }
      scheduleSessionPersist()
    },

    activateTab: (id) => {
      const { activeId, view, tabs } = get()
      if (id === activeId) return
      // 离开当前 tab：快照状态与滚动，冲刷挂起的自动保存
      const leaving = tabs.find((t) => t.id === activeId)
      if (leaving && view) {
        patchTab(leaving.id, {
          cm: view.state,
          scrollTop: view.scrollDOM.scrollTop,
          lastActiveAt: Date.now(),
        })
        if (autosaveTimer) {
          clearTimeout(autosaveTimer)
          autosaveTimer = null
          void get().saveActiveNow()
        }
      }
      const next = get().tabs.find((t) => t.id === id)
      if (!next) return
      patchTab(next.id, { lastActiveAt: Date.now() })
      set({ activeId: id, cursorPos: next.cm ? next.cm.selection.main.head : 0, conflict: null })
      mountTabIntoView(next)
      evictStaleStates()
      scheduleSessionPersist()
    },

    closeTab: async (idArg) => {
      const id = idArg ?? get().activeId
      if (!id) return
      const tab = get().tabs.find((t) => t.id === id)
      if (!tab) return
      if (tab.dirty && tab.content.trim() !== '') {
        if (!tab.path && !window.confirm('此文档未保存，关闭后将丢失。确定关闭？')) return
      }
      if (tab.path && tab.dirty) await get().saveActiveNow()
      const idx = get().tabs.findIndex((t) => t.id === id)
      const remaining = get().tabs.filter((t) => t.id !== id)
      if (tab.path) void window.yupmark.unwatchDir(dirname(tab.path), false)
      if (remaining.length === 0) {
        const fresh = makeTab(null, '')
        set({ tabs: [fresh], activeId: fresh.id, conflict: null })
        mountTabIntoView(fresh)
      } else {
        const nextActive = remaining[Math.min(idx, remaining.length - 1)]
        if (get().activeId === id) {
          set({ tabs: remaining, activeId: nextActive.id, conflict: null })
          mountTabIntoView(nextActive)
        } else {
          set({ tabs: remaining })
        }
      }
      scheduleSessionPersist()
    },

    onDocChanged: () => {
      const { view } = get()
      const tab = active()
      if (!view || !tab) return
      const content = view.state.doc.toString()
      const dirty = tab.path ? content !== tab.savedContent : content !== ''
      patchTab(tab.id, {
        cm: view.state,
        content,
        dirty,
        stats: countStats(content),
        conflictDismissed: null,
      })
      if (dirty && tab.path) scheduleAutosave()
      if (outlineTimer) clearTimeout(outlineTimer)
      const tabId = tab.id
      outlineTimer = setTimeout(() => {
        const v = get().view
        const t = get().tabs.find((x) => x.id === tabId)
        if (v && t && t.id === get().activeId) {
          patchTab(tabId, { outline: extractOutline(v.state) })
        }
      }, OUTLINE_RECOMPUTE_DELAY_MS)
      scheduleSessionPersist()
    },

    onSelectionChanged: (pos) => set({ cursorPos: pos }),

    saveActiveNow: async () => {
      const tab = active()
      const { view } = get()
      if (!tab || !tab.dirty || get().saving) return
      if (!tab.path) {
        await get().saveActiveAs()
        return
      }
      set({ saving: true })
      const content = view ? view.state.doc.toString() : tab.content
      const res = await window.yupmark.saveFile(tab.path, content)
      if (res.ok) {
        patchTab(tab.id, { savedContent: content, content, dirty: false })
        flashSaved(tab.id)
        set({ saving: false, saveError: null })
        scheduleSessionPersist()
      } else {
        patchTab(tab.id, { content })
        set({ saving: false, saveError: res.error })
      }
    },

    saveActiveAs: async () => {
      const tab = active()
      const { view } = get()
      if (!tab || get().saving) return
      const content = view ? view.state.doc.toString() : tab.content
      set({ saving: true })
      const res = await window.yupmark.saveFileDialog(content)
      if (res.ok) {
        patchTab(tab.id, {
          path: res.data.path,
          savedContent: content,
          content,
          dirty: false,
        })
        set({ saving: false })
        syncDocDir()
        // 单文件模式：另存不采纳目录，仅监听感知外部修改
        void window.yupmark.watchDir(dirname(res.data.path), false)
        scheduleSessionPersist()
      } else if (res.error !== 'canceled') {
        set({ saving: false, saveError: res.error })
      } else {
        set({ saving: false })
      }
    },

    openWorkspace: async () => {
      const res = await window.yupmark.openWorkspaceDialog()
      if (res.ok && res.data) await get().restoreWorkspace(res.data)
    },

    restoreWorkspace: async (root, opts) => {
      set({
        workspaceRoot: root,
        expandedDirs: opts?.expandRoot === false ? {} : { [root]: true },
        treeLoading: true,
      })
      await window.yupmark.watchDir(root, true)
      await get().refreshTree()
      scheduleSessionPersist()
    },

    refreshTree: async () => {
      const root = get().workspaceRoot
      if (!root) return
      const res = await window.yupmark.readTree(root)
      if (res.ok) set({ tree: res.data, treeLoading: false })
      else set({ treeLoading: false })
    },

    toggleDir: (path) => {
      set((s) => ({ expandedDirs: { ...s.expandedDirs, [path]: !s.expandedDirs[path] } }))
    },

    toggleSidebar: () => {
      set((s) => ({ sidebarOpen: !s.sidebarOpen }))
      scheduleSessionPersist()
    },

    setPanel: (panel) => {
      set({ sidebarPanel: panel })
      scheduleSessionPersist()
    },

    setFileView: (view) => {
      set({ fileView: view })
      scheduleSessionPersist()
    },

    setFileSort: (sort) => {
      set({ fileSort: sort })
      scheduleSessionPersist()
    },

    handleFsEvent: (event) => {
      const { workspaceRoot } = get()
      const fullPath = `${event.dir}/${event.file}`
      // 工作区内的变化 → 刷新文件树（去抖）
      if (workspaceRoot && (event.dir === workspaceRoot || event.dir.startsWith(workspaceRoot))) {
        if (treeTimer) clearTimeout(treeTimer)
        treeTimer = setTimeout(() => void get().refreshTree(), TREE_REFRESH_DELAY_MS)
      }
      const tab = get().tabs.find((t) => normalizePath(t.path) === normalizePath(fullPath))
      if (!tab || !tab.path) return

      void (async () => {
        const res = await window.yupmark.readFile(tab.path as string)
        if (!res.ok) return // 文件可能被删除：保留现状，下次保存会重建
        const disk = res.data
        const current = get().tabs.find((x) => x.id === tab.id)
        if (!current || disk === current.savedContent) return
        if (!current.dirty) {
          // 无未保存修改 → 静默重载（整体替换，重建 undo 栈；光标回到空闲锚点保持全渲染）
          patchTab(current.id, {
            savedContent: disk,
            content: disk,
            cm: docState(disk),
            outline: extractOutline(createEditorState(disk)),
            stats: countStats(disk),
          })
          const fresh = get().tabs.find((x) => x.id === current.id)
          if (fresh && get().activeId === current.id) mountTabIntoView(fresh)
        } else if (disk !== current.conflictDismissed) {
          set({ conflict: { tabId: current.id, tabPath: current.path, diskContent: disk } })
        }
      })()
    },

    resolveConflict: async (choice) => {
      const { conflict } = get()
      if (!conflict) return
      set({ conflict: null })
      const tab = get().tabs.find((t) => t.id === conflict.tabId)
      if (!tab) return
      if (choice === 'keep-mine') {
        // 保留我的：继续编辑，保持 dirty；相同磁盘内容不再重复提示
        patchTab(tab.id, { conflictDismissed: conflict.diskContent })
      } else if (choice === 'load-disk') {
        const disk = conflict.diskContent
        patchTab(tab.id, {
          savedContent: disk,
          content: disk,
          cm: docState(disk),
          outline: extractOutline(createEditorState(disk)),
          stats: countStats(disk),
          dirty: false,
        })
        if (get().activeId === tab.id) {
          mountTabIntoView(get().tabs.find((t) => t.id === tab.id)!)
        }
      }
      // 'later'：仅关闭弹窗
    },

    restoreSession: async () => {
      const session = await window.yupmark.loadSession()
      if (!session) return
      if (session.sidebarOpen !== undefined) set({ sidebarOpen: session.sidebarOpen })
      if (session.sidebarPanel) set({ sidebarPanel: session.sidebarPanel })
      if (session.fileView === 'tree' || session.fileView === 'list') set({ fileView: session.fileView })
      if (SORT_MODES.includes(session.fileSort as FileSortMode)) set({ fileSort: session.fileSort as FileSortMode })
      if (session.workspaceRoot) await get().restoreWorkspace(session.workspaceRoot, { expandRoot: false })
      // 展开状态恢复（旧 session 无此字段 → 保持折叠，避免重启后整目录铺开）
      if (Array.isArray(session.expandedDirs)) {
        const dirs: Record<string, boolean> = {}
        for (const d of session.expandedDirs) if (typeof d === 'string') dirs[d] = true
        set({ expandedDirs: dirs })
      }
      const opened: string[] = []
      for (const t of session.tabs ?? []) {
        if (t.path) {
          const res = await window.yupmark.readFile(t.path)
          if (res.ok) {
            get().openDoc(t.path, res.data, { activate: false })
            opened.push(t.path)
          }
        } else if (typeof t.content === 'string' && t.content !== '') {
          // 会话里未保存的未命名文档
          const tab = makeTab(null, t.content)
          set((s) => ({ tabs: [...s.tabs, tab] }))
        }
      }
      const activePath = session.activePath
      const target = get().tabs.find((t) => t.path === activePath)
      if (target) get().activateTab(target.id)
      scheduleSessionPersist()
    },

    persistSessionNow: () => {
      const { tabs, activeId, workspaceRoot, sidebarOpen, sidebarPanel, fileView, fileSort, expandedDirs } = get()
      const activeTab = tabs.find((t) => t.id === activeId)
      const state: SessionState = {
        workspaceRoot,
        sidebarOpen,
        sidebarPanel,
        fileView,
        fileSort,
        expandedDirs: Object.entries(expandedDirs)
          .filter(([, v]) => v)
          .map(([k]) => k),
        tabs: tabs.map((t) => ({ path: t.path, content: t.dirty ? t.content : undefined })),
        activePath: activeTab?.path ?? null,
      }
      void window.yupmark.saveSession(state)
    },
  }
})

/** 路径归一化比较（macOS 大小写不敏感场景按字典序比较即可） */
function normalizePath(p: string | null): string {
  return p ? p.replace(/\/+$/, '') : ''
}
