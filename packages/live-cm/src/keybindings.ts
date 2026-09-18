/**
 * 可重绑命令注册表：编辑器命令的 id/默认键/分组/i18n 标签。
 * - 默认键与 Typora 官方对齐（双平台），引擎按注册表构建键位（engine.buildTableAndFormatKeys）
 * - 覆盖只存显式改动（渲染层持久化），缺省回落平台默认
 * - APP_前缀组之外的命令属编辑器；应用级命令（面板切换等）由外壳自行消费此表
 */
import { IS_MAC } from './platform'

export type CommandGroup = 'find' | 'edit' | 'view' | 'format' | 'insert' | 'paragraph' | 'list'

export interface RebindableCommand {
  id: string
  /** mac 默认键（CM6 keymap 语法） */
  mac: string
  /** Windows/Linux 默认键 */
  win: string
  /** i18n 标签键（zh-CN/en-US 资源里） */
  labelKey: string
  group: CommandGroup
}

export const EDITOR_COMMANDS: RebindableCommand[] = [
  // 查找
  { id: 'find.open', mac: 'Mod-f', win: 'Mod-f', labelKey: 'cmd.find.open', group: 'find' },
  { id: 'find.replace', mac: 'Mod-Alt-f', win: 'Mod-h', labelKey: 'cmd.find.replace', group: 'find' },
  // 编辑组
  { id: 'edit.heading-up', mac: 'Mod-=', win: 'Mod-=', labelKey: 'cmd.edit.headingUp', group: 'edit' },
  { id: 'edit.heading-down', mac: 'Mod--', win: 'Mod--', labelKey: 'cmd.edit.headingDown', group: 'edit' },
  { id: 'edit.select-line', mac: 'Mod-l', win: 'Mod-l', labelKey: 'cmd.edit.selectLine', group: 'edit' },
  { id: 'edit.select-word', mac: 'Mod-d', win: 'Mod-d', labelKey: 'cmd.edit.selectWord', group: 'edit' },
  { id: 'edit.delete-word', mac: 'Mod-Shift-d', win: 'Mod-Shift-d', labelKey: 'cmd.edit.deleteWord', group: 'edit' },
  { id: 'edit.jump-selection', mac: 'Mod-j', win: 'Mod-j', labelKey: 'cmd.edit.jumpSelection', group: 'edit' },
  // 视图三件套
  { id: 'view.source', mac: 'Mod-/', win: 'Mod-/', labelKey: 'cmd.view.source', group: 'view' },
  { id: 'view.focus', mac: 'F8', win: 'F8', labelKey: 'cmd.view.focus', group: 'view' },
  { id: 'view.typewriter', mac: 'F9', win: 'F9', labelKey: 'cmd.view.typewriter', group: 'view' },
  // 格式组
  { id: 'format.bold', mac: 'Mod-b', win: 'Mod-b', labelKey: 'cmd.format.bold', group: 'format' },
  { id: 'format.italic', mac: 'Mod-i', win: 'Mod-i', labelKey: 'cmd.format.italic', group: 'format' },
  { id: 'format.code', mac: 'Mod-Shift-`', win: 'Mod-Shift-`', labelKey: 'cmd.format.code', group: 'format' },
  { id: 'format.strike', mac: 'Control-Shift-`', win: 'Alt-Shift-5', labelKey: 'cmd.format.strike', group: 'format' },
  { id: 'format.link', mac: 'Mod-k', win: 'Mod-k', labelKey: 'cmd.format.link', group: 'format' },
  { id: 'format.image', mac: 'Control-Mod-i', win: 'Mod-Shift-i', labelKey: 'cmd.format.image', group: 'format' },
  { id: 'format.clear', mac: 'Mod-\\', win: 'Mod-\\', labelKey: 'cmd.format.clear', group: 'format' },
  // 插入组
  { id: 'insert.code', mac: 'Mod-Alt-c', win: 'Mod-Shift-k', labelKey: 'cmd.insert.code', group: 'insert' },
  { id: 'insert.math', mac: 'Mod-Alt-b', win: 'Mod-Shift-m', labelKey: 'cmd.insert.math', group: 'insert' },
  { id: 'insert.table', mac: 'Mod-Alt-t', win: 'Mod-t', labelKey: 'cmd.insert.table', group: 'insert' },
  // 列表/引用/任务
  { id: 'list.ul', mac: 'Mod-Alt-u', win: 'Mod-Shift-]', labelKey: 'cmd.list.ul', group: 'list' },
  { id: 'list.ol', mac: 'Mod-Alt-o', win: 'Mod-Shift-[', labelKey: 'cmd.list.ol', group: 'list' },
  { id: 'list.quote', mac: 'Mod-Alt-q', win: 'Mod-Shift-q', labelKey: 'cmd.list.quote', group: 'list' },
  { id: 'list.task', mac: 'Mod-Alt-x', win: 'Mod-Shift-x', labelKey: 'cmd.list.task', group: 'list' },
  // 段落/标题
  { id: 'paragraph.body', mac: 'Mod-0', win: 'Mod-0', labelKey: 'cmd.paragraph.body', group: 'paragraph' },
  { id: 'paragraph.h1', mac: 'Mod-1', win: 'Mod-1', labelKey: 'cmd.paragraph.h1', group: 'paragraph' },
  { id: 'paragraph.h2', mac: 'Mod-2', win: 'Mod-2', labelKey: 'cmd.paragraph.h2', group: 'paragraph' },
  { id: 'paragraph.h3', mac: 'Mod-3', win: 'Mod-3', labelKey: 'cmd.paragraph.h3', group: 'paragraph' },
  { id: 'paragraph.h4', mac: 'Mod-4', win: 'Mod-4', labelKey: 'cmd.paragraph.h4', group: 'paragraph' },
  { id: 'paragraph.h5', mac: 'Mod-5', win: 'Mod-5', labelKey: 'cmd.paragraph.h5', group: 'paragraph' },
  { id: 'paragraph.h6', mac: 'Mod-6', win: 'Mod-6', labelKey: 'cmd.paragraph.h6', group: 'paragraph' },
]

export function defaultKeyOf(cmd: RebindableCommand, isMac = IS_MAC): string {
  return isMac ? cmd.mac : cmd.win
}

/** 生效键位表（id → key）：默认 + 显式覆盖（未知 id 的覆盖被忽略） */
export function effectiveBindings(overrides: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const cmd of EDITOR_COMMANDS) out[cmd.id] = defaultKeyOf(cmd)
  if (overrides) {
    for (const cmd of EDITOR_COMMANDS) {
      const v = overrides[cmd.id]
      if (typeof v === 'string' && v.trim() !== '') out[cmd.id] = v.trim()
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// 键位字符串 ↔ 键盘事件（应用级快捷键消费；CM6 编辑器键位由 keymap 自行解析）
// ---------------------------------------------------------------------------

const DISPLAY: Record<string, string> = {
  Mod: '⌘/Ctrl',
  Ctrl: '⌃',
  Alt: '⌥/Alt',
  Shift: '⇧',
}

/** 键位串显示化（Mod-f → "⌘/Ctrl F"）；供设置页与人读 */
export function prettyKey(key: string, isMac = IS_MAC): string {
  const parts = key.split('-')
  const main = parts.pop() as string
  const mods = parts.map((m) => (isMac ? { Mod: '⌘', Alt: '⌥', Shift: '⇧', Ctrl: '⌃' }[m] ?? m : { Mod: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Ctrl: 'Ctrl' }[m] ?? m))
  const shown = isMac ? mods.join('') : mods.length > 0 ? `${mods.join('+')}+` : ''
  return `${shown}${main.length === 1 ? main.toUpperCase() : main}`
}

/** 主键名归一：事件 code（Digit1/KeyF/F8/Backquote…）→ CM6 风格主键 */
function mainKeyOf(event: KeyboardEvent): string | null {
  const code = event.code
  if (!code) return null
  if (/^Digit(\d)$/.test(code)) return code.slice(5)
  if (/^Key([A-Z])$/.test(code)) return code.slice(3).toLowerCase()
  if (/^F(\d{1,2})$/.test(code)) return code
  const named: Record<string, string> = {
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
  }
  return named[code] ?? null
}

/** 键盘事件 → 键位串（捕获新绑定时用）；纯修饰键按下返回 null（等待主键） */
export function comboFromEvent(event: KeyboardEvent): string | null {
  const main = mainKeyOf(event)
  if (!main) return null
  const parts: string[] = []
  if (event.metaKey || event.ctrlKey) parts.push('Mod')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey && (main.length > 1 || event.metaKey || event.ctrlKey || event.altKey)) parts.push('Shift')
  if (parts.length === 0 && /^[a-z0-9]$/i.test(main)) {
    // 裸字母/数字会吃掉正文输入，要求至少一个修饰；裸功能键（F8 等）允许
    return null
  }
  return parts.length > 0 ? `${parts.join('-')}-${main}` : main
}

/** 事件是否命中键位串（应用级快捷键匹配） */
export function matchesBinding(event: KeyboardEvent, key: string, isMac = IS_MAC): boolean {
  const parts = key.split('-')
  const main = parts.pop() as string
  const needMod = parts.includes('Mod')
  const needCtrl = parts.includes('Ctrl')
  const needAlt = parts.includes('Alt')
  const needShift = parts.includes('Shift')
  const modDown = isMac ? event.metaKey : event.ctrlKey
  if (needMod !== modDown) return false
  // Mac 上 Ctrl 是独立修饰；非 mac 平台 Ctrl 已并入 Mod 判断
  if (needCtrl && !(isMac ? event.ctrlKey : event.ctrlKey)) return false
  if (needCtrl && needMod && !isMac) return false
  if (needAlt !== event.altKey) return false
  if (needShift !== event.shiftKey) return false
  return mainKeyOf(event) === main
}

export { DISPLAY }
