import { useState } from 'react'
import { useTranslation } from 'react-i18next'

/** 单输入弹窗（新建/重命名共用） */
export function PromptModal({
  title,
  initial,
  onConfirm,
  onCancel,
}: {
  title: string
  initial: string
  onConfirm: (value: string) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState(initial)

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal__title">{title}</div>
        <input
          className="modal__input"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onConfirm(value)
            if (e.key === 'Escape') onCancel()
          }}
        />
        <div className="modal__actions">
          <button type="button" className="modal__btn" onClick={onCancel}>{t('prompt.cancel')}</button>
          <button type="button" className="modal__btn modal__btn--primary" onClick={() => onConfirm(value)}>
            {t('prompt.ok')}
          </button>
        </div>
      </div>
    </div>
  )
}
