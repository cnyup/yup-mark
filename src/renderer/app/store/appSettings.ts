/**
 * 应用级设置：主题与语言（持久化在 localStorage，见 settingsPersist）。
 * 主题 auto 模式：亮 = yup（默认），暗 = github-dark，跟随系统切换。
 */
import { create } from 'zustand'
import i18next from 'i18next'
import { setMermaidTheme } from '@yupmark/live-cm/widgets'
import {
  persistSettings,
  readPersisted,
  resolveLocale,
  resolveTheme,
  type LocaleMode,
  type ThemeMode,
} from './settingsPersist'

export { THEME_OPTIONS, LOCALE_OPTIONS } from './settingsPersist'
export type { ThemeMode, LocaleMode } from './settingsPersist'

interface AppSettingsStore {
  themeMode: ThemeMode
  localeMode: LocaleMode
  resolvedTheme: string
  resolvedLocale: string
  setThemeMode(mode: ThemeMode): void
  setLocaleMode(mode: LocaleMode): void
}

function applyAll(theme: string, locale: string): void {
  document.documentElement.dataset.theme = theme
  setMermaidTheme(theme === 'github-dark' || theme === 'dracula' ? 'dark' : 'default')
  // i18next 初始化期间不切语言（初始 lng 已按持久化设置传入）
  if (i18next.isInitialized) {
    void i18next.changeLanguage(locale)
  }
  // 原生菜单语言（主进程侧重建）
  void window.yupmark?.setLanguage?.(locale === 'zh-CN' ? 'zh' : 'en')
}

const initial = readPersisted()

export const useAppSettings = create<AppSettingsStore>((set, get) => ({
  themeMode: initial.themeMode,
  localeMode: initial.localeMode,
  resolvedTheme: resolveTheme(initial.themeMode),
  resolvedLocale: resolveLocale(initial.localeMode),

  setThemeMode: (mode) => {
    const theme = resolveTheme(mode)
    persistSettings({ themeMode: mode, localeMode: get().localeMode })
    set({ themeMode: mode, resolvedTheme: theme })
    applyAll(theme, get().resolvedLocale)
  },

  setLocaleMode: (mode) => {
    const locale = resolveLocale(mode)
    persistSettings({ themeMode: get().themeMode, localeMode: mode })
    set({ localeMode: mode, resolvedLocale: locale })
    applyAll(get().resolvedTheme, locale)
  },
}))

/** 应用启动时调用（main.tsx 已先用轻量路径设置 data-theme，此处做完整初始化 + 系统亮暗监听） */
export function initAppSettings(): void {
  const s = useAppSettings.getState()
  applyAll(s.resolvedTheme, s.resolvedLocale)

  if (typeof matchMedia !== 'undefined') {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', () => {
      const cur = useAppSettings.getState()
      if (cur.themeMode === 'auto') {
        const theme = resolveTheme('auto')
        useAppSettings.setState({ resolvedTheme: theme })
        applyAll(theme, cur.resolvedLocale)
      }
    })
  }
}
