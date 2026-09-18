import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EDITOR_COMMANDS, comboFromEvent, effectiveBindings, prettyKey, type CommandGroup } from '@yupmark/live-cm/keybindings'
import { IS_MAC } from '@yupmark/live-cm/platform'
import {
  APP_COMMANDS,
  EDITOR_FONT_MAX,
  EDITOR_FONT_MIN,
  LOCALE_OPTIONS,
  THEME_OPTIONS,
  useAppSettings,
} from './store/appSettings'
import { IconSettings } from './icons'

const GROUP_ORDER: CommandGroup[] = ['find', 'edit', 'view', 'format', 'insert', 'list', 'paragraph']

/** 字体预设（跨平台通用栈；跟随主题 = 不覆盖 --content-font） */
const FONT_PRESETS: { value: string | null; labelKey: string }[] = [
  { value: null, labelKey: 'settings.font.theme' },
  { value: "-apple-system, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif", labelKey: 'settings.font.sans' },
  { value: "'Songti SC', 'SimSun', Georgia, 'Times New Roman', serif", labelKey: 'settings.font.serif' },
  { value: "'Kaiti SC', 'KaiTi', 'STKaiti', cursive", labelKey: 'settings.font.kai' },
  { value: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace", labelKey: 'settings.font.mono' },
]

interface BindingRow {
  id: string
  label: string
  key: string
  overridden: boolean
  group: CommandGroup | 'app'
}

/** 设置页：主题 / 语言 / 字体 / 快捷键（查看 + 重绑）。替代原 ⌘, 弹窗 */
export function SettingsPage() {
  const { t } = useTranslation()
  const themeMode = useAppSettings((s) => s.themeMode)
  const localeMode = useAppSettings((s) => s.localeMode)
  const setThemeMode = useAppSettings((s) => s.setThemeMode)
  const setLocaleMode = useAppSettings((s) => s.setLocaleMode)
  const editorFont = useAppSettings((s) => s.editorFont)
  const setEditorFont = useAppSettings((s) => s.setEditorFont)
  const keybindings = useAppSettings((s) => s.keybindings)
  const setKeybinding = useAppSettings((s) => s.setKeybinding)
  const resetAllKeybindings = useAppSettings((s) => s.resetAllKeybindings)
  const close = useAppSettings((s) => s.closeSettingsPage)

  const [capturing, setCapturing] = useState<string | null>(null)
  const [hint, setHint] = useState<{ id: string; text: string } | null>(null)

  const effective = useMemo(() => effectiveBindings(keybindings), [keybindings])

  const rows: BindingRow[] = useMemo(() => {
    const editor = EDITOR_COMMANDS.map((cmd) => ({
      id: cmd.id,
      label: t(cmd.labelKey),
      key: effective[cmd.id] ?? cmd.mac,
      overridden: keybindings[cmd.id] !== undefined,
      group: cmd.group,
    }))
    const app = APP_COMMANDS.map((cmd) => ({
      id: cmd.id,
      label: t(cmd.labelKey),
      key: keybindings[cmd.id] ?? (IS_MAC ? cmd.mac : cmd.win),
      overridden: keybindings[cmd.id] !== undefined,
      group: 'app' as const,
    }))
    return [...editor, ...app]
  }, [effective, keybindings, t])

  // 捕获模式：全局吞键（含 Esc 取消）
  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapturing(null)
        return
      }
      const combo = comboFromEvent(e)
      if (!combo) return // 纯修饰键，继续等主键
      const displaced = setKeybinding(capturing, combo)
      setCapturing(null)
      if (displaced) setHint({ id: capturing, text: t('settings.keys.displaced', { combo: prettyKey(combo) }) })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturing, setKeybinding, t])

  // Esc 关闭设置页（未在捕获态时）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const fontPresetValue =
    FONT_PRESETS.find((p) => p.value === editorFont.family)?.value ?? (editorFont.family ? '__custom__' : null)

  return (
    <div className="settings-page">
      <header className="settings-page__header">
        <IconSettings size={15} />
        <span className="settings-page__title">{t('settings.title')}</span>
        <button type="button" className="settings-page__back" onClick={close}>
          {t('settings.back')}
        </button>
      </header>

      <div className="settings-page__body">
        <section className="settings-section">
          <div className="settings-section__title">{t('settings.appearance')}</div>
          <label className="settings-section__row">
            <span>{t('settings.theme')}</span>
            <select
              className="settings__select"
              value={themeMode}
              onChange={(e) => setThemeMode(e.target.value as typeof themeMode)}
            >
              {THEME_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === 'auto' ? t('settings.theme.auto') : themeLabel(opt)}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-section__row">
            <span>{t('settings.language')}</span>
            <select
              className="settings__select"
              value={localeMode}
              onChange={(e) => setLocaleMode(e.target.value as typeof localeMode)}
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
        </section>

        <section className="settings-section">
          <div className="settings-section__title">{t('settings.font.title')}</div>
          <label className="settings-section__row">
            <span>{t('settings.font.family')}</span>
            <select
              className="settings__select"
              value={fontPresetValue ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setEditorFont({ family: v === '' || v === '__custom__' ? null : v })
              }}
            >
              {FONT_PRESETS.map((p) => (
                <option key={p.labelKey} value={p.value ?? ''}>
                  {t(p.labelKey)}
                </option>
              ))}
              {fontPresetValue === '__custom__' ? <option value="__custom__">{t('settings.font.custom')}</option> : null}
            </select>
          </label>
          <div className="settings-section__row">
            <span>{t('settings.font.size')}</span>
            <span className="settings-font-size">
              <input
                type="range"
                min={EDITOR_FONT_MIN}
                max={EDITOR_FONT_MAX}
                step={1}
                value={editorFont.size ?? 17}
                onChange={(e) => setEditorFont({ size: Number(e.target.value) })}
                aria-label={t('settings.font.size')}
              />
              <span className="settings-font-size__value">{editorFont.size ?? 17}px</span>
              <button
                type="button"
                className="settings-link-btn"
                onClick={() => setEditorFont({ size: null })}
              >
                {t('settings.font.reset')}
              </button>
            </span>
          </div>
          <div className="settings-font-preview">{t('settings.font.preview')}</div>
        </section>

        <section className="settings-section">
          <div className="settings-section__title">
            {t('settings.keys.title')}
            <button type="button" className="settings-link-btn" onClick={resetAllKeybindings}>
              {t('settings.keys.resetAll')}
            </button>
          </div>
          <p className="settings-section__note">{t('settings.keys.note')}</p>
          {GROUP_ORDER.map((group) => {
            const list = rows.filter((r) => r.group === group)
            if (list.length === 0) return null
            return (
              <div key={group} className="settings-keys-group">
                <div className="settings-keys-group__name">{t(`settings.keys.group.${group}`)}</div>
                {list.map((row) => (
                  <KeyRow
                    key={row.id}
                    row={row}
                    capturing={capturing === row.id}
                    hint={hint?.id === row.id ? hint.text : null}
                    onCapture={() => setCapturing(row.id)}
                    onReset={() => {
                      setKeybinding(row.id, null)
                      setHint(null)
                    }}
                  />
                ))}
              </div>
            )
          })}
          <div className="settings-keys-group">
            <div className="settings-keys-group__name">{t('settings.keys.group.app')}</div>
            {rows
              .filter((r) => r.group === 'app')
              .map((row) => (
                <KeyRow
                  key={row.id}
                  row={row}
                  capturing={capturing === row.id}
                  hint={hint?.id === row.id ? hint.text : null}
                  onCapture={() => setCapturing(row.id)}
                  onReset={() => {
                    setKeybinding(row.id, null)
                    setHint(null)
                  }}
                />
              ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function KeyRow({
  row,
  capturing,
  hint,
  onCapture,
  onReset,
}: {
  row: BindingRow
  capturing: boolean
  hint: string | null
  onCapture: () => void
  onReset: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className={`settings-key${capturing ? ' settings-key--capturing' : ''}`}>
      <span className="settings-key__label">{row.label}</span>
      <span className="settings-key__right">
        {hint ? <span className="settings-key__hint">{hint}</span> : null}
        <kbd className="settings-key__kbd">{capturing ? t('settings.keys.pressing') : prettyKey(row.key)}</kbd>
        <button type="button" className="settings-link-btn" onClick={onCapture}>
          {t('settings.keys.change')}
        </button>
        {row.overridden ? (
          <button type="button" className="settings-link-btn" onClick={onReset}>
            {t('settings.keys.reset')}
          </button>
        ) : null}
      </span>
    </div>
  )
}

/** 主题下拉文案（沿用旧设置弹窗的双语标签） */
function themeLabel(mode: string): string {
  const labels: Record<string, string> = {
    yup: 'Yup 玫粉（默认）',
    github: 'GitHub 蓝',
    notion: 'Notion 墨黑',
    newsprint: 'Newsprint 报纸',
    purple: '静谧紫',
    'github-dark': 'GitHub Dark',
    dracula: 'Dracula',
  }
  return labels[mode] ?? mode
}
