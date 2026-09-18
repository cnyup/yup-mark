/**
 * 应用级设置：主题、语言、编辑器字体、快捷键覆盖、设置页开合（持久化在 localStorage，见 settingsPersist）。
 * 主题 auto 模式：亮 = yup（默认），暗 = github-dark，跟随系统切换。
 * 快捷键：仅存显式覆盖；生效键位 = 内核注册表默认 + 覆盖（EditorHost 经 Compartment 热重配）。
 */
import { create } from 'zustand'
import i18next from 'i18next'
import { setMermaidTheme } from '@yupmark/live-cm/widgets'
import { setEditorMenuLabels, type EditorMenuLabelKey } from '@yupmark/live-cm/contextMenu'
import zhCN from '../../i18n/zh-CN'
import enUS from '../../i18n/en-US'
import { EDITOR_COMMANDS, effectiveBindings } from '@yupmark/live-cm/keybindings'
import {
  persistSettings,
  readPersisted,
  resolveLocale,
  resolveTheme,
  type EditorFont,
  type LocaleMode,
  type ThemeMode,
} from './settingsPersist'

export { THEME_OPTIONS, LOCALE_OPTIONS, EDITOR_FONT_MIN, EDITOR_FONT_MAX } from './settingsPersist'
export type { ThemeMode, LocaleMode, EditorFont } from './settingsPersist'

interface AppSettingsStore {
  themeMode: ThemeMode
  localeMode: LocaleMode
  resolvedTheme: string
  resolvedLocale: string
  /** 显式覆盖（id → 键位串）；undefined = 用默认 */
  keybindings: Record<string, string>
  editorFont: EditorFont
  /** 设置页（替代原 ⌘, 弹窗） */
  settingsPageOpen: boolean
  setThemeMode(mode: ThemeMode): void
  setLocaleMode(mode: LocaleMode): void
  setEditorFont(patch: Partial<EditorFont>): void
  /**
   * 设置/重置命令键位；combo = null 恢复默认。
   * 返回被挤掉的命令 id（冲突时自动让位，调用方提示），无冲突返回 null。
   */
  setKeybinding(id: string, combo: string | null): string | null
  resetAllKeybindings(): void
  openSettingsPage(): void
  closeSettingsPage(): void
}

/** 编辑器右键菜单文案（内核零 i18n，外壳按语言注入；表头列前缀一并换） */
function applyEditorMenuLabels(locale: string): void {
  const dict = (locale === 'zh-CN' ? zhCN : enUS).editorMenu as Record<EditorMenuLabelKey, string>
  setEditorMenuLabels(dict, locale === 'zh-CN' ? '列' : 'Col ')
}

function applyAll(theme: string, locale: string): void {
  document.documentElement.dataset.theme = theme
  setMermaidTheme(theme === 'github-dark' || theme === 'dracula' ? 'dark' : 'default')
  applyEditorMenuLabels(locale)
  // i18next 初始化期间不切语言（初始 lng 已按持久化设置传入）
  if (i18next.isInitialized) {
    void i18next.changeLanguage(locale)
  }
  // 原生菜单语言（宿主侧重建）
  void window.yupmark?.setLanguage?.(locale === 'zh-CN' ? 'zh' : 'en')
}

/** 字体即时生效：行内覆盖 :root 变量（主题的 --content-font 让位给用户显式选择） */
function applyFont(font: EditorFont): void {
  const root = document.documentElement
  if (font.family) root.style.setProperty('--content-font', font.family)
  else root.style.removeProperty('--content-font')
  if (font.size) root.style.setProperty('--editor-font-size', `${font.size}px`)
  else root.style.removeProperty('--editor-font-size')
}

const initial = readPersisted()

/** 当前生效键位（含默认）——workspaceStore 建 tab 状态 / 设置页展示共用 */
export function currentBindings(): Record<string, string> {
  return effectiveBindings(useAppSettings.getState().keybindings)
}

export const useAppSettings = create<AppSettingsStore>((set, get) => ({
  themeMode: initial.themeMode,
  localeMode: initial.localeMode,
  resolvedTheme: resolveTheme(initial.themeMode),
  resolvedLocale: resolveLocale(initial.localeMode),
  keybindings: initial.keybindings ?? {},
  editorFont: initial.editorFont ?? { family: null, size: null },
  settingsPageOpen: false,

  setThemeMode: (mode) => {
    const theme = resolveTheme(mode)
    persistSettings({ ...readShape(get()), themeMode: mode })
    set({ themeMode: mode, resolvedTheme: theme })
    applyAll(theme, get().resolvedLocale)
  },

  setLocaleMode: (mode) => {
    const locale = resolveLocale(mode)
    persistSettings({ ...readShape(get()), localeMode: mode })
    set({ localeMode: mode, resolvedLocale: locale })
    applyAll(get().resolvedTheme, locale)
  },

  setEditorFont: (patch) => {
    const font = { ...get().editorFont, ...patch }
    persistSettings({ ...readShape(get()), editorFont: font })
    set({ editorFont: font })
    applyFont(font)
  },

  setKeybinding: (id, combo) => {
    const prev = { ...get().keybindings }
    let displaced: string | null = null
    if (combo === null) {
      delete prev[id]
    } else {
      // 冲突让位：同键位已有其他命令 → 该命令回默认（若其默认恰好又是别的键，链式让位不做，展示层提示）
      const eff = effectiveBindings(prev)
      for (const [otherId, otherKey] of Object.entries(eff)) {
        if (otherId !== id && otherKey === combo) {
          delete prev[otherId]
          displaced = otherId
        }
      }
      prev[id] = combo
    }
    persistSettings({ ...readShape(get()), keybindings: prev })
    set({ keybindings: prev })
    return displaced
  },

  resetAllKeybindings: () => {
    persistSettings({ ...readShape(get()), keybindings: {} })
    set({ keybindings: {} })
  },

  openSettingsPage: () => set({ settingsPageOpen: true }),
  closeSettingsPage: () => set({ settingsPageOpen: false }),
}))

/** 当前 store 状态 → 持久化形状（persistSettings 的输入） */
function readShape(s: Pick<AppSettingsStore, 'themeMode' | 'localeMode' | 'keybindings' | 'editorFont'>) {
  return {
    themeMode: s.themeMode,
    localeMode: s.localeMode,
    keybindings: s.keybindings,
    editorFont: s.editorFont,
  }
}

/** 应用启动时调用（main.tsx 已先用轻量路径设置 data-theme，此处做完整初始化 + 系统亮暗监听） */
export function initAppSettings(): void {
  const s = useAppSettings.getState()
  applyAll(s.resolvedTheme, s.resolvedLocale)
  applyFont(s.editorFont)

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

/** 设置页展示用：命令注册表（编辑器组） */
export { EDITOR_COMMANDS }

/** 应用级（非内核注册表）可重绑命令：侧栏面板切换；App.tsx 消费、设置页展示 */
export const APP_COMMANDS = [
  { id: 'app.panel-outline', mac: 'Control-Mod-1', win: 'Mod-Shift-1', labelKey: 'cmd.app.panelOutline' },
  { id: 'app.panel-files', mac: 'Control-Mod-3', win: 'Mod-Shift-3', labelKey: 'cmd.app.panelFiles' },
] as const
