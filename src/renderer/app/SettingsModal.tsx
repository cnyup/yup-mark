import { useTranslation } from 'react-i18next'
import { Modal } from './ui/Modal'
import {
  LOCALE_OPTIONS,
  THEME_OPTIONS,
  useAppSettings,
  type LocaleMode,
  type ThemeMode,
} from './store/appSettings'

const THEME_LABELS: Record<ThemeMode, string> = {
  auto: 'settings.theme.auto',
  yup: 'Yup 玫粉（默认）',
  github: 'GitHub 蓝',
  notion: 'Notion 墨黑',
  newsprint: 'Newsprint 报纸',
  purple: '静谧紫',
  'github-dark': 'GitHub Dark',
  dracula: 'Dracula',
}

/** 偏好设置（⌘,）：主题 / 语言 */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const themeMode = useAppSettings((s) => s.themeMode)
  const localeMode = useAppSettings((s) => s.localeMode)
  const setThemeMode = useAppSettings((s) => s.setThemeMode)
  const setLocaleMode = useAppSettings((s) => s.setLocaleMode)

  return (
    <Modal onClose={onClose}>
      <div className="modal__title">{t('settings.title')}</div>

      <label className="settings__label">
        {t('settings.theme')}
        <select
          className="settings__select"
          value={themeMode}
          onChange={(e) => setThemeMode(e.target.value as ThemeMode)}
        >
          {THEME_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt === 'auto' ? t(THEME_LABELS[opt]) : THEME_LABELS[opt]}
            </option>
          ))}
        </select>
      </label>

      <label className="settings__label">
        {t('settings.language')}
        <select
          className="settings__select"
          value={localeMode}
          onChange={(e) => setLocaleMode(e.target.value as LocaleMode)}
        >
          {LOCALE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt === 'auto'
                ? t('settings.language.auto')
                : opt === 'zh-CN'
                  ? '简体中文'
                  : 'English'}
            </option>
          ))}
        </select>
      </label>

      <div className="modal__actions">
        <button type="button" className="modal__btn modal__btn--primary" onClick={onClose}>
          {t('prompt.ok')}
        </button>
      </div>
    </Modal>
  )
}
