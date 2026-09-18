import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from './ui/Modal'

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
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <Modal onClose={onCancel} initialFocus={inputRef}>
      <div className="modal__title">{title}</div>
      <input
        ref={inputRef}
        className="modal__input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onConfirm(value)
        }}
      />
      <div className="modal__actions">
        <button type="button" className="modal__btn" onClick={onCancel}>{t('prompt.cancel')}</button>
        <button type="button" className="modal__btn modal__btn--primary" onClick={() => onConfirm(value)}>
          {t('prompt.ok')}
        </button>
      </div>
    </Modal>
  )
}
