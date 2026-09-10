/**
 * 渲染态 Widget：图片 / 水平线 / 任务复选框 / 无序列表符号 / 数学公式 / Mermaid 图表 / 表格 / 代码语言角标。
 * Widget 实例必须实现 eq 以避免不必要的重建。
 */
import { EditorView, WidgetType } from '@codemirror/view'
import katex from 'katex'
import { resolveImgSrc } from './engine-img'
import type { CellAlign } from './table'
import { renderInlineMarkdown } from './inlineRender'
import { deleteColumn, deleteRow, insertColumnAfter, insertRowAfter, setColumnAlign } from './tableOps'

export class ImageWidget extends WidgetType {
  /** 已解析为可直接加载的 URL（构造时固化，eq 比较它即可） */
  readonly resolved: string

  constructor(
    readonly src: string,
    readonly alt: string,
    docDir: string | null,
  ) {
    super()
    this.resolved = resolveImgSrc(src, docDir)
  }

  eq(other: ImageWidget): boolean {
    return other.resolved === this.resolved && other.alt === this.alt
  }

  /** 未绘制区域的行高预估（真实高度绘制后测量覆盖） */
  get estimatedHeight(): number {
    return 160
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'cm-image-wrap'
    const img = document.createElement('img')
    img.className = 'cm-image'
    img.src = this.resolved
    img.alt = this.alt
    img.draggable = false
    wrap.appendChild(img)
    return wrap
  }

  ignoreEvent(): boolean {
    return true
  }
}

export class HrWidget extends WidgetType {
  eq(): boolean {
    return true
  }

  /** 与 CSS 的 padding+border 对齐（1.2em + 0.8em + 2px @17px 基准） */
  get estimatedHeight(): number {
    return 36
  }

  toDOM(): HTMLElement {
    const el = document.createElement('hr')
    el.className = 'cm-hr-widget'
    return el
  }

  ignoreEvent(): boolean {
    return false
  }
}

export class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    /** TaskMarker 源码区间（[ ] / [x]），点击时原位翻转 */
    readonly from: number,
    readonly to: number,
  ) {
    super()
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.from === this.from
  }

  toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = `cm-checkbox${this.checked ? ' cm-checkbox--checked' : ''}`
    el.setAttribute('role', 'checkbox')
    el.setAttribute('aria-checked', String(this.checked))
    el.title = this.checked ? '点击标记为未完成' : '点击标记为完成'
    el.contentEditable = 'false'
    el.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const view = EditorView.findFromDOM(el)
      if (!view) return
      view.dispatch({ changes: { from: this.from, to: this.to, insert: this.checked ? '[ ]' : '[x]' } })
    })
    return el
  }

  ignoreEvent(): boolean {
    return true
  }
}

export class BulletWidget extends WidgetType {
  eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = 'cm-bullet'
    el.textContent = '•'
    return el
  }

  ignoreEvent(): boolean {
    return true
  }
}

/** 数学公式（KaTeX）；display=true 为块级居中模式 */
export class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display: boolean,
  ) {
    super()
  }

  eq(other: MathWidget): boolean {
    return other.tex === this.tex && other.display === this.display
  }

  get estimatedHeight(): number {
    return this.display ? 64 : -1
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = this.display ? 'cm-math-block' : 'cm-math-inline'
    try {
      katex.render(this.tex, span, { displayMode: this.display, throwOnError: false })
    } catch {
      span.classList.add('cm-math-error')
      span.textContent = this.tex
    }
    return span
  }

  ignoreEvent(): boolean {
    return true
  }
}

/** Mermaid 图表：懒加载（首次进入视口才动态 import），失败显示错误面板 */
export class MermaidWidget extends WidgetType {
  constructor(readonly code: string) {
    super()
  }

  eq(other: MermaidWidget): boolean {
    return other.code === this.code
  }

  get estimatedHeight(): number {
    return this.code.split('\n').length * 32 + 60
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-mermaid-wrap'
    void renderMermaid(wrap, this.code)
    return wrap
  }

  ignoreEvent(): boolean {
    return true
  }
}

let mermaidSeq = 0
let mermaidReady = false
type MermaidThemeName = 'default' | 'dark'

let currentMermaidTheme: MermaidThemeName = 'default'

/** 主题切换时更新 mermaid 配色；已渲染的图在下次重建（编辑/重载）时生效 */
export function setMermaidTheme(theme: MermaidThemeName): void {
  currentMermaidTheme = theme
  mermaidReady = false // 触发下次渲染时重新 initialize
}

async function renderMermaid(el: HTMLElement, code: string): Promise<void> {
  try {
    const { default: mermaid } = await import('mermaid')
    if (!mermaidReady) {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: currentMermaidTheme })
      mermaidReady = true
    }
    const { svg } = await mermaid.render(`soyup-mermaid-${mermaidSeq++}`, code)
    el.innerHTML = svg
  } catch (err) {
    el.classList.add('cm-mermaid-wrap--error')
    el.textContent = `Mermaid render failed / 图表渲染失败:\n${
      err instanceof Error ? err.message : String(err)
    }`
  }
}

/**
 * 渲染态表格（Typora 语义：点击进入单元格直接编辑，表格结构保持渲染）。
 * 单元格聚焦时显示源码文本，失焦时同步回文档并恢复行内渲染；
 * Tab/Shift+Tab 在单元格间移动，Enter 跳到下一行（末行 Enter 追加一行），Escape 退回块级源码模式。
 */
export interface TableCellSpec {
  text: string
  from: number
  to: number
}

export interface TableSpec {
  from: number
  to: number
  header: TableCellSpec[]
  rows: TableCellSpec[][]
  align: CellAlign[]
}

export class TableWidget extends WidgetType {
  constructor(readonly spec: TableSpec) {
    super()
  }

  eq(other: TableWidget): boolean {
    return JSON.stringify(other.spec) === JSON.stringify(this.spec)
  }

  get estimatedHeight(): number {
    return (this.spec.header.length + this.spec.rows.length) * 31 + 24
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-table-wrap'
    wrap.dataset.pos = String(this.spec.from)
    const table = document.createElement('table')
    table.className = 'cm-table'

    const alignOf = (i: number): CellAlign => this.spec.align[i] ?? null

    const thead = document.createElement('thead')
    const headRow = document.createElement('tr')
    this.spec.header.forEach((cell, i) => {
      headRow.appendChild(this.makeCell(cell, true, 0, i, alignOf(i)))
    })
    thead.appendChild(headRow)
    table.appendChild(thead)

    const tbody = document.createElement('tbody')
    this.spec.rows.forEach((row, r) => {
      const tr = document.createElement('tr')
      row.forEach((cell, i) => {
        tr.appendChild(this.makeCell(cell, false, r + 1, i, alignOf(i)))
      })
      // 列数不足表头（如尾部竖线缺失）时补空单元格，保持网格完整
      for (let i = row.length; i < this.spec.header.length; i++) {
        const pad = document.createElement('td')
        pad.contentEditable = 'false' as HTMLElement['contentEditable']
        const a = alignOf(i)
        if (a) pad.style.textAlign = a
        tr.appendChild(pad)
      }
      tbody.appendChild(tr)
    })
    table.appendChild(tbody)

    // 横向滚动内层（外层放工具栏，避免被裁剪）
    const scroll = document.createElement('div')
    scroll.className = 'cm-table-scroll'
    scroll.appendChild(table)
    wrap.appendChild(scroll)
    const bar = this.buildToolbar(wrap)
    wrap.appendChild(bar)

    // 表格位于内容区顶部时，上方放不下工具栏 → 翻转到表格内部顶端
    // （相对 scroller 测量，避免 TabBar 等外部高度参与判定）
    const reposition = (): void => {
      const scroller = wrap.closest('.cm-scroller')
      const topInScroller = scroller
        ? wrap.getBoundingClientRect().top - scroller.getBoundingClientRect().top
        : wrap.getBoundingClientRect().top
      bar.classList.toggle('cm-table-toolbar--inside', topInScroller < 40)
    }
    wrap.addEventListener('mouseenter', reposition)
    wrap.addEventListener('focusin', reposition)
    return wrap
  }

  /** 表格上方悬浮工具栏：行/列增删、对齐、删除表格（Typora 式） */
  private buildToolbar(wrap: HTMLElement): HTMLElement {
    const bar = document.createElement('div')
    bar.className = 'cm-table-toolbar'

    const view = (): EditorView | null => EditorView.findFromDOM(wrap)
    const tableLines = (): string[] | null => {
      const v = view()
      if (!v) return null
      return v.state.doc.sliceString(this.spec.from, this.spec.to).split('\n')
    }
    const apply = (next: string[] | null): void => {
      const v = view()
      if (!v || !next) return
      v.dispatch({ changes: { from: this.spec.from, to: this.spec.to, insert: next.join('\n') } })
    }
    /** 最近聚焦的单元格（0=表头行；1..=数据行）；无则首行首列 */
    const lastRC = (): { row: number; col: number } => ({
      row: Number(wrap.dataset.row ?? 1),
      col: Number(wrap.dataset.col ?? 0),
    })

    const ICON = (d: string): string => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`
    const mk = (title: string, icon: string, run: () => void): HTMLButtonElement => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'cm-table-toolbar__btn'
      b.dataset.tip = title
      b.setAttribute('aria-label', title)
      b.innerHTML = icon
      b.addEventListener('mousedown', (e) => e.preventDefault())
      b.addEventListener('click', run)
      return b
    }

    // 行组：上方插行 / 下方插行 / 删行
    // 行操作（表头行 row=0 钳到第一数据行，避免把行插进表头与分隔行之间）
    bar.appendChild(mk('上方插入行', ICON('M3 14h18M9 5v6M6 8h6M3 20h18'), () => {
      const r = Math.max(lastRC().row, 1)
      apply(insertRowAfter(tableLines() ?? [], r))
    }))
    bar.appendChild(mk('下方插入行', ICON('M3 4h18M9 13v6M6 16h6M3 20h18'), () => {
      const r = Math.max(lastRC().row, 1)
      apply(insertRowAfter(tableLines() ?? [], r + 1))
    }))
    bar.appendChild(mk('删除行', ICON('M3 5h18M4 10h16M6 10v9h12v-9'), () => {
      const r = Math.max(lastRC().row, 1)
      apply(deleteRow(tableLines() ?? [], r + 1))
    }))

    const sep = (): void => {
      const s = document.createElement('span')
      s.className = 'cm-table-toolbar__sep'
      bar.appendChild(s)
    }
    sep()

    // 列组：左侧插列 / 右侧插列 / 删列
    bar.appendChild(mk('左侧插入列', ICON('M20 3v18M5 9v6M2 12h6M14 3v18'), () => {
      const { col } = lastRC()
      apply(insertColumnAfter(tableLines() ?? [], col - 1))
    }))
    bar.appendChild(mk('右侧插入列', ICON('M4 3v18M13 9v6M10 12h6M20 3v18'), () => {
      const { col } = lastRC()
      apply(insertColumnAfter(tableLines() ?? [], col))
    }))
    bar.appendChild(mk('删除列', ICON('M10 3v18M3 8h14M3 16h14M16 3v18'), () => {
      const { col } = lastRC()
      apply(deleteColumn(tableLines() ?? [], col))
    }))

    sep()

    // 对齐组
    bar.appendChild(mk('左对齐', ICON('M4 5h16M4 10h10M4 15h16M4 20h10'), () => {
      const { col } = lastRC()
      apply(setColumnAlign(tableLines() ?? [], col, 'left'))
    }))
    bar.appendChild(mk('居中', ICON('M4 5h16M7 10h10M4 15h16M7 20h10'), () => {
      const { col } = lastRC()
      apply(setColumnAlign(tableLines() ?? [], col, 'center'))
    }))
    bar.appendChild(mk('右对齐', ICON('M4 5h16M10 10h10M4 15h16M10 20h10'), () => {
      const { col } = lastRC()
      apply(setColumnAlign(tableLines() ?? [], col, 'right'))
    }))

    sep()

    // 删除表格
    bar.appendChild(
      mk('删除表格', ICON('M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'), () => {
        const v = view()
        if (!v) return
        const from = this.spec.from
        const to = this.spec.to
        const lineTo = v.state.doc.lineAt(to).to
        v.dispatch({ changes: { from: from > 0 ? from - 1 : from, to: lineTo, insert: '' } })
      }),
    )

    return bar
  }

  /** ignoreEvent=true：点击/键盘事件留给单元格内的 contenteditable（编辑器不接管） */
  ignoreEvent(): boolean {
    return true
  }

  private makeCell(
    spec: TableCellSpec,
    isHeader: boolean,
    row: number,
    col: number,
    align: CellAlign,
  ): HTMLElement {
    const cell = document.createElement(isHeader ? 'th' : 'td')
    cell.contentEditable = 'plaintext-only' as HTMLElement['contentEditable']
    cell.tabIndex = -1
    cell.dataset.row = String(row)
    cell.dataset.col = String(col)
    cell.dataset.from = String(spec.from)
    if (align) cell.style.textAlign = align
    renderInlineMarkdown(cell, spec.text)

    const view = (): EditorView | null => EditorView.findFromDOM(cell)

    cell.addEventListener('focus', () => {
      const w = cell.closest('.cm-table-wrap') as HTMLElement | null
      if (w) {
        w.dataset.row = String(row)
        w.dataset.col = String(col)
      }
      if (cell.dataset.editing === '1') return
      cell.dataset.editing = '1'
      cell.textContent = spec.text
      const range = document.createRange()
      range.selectNodeContents(cell)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    })

    cell.addEventListener('blur', () => {
      if (cell.dataset.editing !== '1') return
      cell.dataset.editing = ''
      const text = cell.textContent ?? ''
      if (text === spec.text) {
        cell.textContent = ''
        renderInlineMarkdown(cell, spec.text)
        return
      }
      // 延迟派发：避免 Tab 切换单元格时，重建 DOM 抢走下一个单元格的焦点
      setTimeout(() => {
        const v = view()
        if (v) v.dispatch({ changes: { from: spec.from, to: spec.to, insert: text } })
      }, 0)
    })

    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cell.blur()
        const v = view()
        if (v) {
          v.dispatch({ selection: { anchor: this.spec.from } })
          v.focus()
        }
        return
      }
      // Typora：删除表格行 ⇧⌘⌫ / Ctrl+Shift+Backspace（与工具栏删行一致，表头行不可删）
      if (e.shiftKey && (e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
        e.preventDefault()
        const v = view()
        if (!v) return
        const lines = v.state.doc.sliceString(this.spec.from, this.spec.to).split('\n')
        const next = deleteRow(lines, Math.max(row, 1) + 1)
        if (next && next.join('\n') !== lines.join('\n')) {
          v.dispatch({ changes: { from: this.spec.from, to: this.spec.to, insert: next.join('\n') } })
        }
        return
      }
      // 上/下键：行间跳格；首行向上/末行向下 → 跳出表格（光标落表格前/后边界）
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const root = cell.closest('.cm-table-wrap')
        if (!root) return
        const cellsAll = Array.from(root.querySelectorAll<HTMLElement>('[contenteditable]'))
        const cols = this.spec.header.length
        const i = cellsAll.indexOf(cell)
        const next = e.key === 'ArrowDown' ? cellsAll[i + cols] : cellsAll[i - cols]
        e.preventDefault()
        if (next) {
          next.focus()
          return
        }
        cell.blur()
        const v = view()
        if (v) {
          v.dispatch({ selection: { anchor: e.key === 'ArrowDown' ? this.spec.to : this.spec.from } })
          v.focus()
        }
        return
      }
      if (e.key !== 'Tab' && e.key !== 'Enter') return
      e.preventDefault()
      const root = cell.closest('.cm-table-wrap')
      if (!root) return
      const cells = Array.from(root.querySelectorAll<HTMLElement>('[contenteditable]'))
      const flatIndex = cells.indexOf(cell)
      if (e.key === 'Tab') {
        const next = cells[e.shiftKey ? flatIndex - 1 : flatIndex + 1]
        next?.focus()
        return
      }
      // Enter：下一行同列；末行 → 追加一行
      const cols = this.spec.header.length
      const nextRow = cells[flatIndex + cols]
      if (nextRow) {
        nextRow.focus()
        return
      }
      const v = view()
      if (!v) return
      const lastCell = this.spec.rows[this.spec.rows.length - 1]?.[this.spec.rows[0].length - 1]
      if (!lastCell) return
      const lineEnd = v.state.doc.lineAt(lastCell.to).to
      const newRow = `|${Array.from({ length: cols }, () => ' ').join('|')}|`
      v.dispatch({ changes: { from: lineEnd, insert: `\n${newRow}` } })
      // 重建后聚焦新行同列
      setTimeout(() => {
        const fresh = v.dom.querySelector<HTMLElement>(
          `td[data-row="${this.spec.rows.length + 1}"][data-col="${col}"]`,
        )
        fresh?.focus()
      }, 0)
    })

    return cell
  }
}

/** 内置常见语言（id 与 @codemirror/language-data 对齐，保证高亮渲染） */
const COMMON_LANGS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'swift', label: 'Swift' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'php', label: 'PHP' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'json', label: 'JSON' },
  { id: 'yaml', label: 'YAML' },
  { id: 'toml', label: 'TOML' },
  { id: 'xml', label: 'XML' },
  { id: 'sql', label: 'SQL' },
  { id: 'shell', label: 'Shell' },
  { id: 'markdown', label: 'Markdown' },
]

/** 同一时间只允许一个语言选择弹窗 */
let langPopupEl: HTMLElement | null = null

function closeLangPopup(): void {
  if (langPopupEl) {
    langPopupEl.remove()
    langPopupEl = null
    document.removeEventListener('mousedown', onDocMouseDownForLangPopup)
  }
}

function onDocMouseDownForLangPopup(e: MouseEvent): void {
  if (langPopupEl && !langPopupEl.contains(e.target as Node)) closeLangPopup()
}

/** 语言选择弹窗：输入过滤 + 常见语言列表；提交即改写围栏信息串 */
function openLangPopup(badge: HTMLElement, w: CodeLangWidget): void {
  const view = EditorView.findFromDOM(badge)
  if (!view) return
  closeLangPopup()

  const popup = document.createElement('div')
  popup.className = 'cm-code-lang-popup'
  popup.addEventListener('mousedown', (e) => e.stopPropagation())

  const commit = (lang: string): void => {
    const value = lang.trim().toLowerCase()
    if (value !== w.lang) {
      view.dispatch({ changes: { from: w.infoFrom, to: w.infoTo, insert: value } })
    }
    closeLangPopup()
    view.focus()
  }

  const input = document.createElement('input')
  input.className = 'cm-code-lang-input'
  input.value = w.lang
  input.placeholder = '输入语言，如 python'
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit(input.value)
    if (e.key === 'Escape') closeLangPopup()
  })

  const list = document.createElement('div')
  list.className = 'cm-code-lang-list'

  const renderList = (q: string): void => {
    const query = q.trim().toLowerCase()
    const items = query
      ? COMMON_LANGS.filter((l) => l.id.includes(query) || l.label.toLowerCase().includes(query))
      : COMMON_LANGS
    list.textContent = ''
    for (const l of items) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = `cm-code-lang-item${l.id === w.lang ? ' cm-code-lang-item--active' : ''}`
      btn.textContent = l.label
      btn.addEventListener('click', () => commit(l.id))
      list.appendChild(btn)
    }
    if (query && items.length === 0) {
      const hint = document.createElement('div')
      hint.className = 'cm-code-lang-hint'
      hint.textContent = `回车使用自定义语言「${query}」`
      list.appendChild(hint)
    }
  }
  renderList(w.lang && COMMON_LANGS.some((l) => l.id === w.lang.trim().toLowerCase()) ? w.lang : '')
  input.addEventListener('input', () => renderList(input.value))

  const clear = document.createElement('button')
  clear.type = 'button'
  clear.className = 'cm-code-lang-clear'
  clear.textContent = '清除语言（纯文本）'
  clear.addEventListener('click', () => commit(''))

  popup.appendChild(input)
  popup.appendChild(list)
  popup.appendChild(clear)

  // 挂到 body（fixed 定位，避免被 .cm-scroller 裁剪），锚定在角标下方
  const rect = badge.getBoundingClientRect()
  const width = 216
  popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`
  popup.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 320)}px`
  popup.style.width = `${width}px`
  document.body.appendChild(popup)
  langPopupEl = popup
  document.addEventListener('mousedown', onDocMouseDownForLangPopup)

  input.focus()
  input.select()
}

/** 代码块语言角标（闭合围栏行尾），点击弹出常见语言选择/自定义输入 */
export class CodeLangWidget extends WidgetType {
  constructor(
    readonly lang: string,
    readonly infoFrom: number,
    readonly infoTo: number,
  ) {
    super()
  }

  eq(other: CodeLangWidget): boolean {
    return other.lang === this.lang && other.infoFrom === this.infoFrom
  }

  toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = 'cm-code-lang'
    el.textContent = this.lang || '+ lang'
    el.title = this.lang ? `语言: ${this.lang}（点击修改）` : '点击设置代码语言'
    el.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      openLangPopup(el, this)
    })
    return el
  }

  ignoreEvent(): boolean {
    return true
  }
}
