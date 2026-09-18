import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { EditorView } from '@codemirror/view'
import { basename } from '@yupmark/live-cm/paths'
import { useWorkspaceStore } from './store/workspaceStore'
import { IconPanel } from './icons'
import { Tip } from './ui/Tip'
import {
  subscribeViewModes,
  toggleFocusMode,
  toggleSourceMode,
  toggleTypewriterMode,
  type ViewModesState,
} from '@yupmark/live-cm/viewModes'

export function StatusBar() {
  const { t } = useTranslation()
  const tabs = useWorkspaceStore((s) => s.tabs)
  const activeId = useWorkspaceStore((s) => s.activeId)
  const saving = useWorkspaceStore((s) => s.saving)
  const saveError = useWorkspaceStore((s) => s.saveError)
  const sidebarOpen = useWorkspaceStore((s) => s.sidebarOpen)
  const [modes, setModes] = useState<ViewModesState>({ source: false, focus: false, typewriter: false })
  const tab = tabs.find((x) => x.id === activeId)

  useEffect(() => subscribeViewModes(setModes), [])

  if (!tab) return null

  const name = tab.path ? basename(tab.path) : t('file.untitled')

  /** 点击徽章退出对应模式（Typora：源码模式徽标带 × 关闭） */
  const exitMode = (toggle: (view: EditorView) => boolean): void => {
    const view = useWorkspaceStore.getState().view
    if (view) toggle(view)
  }

  const allBadges: Array<{ key: keyof ViewModesState; label: string; toggle: (view: EditorView) => boolean }> = [
    { key: 'source', label: t('status.sourceMode'), toggle: toggleSourceMode },
    { key: 'focus', label: t('status.focusMode'), toggle: toggleFocusMode },
    { key: 'typewriter', label: t('status.typewriterMode'), toggle: toggleTypewriterMode },
  ]
  const badges = allBadges.filter((b) => modes[b.key])

  return (
    <footer className="status-bar">
      <span className="status-bar__file" title={tab.path ?? name}>
        {name}
        <span className={`status-bar__dot${tab.dirty ? ' status-bar__dot--dirty' : ''}`} />
      </span>
      <span className={`status-bar__state${saveError ? ' status-bar__state--error' : ''}`}>
        {saveError
          ? t('status.saveFailed')
          : saving
            ? t('status.saving')
            : tab.dirty
              ? t('status.unsaved')
              : t('status.saved')}
      </span>
      <span className="status-bar__stats">
        {t('status.lines', { count: tab.stats.lines })} · {t('status.words', { count: tab.stats.words })} ·{' '}
        {t('status.chars', { count: tab.stats.chars })}
      </span>
      {badges.map((b) => (
        <button
          key={b.key}
          type="button"
          className="status-bar__mode"
          aria-label={`${b.label} — ${t('status.exitMode')}`}
          onClick={() => exitMode(b.toggle)}
        >
          {b.label}
          <span className="status-bar__mode-x" aria-hidden="true">
            ×
          </span>
        </button>
      ))}
      <Tip text={t('sidebar.toggle')} side="left">
        <button
          type="button"
          className="status-bar__toggle"
          aria-label={t('sidebar.toggle')}
          aria-pressed={sidebarOpen}
          onClick={() => useWorkspaceStore.getState().toggleSidebar()}
        >
          <IconPanel size={14} />
        </button>
      </Tip>
    </footer>
  )
}
