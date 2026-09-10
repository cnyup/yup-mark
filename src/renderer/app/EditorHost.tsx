import { useEffect, useRef } from 'react'
import { EditorView } from '@codemirror/view'
import { useWorkspaceStore } from './store/workspaceStore'

/** 挂载唯一 CM6 视图；多标签通过 view.setState 切换快照（见 workspaceStore） */
export function EditorHost() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // 初始空状态也走 store 的状态工厂（自带宿主事件监听）
    const view = new EditorView({
      state: useWorkspaceStore.getState().createHostState(),
      parent: host,
    })
    useWorkspaceStore.getState().attachView(view)

    return () => {
      useWorkspaceStore.getState().detachView()
      view.destroy()
    }
  }, [])

  return <div ref={hostRef} className="editor-host" />
}
