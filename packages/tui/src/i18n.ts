/**
 * i18n（MT4，TUI.md §8）：zh-CN 默认 + en-US；LANG 环境探测 + 设置覆盖。
 * 键集为 TUI 实际 UI 字符串（与桌面键集独立——界面结构不同）。
 */
export type Lang = 'zh-CN' | 'en-US'

type Dict = Record<string, string>

const zh: Dict = {
  'hint.find': '查找',
  'hint.replace': '替换',
  'hint.outline': '大纲',
  'hint.source': '源码',
  'hint.focus': '专注',
  'hint.typewriter': '打字机',
  'hint.menu': '菜单',
  'hint.tree': '文件树',
  'status.saved': '',
  'status.dirty': '·未保存',
  'status.saving': '·保存中',
  'status.line': 'Ln',
  'status.col': 'Col',
  'status.lines': '行',
  'status.hints': ' ^F 查找 · ^H 替换 · Alt+O 大纲 · Alt+S 源码 · Alt+F 专注 · Alt+P 打字机',
  'status.tableHints':
    ' [表格] Tab/⏎ 移动 · Alt+R 加行 · Alt+N 加列 · Alt+D 删行 · Alt+X 删列 · Alt+A 对齐 · Alt+T 删表',
  'tab.switch': ' Alt+]/[ 切换 · Alt+W 关闭',
  'search.find': ' 查找 ',
  'search.replace': ' 替换 ',
  'search.next': '⏎ 下一 · ⇧⏎ 上一 · Esc 关闭',
  'search.actions': 'Alt+R 替换当前 · Alt+A 全部 · Tab 切换焦点',
  'tree.header': ' ⏎打开 · h/l 折叠 · n新建 · r刷新',
  'tree.newFile': '新文件名（.md 可省）',
  'menu.title': ' 插入与格式 ',
  'menu.close': ' Esc 关闭',
  'menu.bold': '粗体 **',
  'menu.italic': '斜体 *',
  'menu.strike': '删除线 ~~',
  'menu.code': '行内代码 `',
  'menu.table': '插入表格 3×3',
  'menu.codeblock': '插入代码块',
  'menu.hr': '插入分割线',
  'menu.task': '任务列表 - [ ] ',
  'settings.title': ' 设置 ',
  'settings.theme': '主题',
  'settings.lang': '语言',
  'settings.langAuto': '跟随系统',
  'conflict.title': ' 文件已在磁盘上被修改 ',
  'conflict.file': '文件',
  'conflict.keepMine': 'k 保留我的（覆盖磁盘）',
  'conflict.loadDisk': 'l 加载磁盘版（丢弃我的修改）',
  'conflict.later': 'Esc 稍后再说',
  'editor.noTabs': '无打开的标签',
  'editor.untitled': 'untitled.md',
}

const en: Dict = {
  'hint.find': 'Find',
  'hint.replace': 'Replace',
  'hint.outline': 'Outline',
  'hint.source': 'Source',
  'hint.focus': 'Focus',
  'hint.typewriter': 'Typewriter',
  'hint.menu': 'Menu',
  'hint.tree': 'Files',
  'status.saved': '',
  'status.dirty': '·unsaved',
  'status.saving': '·saving',
  'status.line': 'Ln',
  'status.col': 'Col',
  'status.lines': 'lines',
  'status.hints': ' ^F Find · ^H Replace · Alt+O Outline · Alt+S Source · Alt+F Focus · Alt+P Typewriter',
  'status.tableHints':
    ' [Table] Tab/⏎ move · Alt+R row · Alt+N col · Alt+D del row · Alt+X del col · Alt+A align · Alt+T delete',
  'tab.switch': ' Alt+]/[ switch · Alt+W close',
  'search.find': ' Find ',
  'search.replace': ' Replace ',
  'search.next': '⏎ next · ⇧⏎ prev · Esc close',
  'search.actions': 'Alt+R replace · Alt+A all · Tab focus',
  'tree.header': ' ⏎open · h/l fold · n new · r refresh',
  'tree.newFile': 'new file name (.md optional)',
  'menu.title': ' Insert & Format ',
  'menu.close': ' Esc close',
  'menu.bold': 'Bold **',
  'menu.italic': 'Italic *',
  'menu.strike': 'Strikethrough ~~',
  'menu.code': 'Inline code `',
  'menu.table': 'Insert table 3×3',
  'menu.codeblock': 'Insert code block',
  'menu.hr': 'Insert divider',
  'menu.task': 'Task list - [ ] ',
  'settings.title': ' Settings ',
  'settings.theme': 'Theme',
  'settings.lang': 'Language',
  'settings.langAuto': 'System',
  'conflict.title': ' File changed on disk ',
  'conflict.file': 'File',
  'conflict.keepMine': 'k Keep mine (overwrite disk)',
  'conflict.loadDisk': 'l Load disk version (discard my edits)',
  'conflict.later': 'Esc Later',
  'editor.noTabs': 'No open tabs',
  'editor.untitled': 'untitled.md',
}

const DICTS: Record<Lang, Dict> = { 'zh-CN': zh, 'en-US': en }

let currentLang: Lang = 'zh-CN'

export function detectLang(): Lang {
  const env = `${process.env.LANG ?? ''}${process.env.LC_ALL ?? ''}`.toLowerCase()
  return env.startsWith('zh') ? 'zh-CN' : 'en-US'
}

export function getLang(): Lang {
  return currentLang
}

export function setLang(lang: Lang): void {
  currentLang = lang
}

/** 取文案；缺键回落中文，再缺返回键名 */
export function t(key: string): string {
  return DICTS[currentLang][key] ?? zh[key] ?? key
}
