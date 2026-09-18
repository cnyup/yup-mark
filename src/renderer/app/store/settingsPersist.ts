/** 设置持久化与解析（纯函数，无副作用依赖；供 i18n 初始化与 appSettings 共用） */

export type ThemeMode =
  | 'auto'
  | 'yup'
  | 'github'
  | 'notion'
  | 'newsprint'
  | 'purple'
  | 'github-dark'
  | 'dracula'
export type LocaleMode = 'auto' | 'zh-CN' | 'en-US'

export const THEME_OPTIONS: ThemeMode[] = [
  'auto',
  'yup',
  'github',
  'notion',
  'newsprint',
  'purple',
  'github-dark',
  'dracula',
]
export const LOCALE_OPTIONS: LocaleMode[] = ['auto', 'zh-CN', 'en-US']

/** 编辑器字体：null = 跟随主题 */
export interface EditorFont {
  /** CSS font-family 值；null 跟随主题（--content-font） */
  family: string | null
  /** 正文字号 px；null 跟随默认 17px */
  size: number | null
}

export const EDITOR_FONT_MIN = 12
export const EDITOR_FONT_MAX = 24

const STORAGE_KEY = 'yupmark-settings'

export interface PersistedSettings {
  themeMode: ThemeMode
  localeMode: LocaleMode
  /** 显式覆盖的快捷键（id → CM6 键位串）；未知 id 读取时被忽略 */
  keybindings?: Record<string, string>
  editorFont?: EditorFont
}

export function readPersisted(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedSettings>
      const font = parsed.editorFont
      return {
        themeMode: THEME_OPTIONS.includes(parsed.themeMode as ThemeMode)
          ? (parsed.themeMode as ThemeMode)
          : 'auto',
        localeMode: LOCALE_OPTIONS.includes(parsed.localeMode as LocaleMode)
          ? (parsed.localeMode as LocaleMode)
          : 'auto',
        keybindings:
          parsed.keybindings && typeof parsed.keybindings === 'object'
            ? Object.fromEntries(
                Object.entries(parsed.keybindings).filter(([, v]) => typeof v === 'string'),
              )
            : {},
        editorFont: {
          family: typeof font?.family === 'string' ? font.family : null,
          size:
            typeof font?.size === 'number'
              ? Math.min(EDITOR_FONT_MAX, Math.max(EDITOR_FONT_MIN, Math.round(font.size)))
              : null,
        },
      }
    }
  } catch {
    // 忽略损坏的存储
  }
  return { themeMode: 'auto', localeMode: 'auto', keybindings: {}, editorFont: { family: null, size: null } }
}

export function persistSettings(settings: PersistedSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // 存储不可用不影响运行
  }
}

export function systemPrefersDark(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
}

export function systemLocale(): string {
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

export function resolveTheme(mode: ThemeMode): string {
  if (mode === 'auto') return systemPrefersDark() ? 'github-dark' : 'yup'
  return mode
}

export function resolveLocale(mode: LocaleMode): string {
  return mode === 'auto' ? systemLocale() : mode
}
