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

const STORAGE_KEY = 'yupmark-settings'

export interface PersistedSettings {
  themeMode: ThemeMode
  localeMode: LocaleMode
}

export function readPersisted(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedSettings>
      return {
        themeMode: THEME_OPTIONS.includes(parsed.themeMode as ThemeMode)
          ? (parsed.themeMode as ThemeMode)
          : 'auto',
        localeMode: LOCALE_OPTIONS.includes(parsed.localeMode as LocaleMode)
          ? (parsed.localeMode as LocaleMode)
          : 'auto',
      }
    }
  } catch {
    // 忽略损坏的存储
  }
  return { themeMode: 'auto', localeMode: 'auto' }
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
