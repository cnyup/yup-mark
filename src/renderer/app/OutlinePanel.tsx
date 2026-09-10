import { useEffect, useRef } from 'react'
import { EditorView } from '@codemirror/view'
import { useTranslation } from 'react-i18next'
import { activeOutlineItem } from '../editor/outline'
import { useWorkspaceStore } from './store/workspaceStore'

/** 大纲面板：当前文档标题树，点击跳转，光标所在章节高亮 */
export function OutlinePanel() {
  const { t } = useTranslation()
  const tabs = useWorkspaceStore((s) => s.tabs)
  const activeId = useWorkspaceStore((s) => s.activeId)
  const cursorPos = useWorkspaceStore((s) => s.cursorPos)
  const view = useWorkspaceStore((s) => s.view)
  const tab = tabs.find((x) => x.id === activeId)
  const listRef = useRef<HTMLDivElement>(null)

  const items = tab?.outline ?? []
  const current = activeOutlineItem(items, cursorPos)

  // 当前章节变化时滚动大纲使其可见
  useEffect(() => {
    if (!current || !listRef.current) return
    const el = listRef.current.querySelector(`[data-from="${current.from}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [current])

  if (items.length === 0) {
    return <div className="outline-panel outline-panel--empty">{t('outline.empty')}</div>
  }

  return (
    <div className="outline-panel" ref={listRef}>
      {items.map((item) => (
        <div
          key={item.from}
          data-from={item.from}
          className={`outline-panel__item${current === item ? ' outline-panel__item--active' : ''}`}
          style={{ paddingLeft: 8 + (item.level - 1) * 14 }}
          onClick={() => {
            if (!view) return
            view.dispatch({
              selection: { anchor: item.from },
              effects: EditorView.scrollIntoView(item.from, { y: 'center' }),
            })
            view.focus()
          }}
        >
          {item.text || t('outline.untitled')}
        </div>
      ))}
    </div>
  )
}
