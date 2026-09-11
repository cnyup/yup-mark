/**
 * 状态持久化（MT4，TUI.md §9-MT4）：打开的标签 + 主题/语言 → 用户配置目录。
 * 桌面对齐语义（DESIGN §4.3 会话恢复）；文件 ~/.config/yupmark/tui.json。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ThemeName } from './theme'
import type { Lang } from './i18n'

export interface TuiPersistState {
  version: 1
  theme: ThemeName
  lang: Lang
  /** 恢复的文件路径列表（仅磁盘文件） */
  openTabs: string[]
  /** 工作区根（目录模式） */
  rootDir: string | null
}

export function stateFilePath(): string {
  return join(homedir(), '.config', 'yupmark', 'tui.json')
}

export function loadState(): TuiPersistState | null {
  try {
    const raw = readFileSync(stateFilePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<TuiPersistState>
    if (parsed.version !== 1) return null
    return {
      version: 1,
      theme: (parsed.theme ?? 'yup') as ThemeName,
      lang: (parsed.lang ?? 'zh-CN') as Lang,
      openTabs: Array.isArray(parsed.openTabs) ? parsed.openTabs.filter((p) => typeof p === 'string') : [],
      rootDir: typeof parsed.rootDir === 'string' ? parsed.rootDir : null,
    }
  } catch {
    return null
  }
}

export function saveState(state: TuiPersistState): boolean {
  try {
    const dir = join(homedir(), '.config', 'yupmark')
    mkdirSync(dir, { recursive: true })
    writeFileSync(stateFilePath(), JSON.stringify(state, null, 2), 'utf8')
    return true
  } catch {
    return false
  }
}
