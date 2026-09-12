/**
 * mermaid sequenceDiagram → ASCII 字符画（TUI.md §16-D18 路线 B 的时序图部分）。
 *
 * 解析子集：participant/actor 声明（as 别名）；消息 `A->>B: 标签`（实线箭头）、
 * `-->>`（虚线）、`-x`/`--x`（叉头）、`-)`/`--)`（开箭头）、`->`/`-->`（开箭头）；
 * `+`/`-` 激活前缀与 activate/deactivate 行解析后忽略（平铺渲染，不画激活框）；
 * Note over X[,Y] / left of X / right of X；autonumber、loop/alt/opt/par/else/end、
 * rect/box/critical/break 行忽略（块内消息平铺）；title 渲染为顶部淡显行。
 * 不支持（整体 null 降级占位框，绝不画错图）：未知语法、>8 参与者、>80 条目、
 * 源码 >4000 字符、超终端宽、>60 行高。
 *
 * 布局：参与者按声明/首现顺序排一行（盒子 + 生命线）；相邻间距取「跨该间隙的
 * 最宽消息标签 + 4」（over 双点 Note 为 +6）。画布为字符格覆盖式：先铺生命线，
 * 再画 Note/箭头/标签（覆盖生命线格）；各元素独占行区，互不冲突。全部几何按
 * 显示列计算（CJK 宽字符安全，复用 editor/measure）。
 */
import { textWidth } from './editor/measure'
import type { RenderSegment, SpanStyle } from './preview'

// ---------------------------------------------------------------------------
// 解析器
// ---------------------------------------------------------------------------

type ArrowKind = 'solid' | 'dashed'
type ArrowHead = 'filled' | 'cross' | 'open'

export interface SeqParticipant {
  id: string
  label: string
}

export interface SeqMessage {
  kind: 'message'
  from: string
  to: string
  label: string
  line: ArrowKind
  head: ArrowHead
}

export interface SeqNote {
  kind: 'note'
  where: 'over' | 'left' | 'right'
  /** over 可为两个 id；left/right 恰一个 */
  ids: string[]
  label: string
}

export interface SeqTitle {
  kind: 'title'
  label: string
}

export type SeqItem = SeqMessage | SeqNote | SeqTitle

export interface SequenceDiagram {
  participants: SeqParticipant[]
  items: SeqItem[]
}

const ARROWS: Record<string, { line: ArrowKind; head: ArrowHead }> = {
  '->>': { line: 'solid', head: 'filled' },
  '-->>': { line: 'dashed', head: 'filled' },
  '-x': { line: 'solid', head: 'cross' },
  '--x': { line: 'dashed', head: 'cross' },
  '-)': { line: 'solid', head: 'open' },
  '--)': { line: 'dashed', head: 'open' },
  '->': { line: 'solid', head: 'open' },
  '-->': { line: 'dashed', head: 'open' },
}

function cleanLabel(raw: string): string {
  let t = raw.trim()
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1)
  return t.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) =>
    ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[m] ?? m,
  )
}

export function parseSequenceDiagram(code: string): SequenceDiagram | null {
  if (code.length > 4000) return null
  const lines = code
    .split('\n')
    .map((l) => {
      const c = l.indexOf('%%')
      return (c === -1 ? l : l.slice(0, c)).trim()
    })
    .filter((l) => l !== '')
  if (lines.length === 0 || (lines[0] ?? '') !== 'sequenceDiagram') return null

  const order: string[] = []
  const labels = new Map<string, string>()
  const ensure = (id: string): void => {
    if (!labels.has(id)) {
      labels.set(id, id)
      order.push(id)
    }
  }

  const items: SeqItem[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? ''

    const decl = /^(?:participant|actor)\s+([^\s]+)(?:\s+as\s+(.+))?$/i.exec(line)
    if (decl !== null) {
      const id = decl[1] ?? ''
      ensure(id)
      if (decl[2] !== undefined) labels.set(id, cleanLabel(decl[2]))
      continue
    }

    // 激活/结构/杂项：解析后忽略（平铺渲染）
    if (/^(?:activate|deactivate)\b/i.test(line)) continue
    if (/^(?:autonumber|loop|alt|opt|par|and|else|end|rect|box|critical|option|break)\b/i.test(line)) continue
    if (/^title\b/i.test(line)) {
      items.push({ kind: 'title', label: cleanLabel(line.replace(/^title\s*:?/i, '')) })
      continue
    }

    const note = /^Note\s+(over|left of|right of)\s+([^\s:]+(?:\s*,\s*[^\s:]+)*)\s*:\s*(.*)$/i.exec(line)
    if (note !== null) {
      const whereRaw = (note[1] ?? '').toLowerCase()
      const ids = (note[2] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '')
      if (ids.length === 0) return null
      const where = whereRaw === 'left of' ? 'left' : whereRaw === 'right of' ? 'right' : 'over'
      if (where !== 'over' && ids.length !== 1) return null
      for (const id of ids) ensure(id)
      items.push({ kind: 'note', where, ids, label: cleanLabel(note[3] ?? '') })
      continue
    }

    // 消息（激活前缀 +/- 先剥除）
    const msg = /^([^\s]+?)\s*(--?>+>?|--?x|--?\))\s*([^\s]+?)\s*:\s*(.*)$/.exec(line)
    if (msg !== null) {
      const arrow = ARROWS[msg[2] ?? '']
      if (arrow === undefined) return null
      const from = (msg[1] ?? '').replace(/^[+-]|[+-]$/g, '')
      const to = (msg[3] ?? '').replace(/^[+-]|[+-]$/g, '')
      if (from === '' || to === '') return null
      ensure(from)
      ensure(to)
      items.push({ kind: 'message', from, to, label: cleanLabel(msg[4] ?? ''), ...arrow })
      continue
    }

    return null // 未知语法 → 整体降级
  }

  if (order.length === 0 || order.length > 8) return null
  if (items.length > 80) return null
  return {
    participants: order.map((id) => ({ id, label: labels.get(id) ?? id })),
    items,
  }
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

const BORDER: SpanStyle = { dim: true }
const LABEL: SpanStyle = {}
const ARROW: SpanStyle = {}
const TITLE: SpanStyle = { dim: true }

interface Cell {
  ch: string
  style: SpanStyle
}

/** 字符格画布：put 覆盖（Note/箭头/标签压过生命线），putLine 只写空格 */
class Canvas {
  rows: (Cell | undefined)[][] = []

  put(row: number, col: number, text: string, style: SpanStyle): void {
    while (this.rows.length <= row) this.rows.push([])
    const cells = this.rows[row]!
    let c = col
    for (const ch of text) {
      cells[c] = { ch, style }
      c += 1
    }
  }

  putLine(row: number, col: number): void {
    while (this.rows.length <= row) this.rows.push([])
    const cells = this.rows[row]!
    if (cells[col] === undefined) cells[col] = { ch: '│', style: { dim: true } }
  }

  rasterize(): RenderSegment[][] {
    const out: RenderSegment[][] = []
    for (const cells of this.rows) {
      const segs: RenderSegment[] = []
      let cur: RenderSegment | null = null
      const styleKey = (s: SpanStyle): string =>
        [s.bold, s.italic, s.dim, s.underline, s.strikethrough, s.color, s.inverse].join('|')
      for (const cell of cells) {
        const ch = cell === undefined ? ' ' : cell.ch
        const style = cell === undefined ? {} : cell.style
        const key = styleKey(style)
        if (cur === null || styleKey(cur.style) !== key) {
          cur = { text: ch, style }
          segs.push(cur)
        } else {
          cur.text += ch
        }
      }
      while (segs.length > 0 && segs[segs.length - 1]!.text.trim() === '') segs.pop()
      out.push(segs)
    }
    return out
  }
}

interface LaidParticipant {
  id: string
  label: string
  x: number
  w: number
  /** 生命线列 */
  c: number
}

function drawBox(cv: Canvas, row: number, p: { label: string; x: number; w: number }): void {
  const lw = textWidth(p.label)
  const padTotal = p.w - 2 - lw
  const padL = Math.floor(padTotal / 2)
  const content = ' '.repeat(padL) + p.label + ' '.repeat(padTotal - padL)
  cv.put(row, p.x, `┌${'─'.repeat(p.w - 2)}┐`, BORDER)
  cv.put(row + 1, p.x, `│${content}│`, BORDER)
  cv.put(row + 2, p.x, `└${'─'.repeat(p.w - 2)}┘`, BORDER)
}

function headGlyph(head: ArrowHead): string {
  return head === 'cross' ? '✕' : head === 'open' ? '›' : '▶'
}

function tailGlyph(head: ArrowHead): string {
  return head === 'cross' ? '✕' : head === 'open' ? '‹' : '◀'
}

export function renderMermaidSequence(code: string, width: number): RenderSegment[][] | null {
  const diag = parseSequenceDiagram(code)
  if (diag === null) return null

  // 参与者几何：相邻间隙 = 跨该间隙的最宽标签需求
  const pw: LaidParticipant[] = diag.participants.map((p) => ({ ...p, x: 0, w: Math.max(textWidth(p.label) + 4, 6), c: 0 }))
  const idxOf = new Map(pw.map((p, i) => [p.id, i] as const))
  const gapReq: number[] = new Array(Math.max(0, pw.length - 1)).fill(2)
  const bump = (a: number, b: number, need: number): void => {
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    for (let g = lo; g < hi; g++) gapReq[g] = Math.max(gapReq[g] ?? 2, need)
  }
  for (const it of diag.items) {
    if (it.kind === 'message') {
      const ia = idxOf.get(it.from) ?? 0
      const ib = idxOf.get(it.to) ?? 0
      if (ia !== ib) bump(ia, ib, textWidth(it.label) + 4)
    } else if (it.kind === 'note' && it.where === 'over' && it.ids.length >= 2) {
      const ia = idxOf.get(it.ids[0] ?? '') ?? 0
      const ib = idxOf.get(it.ids[1] ?? '') ?? 0
      if (ia !== ib) bump(ia, ib, textWidth(it.label) + 6)
    }
  }
  for (let g = 0; g < gapReq.length; g++) gapReq[g] = Math.max(gapReq[g] ?? 2, 2)

  let cursorX = 0
  for (let i = 0; i < pw.length; i++) {
    const p = pw[i]!
    p.x = cursorX
    p.c = p.x + Math.floor(p.w / 2)
    cursorX = p.x + p.w + (gapReq[i] ?? 2)
  }
  const last = pw[pw.length - 1]
  const totalW = last !== undefined ? last.x + last.w : 0
  if (totalW > width) return null

  const heights: number[] = diag.items.map((it) =>
    it.kind === 'title' ? 1 : it.kind === 'note' ? 3 : 2,
  )
  const headerRows = 3
  const totalH = headerRows + heights.reduce((a, b) => a + b, 0)
  if (totalH > 60) return null

  const cv = new Canvas()
  for (const p of pw) drawBox(cv, 0, p)
  for (const p of pw) {
    for (let r = headerRows; r < totalH; r++) cv.putLine(r, p.c)
  }

  let row = headerRows
  for (let i = 0; i < diag.items.length; i++) {
    const it = diag.items[i]!
    const h = heights[i]!
    if (it.kind === 'title') {
      const pad = Math.max(0, Math.floor((totalW - textWidth(it.label)) / 2))
      cv.put(row, pad, it.label, TITLE)
    } else if (it.kind === 'note') {
      const first = byIdOf(pw, it.ids[0] ?? '')
      if (first === undefined) return null
      const lw = Math.max(textWidth(it.label) + 2, 4)
      let nx: number
      let nw: number
      if (it.where === 'over') {
        if (it.ids.length >= 2) {
          const second = byIdOf(pw, it.ids[1] ?? '')
          if (second === undefined) return null
          nx = Math.min(first.c, second.c)
          nw = Math.max(Math.abs(first.c - second.c) + 1, lw, 4)
        } else {
          nw = lw
          nx = first.c - Math.floor(nw / 2)
        }
      } else if (it.where === 'left') {
        nw = lw
        nx = first.c - nw - 1
      } else {
        nw = lw
        nx = first.c + 1
      }
      // 左缘钳到 0（首参与者左侧空间不足时贴边），右缘放宽到终端宽（可越出图宽用空白余量）
      nx = Math.max(0, nx)
      if (nx + nw > width) return null
      const nlw = textWidth(it.label)
      const nPad = nw - 2 - nlw
      const nPadL = Math.floor(nPad / 2)
      const nContent = ' '.repeat(nPadL) + it.label + ' '.repeat(nPad - nPadL)
      cv.put(row, nx, `┌${'─'.repeat(nw - 2)}┐`, BORDER)
      cv.put(row + 1, nx, `│${nContent}│`, BORDER)
      cv.put(row + 2, nx, `└${'─'.repeat(nw - 2)}┘`, BORDER)
    } else {
      const from = byIdOf(pw, it.from)
      const to = byIdOf(pw, it.to)
      if (from === undefined || to === undefined) return null
      const lw = textWidth(it.label)
      if (it.from === it.to) {
        // 自环：右绕小回勾（两行），标签挂在拐角右侧
        cv.put(row, from.c, '──┐', ARROW)
        cv.put(row, from.c + 4, it.label, LABEL)
        cv.put(row + 1, from.c, '←──┘', ARROW)
      } else {
        const lo = Math.min(from.c, to.c)
        const hi = Math.max(from.c, to.c)
        const rightward = to.c >= from.c
        const span = hi - lo - 1
        if (lw + 2 <= span) {
          cv.put(row, lo + 1 + Math.floor((span - lw) / 2), it.label, LABEL)
        } else {
          cv.put(row, rightward ? hi + 2 : Math.max(0, lo - lw - 2), it.label, LABEL)
        }
        // 箭头占 lo..hi 全程（body 盖过起点生命线段，头部落在目标生命线上）
        const body = it.line === 'dashed' ? '┄'.repeat(hi - lo) : '─'.repeat(hi - lo)
        if (rightward) {
          cv.put(row + 1, lo, body + headGlyph(it.head), ARROW)
        } else {
          cv.put(row + 1, lo, tailGlyph(it.head) + body, ARROW)
        }
      }
    }
    row += h
  }

  // 栅格化：未定义格为空；行尾空格收敛
  return cv.rasterize().map((row) => {
    while (row.length > 0) {
      const tail = row[row.length - 1]!
      if (tail.text.trim() === '') {
        row.pop()
        continue
      }
      tail.text = tail.text.replace(/ +$/, '')
      break
    }
    return row
  })
}

function byIdOf(list: LaidParticipant[], id: string): LaidParticipant | undefined {
  return list.find((p) => p.id === id)
}
