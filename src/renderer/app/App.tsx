import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MenuEvent } from '@shared/ipc'
import { basename } from '@yupmark/live-cm/paths'
import { EditorHost } from './EditorHost'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'
import { StatusBar } from './StatusBar'
import { ConflictModal } from './ConflictModal'
import { SettingsModal } from './SettingsModal'
import { useWorkspaceStore } from './store/workspaceStore'
import { IS_MAC } from '@yupmark/live-cm/platform'
import { toggleFocusMode, toggleSourceMode, toggleTypewriterMode } from '@yupmark/live-cm/viewModes'

/** 会话恢复只跑一次（StrictMode 双挂载/热重载防护） */
let sessionRestored = false

/** 切换文档（Typora：Win Ctrl+Tab / mac ⌘`；反向加 Shift） */
function cycleDoc(dir: 1 | -1): void {
  const s = useWorkspaceStore.getState()
  if (s.tabs.length < 2) return
  const idx = s.tabs.findIndex((t) => t.id === s.activeId)
  const next = s.tabs[(idx + dir + s.tabs.length) % s.tabs.length]
  if (next) s.activateTab(next.id)
}

/** 编辑器视图模式开关（菜单加速键入口；渲染层 ⌘//F8/F9 同样生效） */
function withHostView(run: (view: NonNullable<ReturnType<typeof useWorkspaceStore.getState>['view']>) => boolean): void {
  const view = useWorkspaceStore.getState().view
  if (view) run(view)
}

export function App() {
  const { t } = useTranslation()
  const tabs = useWorkspaceStore((s) => s.tabs)
  const activeId = useWorkspaceStore((s) => s.activeId)
  const sidebarOpen = useWorkspaceStore((s) => s.sidebarOpen)
  const tab = tabs.find((x) => x.id === activeId)
  const mounted = useRef(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 原生菜单 + 文件系统事件 + 会话恢复
  useEffect(() => {
    mounted.current = true

    const offMenu = window.yupmark.onMenuAction(({ action }: MenuEvent) => {
      const s = useWorkspaceStore.getState()
      if (typeof action === 'string') {
        switch (action) {
          case 'file:new':
            s.newTab()
            break
          case 'file:open':
            void window.yupmark.openFileDialog().then((res) => {
              if (res.ok) useWorkspaceStore.getState().openDoc(res.data.path, res.data.content)
            })
            break
          case 'file:save':
            void s.saveActiveNow()
            break
          case 'file:save-as':
            void s.saveActiveAs()
            break
          case 'workspace:open':
            void useWorkspaceStore.getState().openWorkspace()
            break
          case 'view:toggle-sidebar':
            useWorkspaceStore.getState().toggleSidebar()
            break
          case 'view:next-doc':
            cycleDoc(1)
            break
          case 'view:prev-doc':
            cycleDoc(-1)
            break
          case 'view:source-mode':
            withHostView(toggleSourceMode)
            break
          case 'view:focus-mode':
            withHostView(toggleFocusMode)
            break
          case 'view:typewriter-mode':
            withHostView(toggleTypewriterMode)
            break
          case 'app:settings':
            setSettingsOpen(true)
            break
        }
      } else if (action.action === 'file:open-path') {
        void window.yupmark.readFile(action.path).then((res) => {
          if (res.ok) useWorkspaceStore.getState().openDoc(action.path, res.data)
        })
      }
    })

    const offFs = window.yupmark.onFsEvent((event) => {
      useWorkspaceStore.getState().handleFsEvent(event)
    })

    if (!sessionRestored) {
      sessionRestored = true
      void useWorkspaceStore.getState().restoreSession().then(() => {
        // 会话恢复出真实标签后，丢掉启动时的空白未命名 tab
        const s = useWorkspaceStore.getState()
        if (s.tabs.length > 1) {
          const empty = s.tabs.find((x) => !x.path && x.content === '')
          if (empty && empty.id !== s.activeId) {
            useWorkspaceStore.setState((st) => ({ tabs: st.tabs.filter((x) => x.id !== empty.id) }))
          }
        }
      })
    }

    return () => {
      offMenu()
      offFs()
    }
  }, [])

  // 关窗/刷新前：冲刷挂起的自动保存与会话
  useEffect(() => {
    const flush = () => {
      const s = useWorkspaceStore.getState()
      s.persistSessionNow()
      const activeTab = s.tabs.find((x) => x.id === s.activeId)
      if (activeTab?.path && activeTab.dirty) void s.saveActiveNow()
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])

  // 窗口标题跟随激活文档
  useEffect(() => {
    const name = tab?.path ? basename(tab.path) : t('file.untitled')
    document.title = `${tab?.dirty ? '● ' : ''}${name} — YupMark`
  }, [tab?.path, tab?.dirty, t])

  // Typora 视图键：面板切换（Win Ctrl+Shift+1/3，mac ⌃⌘1/⌃⌘3），侧栏收起时自动展开
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const panel = e.code === 'Digit1' ? 'outline' : e.code === 'Digit3' ? 'files' : null
      if (!panel || e.altKey) return
      const macCombo = IS_MAC && e.metaKey && e.ctrlKey && !e.shiftKey
      const winCombo = !IS_MAC && e.ctrlKey && e.shiftKey && !e.metaKey
      if (!macCombo && !winCombo) return
      e.preventDefault()
      const s = useWorkspaceStore.getState()
      if (!s.sidebarOpen) s.toggleSidebar()
      s.setPanel(panel)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      {sidebarOpen ? <Sidebar /> : null}
      <div className="app__main">
        <TabBar />
                <main className="app__editor">
          <EditorHost />
        </main>
        <StatusBar />
      </div>
      <ConflictModal />
      {settingsOpen ? <SettingsModal onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  )
}
