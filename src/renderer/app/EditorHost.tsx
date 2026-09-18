import { useEffect, useRef } from 'react'
import { EditorView } from '@codemirror/view'
import { buildTableAndFormatKeys, formatKeysCompartment } from '@yupmark/live-cm/engine'
import { openEditorContextMenu } from '@yupmark/live-cm/contextMenu'
import { useWorkspaceStore } from './store/workspaceStore'
import { useAppSettings } from './store/appSettings'

/** 挂载唯一 CM6 视图；多标签通过 view.setState 切换快照（见 workspaceStore） */
export function EditorHost() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // 初始空状态也走 store 的状态工厂（自带宿主事件监听 + 当前键位覆盖）
    const view = new EditorView({
      state: useWorkspaceStore.getState().createHostState(),
      parent: host,
    })
    useWorkspaceStore.getState().attachView(view)

    // 编辑器右键：宿主捕获层直接接管（WKWebView 下 CM6 挂在 contentDOM 的
    // contextmenu 处理器不可靠）；内核自带菜单已处理时（defaultPrevented）放行
    const onCtxMenu = (e: MouseEvent): void => {
      if (e.defaultPrevented) return
      const active = useWorkspaceStore.getState().view
      if (!active) return
      e.preventDefault()
      e.stopPropagation()
      openEditorContextMenu(active, e.clientX, e.clientY)
    }
    host.addEventListener('contextmenu', onCtxMenu, true)

    return () => {
      host.removeEventListener('contextmenu', onCtxMenu, true)
      useWorkspaceStore.getState().detachView()
      view.destroy()
    }
  }, [])

  // 设置页改快捷键 → 活视图热重配（新 tab 状态由 docState 自带覆盖，无需处理）
  useEffect(() => {
    return useAppSettings.subscribe((s, prev) => {
      if (s.keybindings === prev.keybindings) return
      const view = useWorkspaceStore.getState().view
      view?.dispatch({
        effects: formatKeysCompartment.reconfigure(buildTableAndFormatKeys(s.keybindings)),
      })
    })
  }, [])

  return <div ref={hostRef} className="editor-host" />
}
