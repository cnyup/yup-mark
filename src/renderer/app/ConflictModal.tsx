import { useTranslation } from 'react-i18next'
import { basename } from '@yupmark/live-cm/paths'
import { useWorkspaceStore } from './store/workspaceStore'

/** 外部修改 vs 本地未保存 的冲突三选一（设计 §4.3；"对比"视图后置） */
export function ConflictModal() {
  const { t } = useTranslation()
  const conflict = useWorkspaceStore((s) => s.conflict)
  if (!conflict) return null

  const name = conflict.tabPath ? basename(conflict.tabPath) : t('file.untitled')

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal__title">{t('conflict.title', { name })}</div>
        <p className="modal__text">{t('conflict.message')}</p>
        <div className="modal__actions modal__actions--column">
          <button
            type="button"
            className="modal__btn modal__btn--primary"
            onClick={() => void useWorkspaceStore.getState().resolveConflict('keep-mine')}
          >
            {t('conflict.keepMine')}
          </button>
          <button type="button" className="modal__btn" onClick={() => void useWorkspaceStore.getState().resolveConflict('load-disk')}>
            {t('conflict.loadDisk')}
          </button>
          <button type="button" className="modal__btn modal__btn--plain" onClick={() => void useWorkspaceStore.getState().resolveConflict('later')}>
            {t('conflict.later')}
          </button>
        </div>
      </div>
    </div>
  )
}
