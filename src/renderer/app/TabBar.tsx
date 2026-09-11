import { useTranslation } from 'react-i18next'
import { basename } from '@yupmark/live-cm/paths'
import { useWorkspaceStore } from './store/workspaceStore'

/** 多标签栏：点击切换，中键/×关闭 */
export function TabBar() {
  const { t } = useTranslation()
  const tabs = useWorkspaceStore((s) => s.tabs)
  const activeId = useWorkspaceStore((s) => s.activeId)

  if (tabs.length <= 1) return null

  return (
    <div className="tab-bar" role="tablist">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeId}
          className={`tab-bar__tab${tab.id === activeId ? ' tab-bar__tab--active' : ''}${tab.dirty ? ' tab-bar__tab--dirty' : ''}`}
          title={tab.path ?? t('file.untitled')}
          onClick={() => useWorkspaceStore.getState().activateTab(tab.id)}
          onAuxClick={(e) => {
            if (e.button === 1) {
              e.preventDefault()
              void useWorkspaceStore.getState().closeTab(tab.id)
            }
          }}
        >
          <span className="tab-bar__name">{tab.path ? basename(tab.path) : t('file.untitled')}</span>
          {tab.dirty ? (
            <span className="tab-bar__dot tab-bar__dot--dirty" />
          ) : tab.savedFlash ? (
            <span className="tab-bar__tick" aria-hidden>✓</span>
          ) : (
            <span className="tab-bar__dot" />
          )}
          <button
            type="button"
            className="tab-bar__close"
            aria-label={t('tab.close')}
            onClick={(e) => {
              e.stopPropagation()
              void useWorkspaceStore.getState().closeTab(tab.id)
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
