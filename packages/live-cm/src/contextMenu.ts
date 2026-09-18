/**
 * 编辑器右键菜单（Typora 式布局：图标 + 文字 + 快捷键）：
 * 剪切/复制/粘贴/全选 + 段落/格式/插入 三组子菜单。
 * 剪贴板优先走主进程 IPC（file:// 下 navigator.clipboard 不可靠）。
 * 文案：内核零 i18n 依赖，默认中文；外壳经 setEditorMenuLabels 注入本地化（切语言时更新）。
 */
import type { EditorView } from '@codemirror/view'
import { IS_MAC } from './platform'
import {
  applyBlockKindToSelection,
  clearInlineFormat,
  insertBlockSnippet,
  wrapSelectionWith,
} from './commands'

/** 菜单快捷键提示：mac 显示符号、Windows/Linux 显示 Ctrl 组合（Typora 官方对照） */
const H = (mac: string, win: string): string => (IS_MAC ? mac : win)

// ---------------------------------------------------------------------------
// 文案注册表（默认中文；外壳可整体或按 key 覆盖）
// ---------------------------------------------------------------------------
export type EditorMenuLabelKey =
  | 'cut' | 'copy' | 'paste' | 'selectAll'
  | 'paragraph' | 'format' | 'insert'
  | 'body' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  | 'quote' | 'ol' | 'ul' | 'task'
  | 'bold' | 'italic' | 'strike' | 'inlineCode' | 'clearFormat'
  | 'table' | 'codeBlock' | 'formula' | 'mathBlock' | 'link' | 'image' | 'timestamp'
  | 'tableTitle' | 'tableRows' | 'tableCols' | 'cancel' | 'ok'

/** 表头列名（列1/Col 1）与正文标签分开：函数型，注入方闭包拼接 */
let labels: Record<EditorMenuLabelKey, string> = {
  cut: '剪切',
  copy: '复制',
  paste: '粘贴',
  selectAll: '全选',
  paragraph: '段落',
  format: '格式',
  insert: '插入',
  body: '正文',
  h1: '一级标题',
  h2: '二级标题',
  h3: '三级标题',
  h4: '四级标题',
  h5: '五级标题',
  h6: '六级标题',
  quote: '引用',
  ol: '有序列表',
  ul: '无序列表',
  task: '任务列表',
  bold: '加粗',
  italic: '斜体',
  strike: '删除线',
  inlineCode: '行内代码',
  clearFormat: '清除格式',
  table: '表格…',
  codeBlock: '代码块',
  formula: '行内公式',
  mathBlock: '块级公式',
  link: '链接',
  image: '图片',
  timestamp: '时间戳',
  tableTitle: '插入表格',
  tableRows: '行数（含表头）',
  tableCols: '列数',
  cancel: '取消',
  ok: '插入',
}

let columnPrefix = '列'

/** 外壳注入文案（部分覆盖即可，未给的 key 保持现值）；colPrefix 用于表头「列N/Col N」 */
export function setEditorMenuLabels(overrides: Partial<Record<EditorMenuLabelKey, string>>, colPrefix?: string): void {
  labels = { ...labels, ...overrides }
  if (colPrefix !== undefined) columnPrefix = colPrefix
}

/** 表头列名（tableMarkdown 用） */
function columnName(i: number): string {
  return `${columnPrefix}${i + 1}`
}

/** 菜单条目：普通项 / 分隔线 / 带子菜单的组 */
interface MenuEntry {
  label?: string
  icon?: string
  hint?: string
  run?: () => void
  disabled?: boolean
  sep?: boolean
  sub?: MenuEntry[]
}

let menuEl: HTMLElement | null = null
let overlayEl: HTMLElement | null = null
/** 关闭器武装定时器：WebKit 右键事件序里 mousedown 可能晚于 contextmenu，
 *  同步武装会被同一次右键的 mousedown 秒关（表现为菜单闪一下即无） */
let closeArmTimer: ReturnType<typeof setTimeout> | null = null

function closeMenu(): void {
  menuEl?.remove()
  overlayEl?.remove()
  menuEl = null
  overlayEl = null
  if (closeArmTimer !== null) {
    clearTimeout(closeArmTimer)
    closeArmTimer = null
  }
  document.removeEventListener('mousedown', onDocDown, true)
}

function onDocDown(e: MouseEvent): void {
  if (menuEl && !menuEl.contains(e.target as Node)) closeMenu()
}

/** 剪贴板桥：渲染进程编辑器模块不直接依赖 preload 类型 */
interface ClipboardBridge {
  read(): Promise<string | null>
  write(text: string): Promise<boolean>
}

function clipboardBridge(): ClipboardBridge {
  const api =
    typeof window !== 'undefined'
      ? (
          window as {
            yupmark?: {
              readClipboardText?: () => Promise<{ ok: true; data: string } | { ok: false }>
              writeClipboardText?: (t: string) => Promise<{ ok: true } | { ok: false }>
            }
          }
        ).yupmark
      : undefined
  return {
    read: async () => {
      if (api?.readClipboardText) {
        const res = await api.readClipboardText()
        return res.ok ? res.data : null
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        try {
          return await navigator.clipboard.readText()
        } catch {
          return null
        }
      }
      return null
    },
    write: async (text) => {
      if (api?.writeClipboardText) {
        const res = await api.writeClipboardText(text)
        return res.ok
      }
      return false
    },
  }
}

// ---------------------------------------------------------------------------
// 图标（16px 线性；字形类用 <text>）
// ---------------------------------------------------------------------------
function glyph(ch: string, size = 11): string {
  return `<text x="12" y="17" text-anchor="middle" font-size="${size}" font-weight="600" fill="currentColor" stroke="none" font-family="inherit">${ch}</text>`
}

const ICONS: Record<string, string> = {
  cut: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  paste: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  selectAll: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  paragraph: glyph('¶', 13),
  format: glyph('A'),
  insert: '<path d="M12 5v14M5 12h14"/>',
  body: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  heading: glyph('H'),
  quote: '<path d="M10 8c-3 0-5 2.2-5 5.2S7 18 9 18M20 8c-3 0-5 2.2-5 5.2S17 18 19 18"/>',
  ul: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  ol: glyph('1.'),
  task: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m9 12 3 3 5-6"/>',
  bold: glyph('B'),
  italic: glyph('I'),
  strike: glyph('S'),
  code: '<path d="m8 6-6 6 6 6M16 6l6 6-6 6"/>',
  clear: '<path d="M18 6 6 18M6 6l12 12"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  formula: glyph('ƒ', 13),
  math: glyph('∑', 13),
}

function iconSvg(name?: string): string | null {
  if (!name || !ICONS[name]) return null
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`
}

// ---------------------------------------------------------------------------
// DOM 构建
// ---------------------------------------------------------------------------
function buildButton(item: MenuEntry): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  const icon = iconSvg(item.icon)
  if (icon) {
    const iconBox = document.createElement('span')
    iconBox.className = 'ctx-menu__icon'
    iconBox.innerHTML = icon
    btn.appendChild(iconBox)
  }
  const label = document.createElement('span')
  label.textContent = item.label ?? ''
  btn.appendChild(label)
  if (item.hint) {
    const hint = document.createElement('span')
    hint.className = 'ctx-menu__hint'
    hint.textContent = item.hint
    btn.appendChild(hint)
  }
  if (item.disabled) btn.disabled = true
  btn.addEventListener('mousedown', (e) => e.stopPropagation())
  btn.addEventListener('click', () => {
    closeMenu()
    item.run?.()
  })
  return btn
}

/** 子菜单项（悬停展开） */
function buildSubmenuItem(item: MenuEntry & { sub: MenuEntry[] }): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'ctx-sub'
  const trigger = buildButton({ ...item, run: undefined })
  trigger.addEventListener('click', (e) => e.preventDefault()) // 触发器只负责展开
  wrap.appendChild(trigger)

  const panel = document.createElement('div')
  panel.className = 'ctx-sub__panel'
  for (const sub of item.sub) {
    if (sub.sep) {
      const s = document.createElement('div')
      s.className = 'ctx-menu__sep'
      panel.appendChild(s)
      continue
    }
    panel.appendChild(buildButton(sub))
  }
  wrap.appendChild(panel)
  return wrap
}

// ---------------------------------------------------------------------------
// 插入表格确认弹窗（默认 3 行 4 列）
// ---------------------------------------------------------------------------
/** 行 × 列的表格源码（行数含表头） */
export function tableMarkdown(rows: number, cols: number): string {
  const header = `| ${Array.from({ length: cols }, (_, i) => columnName(i)).join(' | ')} |`
  const delim = `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`
  const data = Array.from(
    { length: Math.max(0, rows - 1) },
    () => `| ${Array.from({ length: cols }, () => ' ').join(' | ')} |`,
  )
  return [header, delim, ...data].join('\n')
}

function openInsertTableDialog(view: EditorView): void {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal'

  const title = document.createElement('div')
  title.className = 'modal__title'
  title.textContent = labels.tableTitle
  modal.appendChild(title)

  const makeField = (labelText: string, value: number, min: number, max: number): HTMLInputElement => {
    const row = document.createElement('div')
    row.className = 'ctx-dialog__field'
    const lb = document.createElement('span')
    lb.textContent = labelText
    const input = document.createElement('input')
    input.type = 'number'
    input.value = String(value)
    input.min = String(min)
    input.max = String(max)
    row.appendChild(lb)
    row.appendChild(input)
    modal.appendChild(row)
    return input
  }
  const rowsInput = makeField(labels.tableRows, 3, 2, 50)
  const colsInput = makeField(labels.tableCols, 4, 1, 20)

  const close = (): void => overlay.remove()

  const actions = document.createElement('div')
  actions.className = 'modal__actions'
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.className = 'modal__btn'
  cancel.textContent = labels.cancel
  cancel.addEventListener('click', close)
  const ok = document.createElement('button')
  ok.type = 'button'
  ok.className = 'modal__btn modal__btn--primary'
  ok.textContent = labels.ok
  ok.addEventListener('click', () => {
    const rows = Math.min(50, Math.max(2, Number(rowsInput.value) || 3))
    const cols = Math.min(20, Math.max(1, Number(colsInput.value) || 4))
    close()
    insertBlockSnippet(view, tableMarkdown(rows, cols))
  })
  actions.appendChild(cancel)
  actions.appendChild(ok)
  modal.appendChild(actions)

  overlay.appendChild(modal)
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  document.body.appendChild(overlay)
  rowsInput.focus()
  rowsInput.select()

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      close()
      document.removeEventListener('keydown', onKey)
    }
  }
  document.addEventListener('keydown', onKey)
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------
/** 呼出右键菜单；返回 true 表示已处理 */
export function openEditorContextMenu(view: EditorView, x: number, y: number): boolean {
  closeMenu()
  const sel = view.state.selection.main
  const hasSel = !sel.empty
  const clip = clipboardBridge()

  const paragraphSub: MenuEntry[] = [
    { icon: 'body', label: labels.body, hint: H('⌘0', 'Ctrl+0'), run: () => applyBlockKindToSelection(view, 'paragraph') },
    { sep: true },
    { icon: 'heading', label: labels.h1, hint: H('⌘1', 'Ctrl+1'), run: () => applyBlockKindToSelection(view, 'h1') },
    { icon: 'heading', label: labels.h2, hint: H('⌘2', 'Ctrl+2'), run: () => applyBlockKindToSelection(view, 'h2') },
    { icon: 'heading', label: labels.h3, hint: H('⌘3', 'Ctrl+3'), run: () => applyBlockKindToSelection(view, 'h3') },
    { icon: 'heading', label: labels.h4, hint: H('⌘4', 'Ctrl+4'), run: () => applyBlockKindToSelection(view, 'h4') },
    { icon: 'heading', label: labels.h5, hint: H('⌘5', 'Ctrl+5'), run: () => applyBlockKindToSelection(view, 'h5') },
    { icon: 'heading', label: labels.h6, hint: H('⌘6', 'Ctrl+6'), run: () => applyBlockKindToSelection(view, 'h6') },
    { sep: true },
    { icon: 'quote', label: labels.quote, hint: H('⌘⌥Q', 'Ctrl+Shift+Q'), run: () => applyBlockKindToSelection(view, 'quote') },
    { icon: 'ol', label: labels.ol, hint: H('⌘⌥O', 'Ctrl+Shift+['), run: () => applyBlockKindToSelection(view, 'ol') },
    { icon: 'ul', label: labels.ul, hint: H('⌘⌥U', 'Ctrl+Shift+]'), run: () => applyBlockKindToSelection(view, 'ul') },
    { icon: 'task', label: labels.task, hint: H('⌘⌥X', 'Ctrl+Shift+X'), run: () => applyBlockKindToSelection(view, 'task') },
  ]

  const formatSub: MenuEntry[] = [
    { icon: 'bold', label: labels.bold, hint: H('⌘B', 'Ctrl+B'), run: () => wrapSelectionWith(view, '**', '**') },
    { icon: 'italic', label: labels.italic, hint: H('⌘I', 'Ctrl+I'), run: () => wrapSelectionWith(view, '*', '*') },
    { icon: 'strike', label: labels.strike, hint: H('⌃⇧`', 'Alt+Shift+5'), run: () => wrapSelectionWith(view, '~~', '~~') },
    { icon: 'code', label: labels.inlineCode, hint: H('⇧⌘`', 'Ctrl+Shift+`'), run: () => wrapSelectionWith(view, '`', '`') },
    { sep: true },
    { icon: 'clear', label: labels.clearFormat, hint: H('⌘\\', 'Ctrl+\\'), run: () => clearInlineFormat(view) },
  ]

  const insertSub: MenuEntry[] = [
    { icon: 'table', label: labels.table, hint: H('⌘⌥T', 'Ctrl+T'), run: () => openInsertTableDialog(view) },
    { icon: 'code', label: labels.codeBlock, hint: H('⌥⌘C', 'Ctrl+Shift+K'), run: () => insertBlockSnippet(view, '```\n\n```', 4) },
    { icon: 'formula', label: labels.formula, run: () => wrapSelectionWith(view, '$', '$') },
    { icon: 'math', label: labels.mathBlock, hint: H('⌘⌥B', 'Ctrl+Shift+M'), run: () => insertBlockSnippet(view, '$$\n\n$$', 3) },
    { sep: true },
    { icon: 'link', label: labels.link, hint: H('⌘K', 'Ctrl+K'), run: () => wrapSelectionWith(view, '[', '](https://)') },
    { icon: 'image', label: labels.image, hint: H('⌃⌘I', 'Ctrl+Shift+I'), run: () => wrapSelectionWith(view, '![', '](https://)') },
    {
      icon: 'clock',
      label: labels.timestamp,
      run: () => {
        const d = new Date()
        const p = (n: number): string => String(n).padStart(2, '0')
        insertBlockSnippet(view, `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`)
      },
    },
  ]

  const entries: MenuEntry[] = [
    {
      icon: 'cut',
      label: labels.cut,
      hint: H('⌘X', 'Ctrl+X'),
      disabled: !hasSel,
      run: () => {
        void clip.write(view.state.doc.sliceString(sel.from, sel.to)).then(() => {
          view.dispatch({ changes: { from: sel.from, to: sel.to } })
        })
      },
    },
    {
      icon: 'copy',
      label: labels.copy,
      hint: H('⌘C', 'Ctrl+C'),
      disabled: !hasSel,
      run: () => {
        void clip.write(view.state.doc.sliceString(sel.from, sel.to))
      },
    },
    {
      icon: 'paste',
      label: labels.paste,
      hint: H('⌘V', 'Ctrl+V'),
      run: () => {
        void clip.read().then((text) => {
          if (text === null) return
          view.dispatch({
            changes: { from: sel.from, to: sel.to, insert: text },
            selection: { anchor: sel.from + text.length },
          })
          view.focus()
        })
      },
    },
    {
      icon: 'selectAll',
      label: labels.selectAll,
      hint: H('⌘A', 'Ctrl+A'),
      run: () => {
        view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } })
        view.focus()
      },
    },
    { sep: true },
    { icon: 'paragraph', label: labels.paragraph, sub: paragraphSub },
    { icon: 'format', label: labels.format, sub: formatSub },
    { icon: 'insert', label: labels.insert, sub: insertSub },
  ]

  overlayEl = document.createElement('div')
  overlayEl.className = 'ctx-overlay'
  overlayEl.addEventListener('mousedown', (e) => {
    e.preventDefault()
    closeMenu()
  })

  menuEl = document.createElement('div')
  menuEl.className = 'ctx-menu'
  for (const item of entries) {
    if (item.sep) {
      const sep = document.createElement('div')
      sep.className = 'ctx-menu__sep'
      menuEl.appendChild(sep)
      continue
    }
    if (item.sub) menuEl.appendChild(buildSubmenuItem({ ...item, sub: item.sub }))
    else menuEl.appendChild(buildButton(item))
  }

  menuEl.style.left = `${x}px`
  menuEl.style.top = `${y}px`
  document.body.appendChild(overlayEl)
  document.body.appendChild(menuEl)
  // 视口右/下边缘收敛；靠右时子菜单向左展开
  const rect = menuEl.getBoundingClientRect()
  if (rect.right > window.innerWidth) menuEl.style.left = `${Math.max(4, x - rect.width)}px`
  if (rect.bottom > window.innerHeight) menuEl.style.top = `${Math.max(4, y - rect.height)}px`
  if (menuEl.getBoundingClientRect().right > window.innerWidth - 200) menuEl.classList.add('ctx-menu--flip-sub')
  // 子菜单底部溢出视口的项：面板改向上锚定，避免被裁剪
  for (const sub of Array.from(menuEl.querySelectorAll<HTMLElement>('.ctx-sub'))) {
    const panel = sub.querySelector<HTMLElement>('.ctx-sub__panel')
    if (!panel) continue
    const panelH = panel.querySelectorAll('button').length * 29 + 12
    if (window.innerHeight - sub.getBoundingClientRect().bottom < panelH) sub.classList.add('ctx-sub--up')
  }
  closeArmTimer = setTimeout(() => {
    closeArmTimer = null
    document.addEventListener('mousedown', onDocDown, true)
  }, 0)
  return true
}
