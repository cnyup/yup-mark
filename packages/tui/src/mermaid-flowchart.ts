/**
 * mermaid flowchart → ASCII 字符画（TUI.md §16-D18 路线 B）。
 *
 * 解析子集：flowchart/graph + TD/TB/LR 方向（BT/RL 降级）；节点形状
 * [rect] / (round) / {diamond} / ([stadium]) / ((round)) / [[rect]] / [(rect)]
 * 与裸 id；引号标签与常见 HTML 实体；边 --> ---> --- -.- -.-> ==> ===> --o --x，
 * 管道标签 -->|是| 与内联标签 -- 是 -->；链式 A --> B --> C；%% 注释；
 * classDef/class/style/click/linkStyle/direction 行忽略。
 * 不支持（整体降级占位框，绝不画错图）：subgraph、BT/RL、未识别语法、
 * >40 节点、>80 边、源码 >4000 字符、超终端宽、>50 行高。
 *
 * 布局：DFS 回边检测 → 无环最长路径分层 → 重心法层内排序（减交叉）。
 * TD：相邻层正向边走层间通道（标签内联/贴线）；跨层正向边与回边走右侧檐列；
 * 同层边右侧直连或绕底回折；自环右侧绕底。LR 为镜像（层=列，檐列改底部檐行）。
 * 全部几何按显示列计算（CJK 宽字符安全，复用 editor/measure）。
 */
import { charWidth, textWidth } from './editor/measure'
import type { RenderSegment, SpanStyle } from './preview'

// ---------------------------------------------------------------------------
// 解析器
// ---------------------------------------------------------------------------

export type FlowShape = 'rect' | 'round' | 'diamond' | 'stadium' | 'plain'
export type FlowArrow = 'arrow' | 'open'

export interface FlowNode {
  id: string
  label: string
  shape: FlowShape
}

export interface FlowEdge {
  from: string
  to: string
  label: string
  arrow: FlowArrow
}

export interface Flowchart {
  dir: 'TD' | 'LR'
  nodes: FlowNode[]
  edges: FlowEdge[]
}

const RE_HEAD = /^(?:flowchart|graph)(?:\s+(td|tb|lr|bt|rl))?$/i
const RE_DIRECTIVE = /^(?:classDef|class|click|style|linkStyle|linkstyle|direction|initialize|default)\b/
const RE_ID = /[A-Za-z0-9_\u00a1-\uffff]+/y

// 边分隔符（粘性正则，按优先级尝试；标签内联形式需先于裸形式）
const RE_DOT_LBL = /\s*-\.(.*?)\.(->)?/y
const RE_DOT_BARE = /\s*(?:-\.->|-\.-(?!>))/y
const RE_DASH_LBL = /\s*-{2,}([^->|]+?)-{2,}(>)?/y
const RE_DASH_OX = /\s*--([ox])(?![A-Za-z0-9_])/y
const RE_DASH_ARROW = /\s*-{2,}>/y
const RE_DASH_BARE = /\s*-{2,}/y
const RE_SINGLE = /\s*->/y
const RE_THICK_LBL = /\s*={2,}([^=]+?)={2,}(>)?/y
const RE_THICK_BARE = /\s*={2,}>?/y
const RE_PIPE = /\s*\|([^|]*)\|/y

const EDGE_FORMS: readonly RegExp[] = [
  RE_DOT_LBL,
  RE_DOT_BARE,
  RE_DASH_LBL,
  RE_DASH_OX,
  RE_DASH_ARROW,
  RE_DASH_BARE,
  RE_SINGLE,
  RE_THICK_LBL,
  RE_THICK_BARE,
]

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

function skipSp(s: string, i: number): number {
  while (s[i] === ' ' || s[i] === '\t') i++
  return i
}

function cleanLabel(raw: string): string {
  let t = raw.trim()
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    t = t.slice(1, -1).replace(/\\"/g, '"')
  }
  return t.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m)
}

/** 位置 at 处的边分隔符；无则 null */
function parseEdgeAt(s: string, at: number): { end: number; label: string; arrow: FlowArrow } | null {
  for (const re of EDGE_FORMS) {
    re.lastIndex = at
    const m = re.exec(s)
    if (m === null) continue
    let end = at + m[0].length
    let label = ''
    if (re === RE_DOT_LBL || re === RE_DASH_LBL || re === RE_THICK_LBL) label = (m[1] ?? '').trim()
    const arrow: FlowArrow = m[0].trimEnd().endsWith('>') || re === RE_DASH_OX ? 'arrow' : 'open'
    RE_PIPE.lastIndex = end
    const pm = RE_PIPE.exec(s)
    if (pm !== null) {
      label = (pm[1] ?? '').trim()
      end += pm[0].length
    }
    return { end, label, arrow }
  }
  return null
}

/** 形状括号解析；null = 不支持的语法（整体降级），spec:null = 无形状 */
function parseShape(
  s: string,
  j: number,
): { spec: { label: string; shape: FlowShape } | null; end: number } | null {
  // 跳过引号段（\" 转义）再找闭合符，支持 ["a [b]"] 这类标签
  const findClose = (close: string, from: number): number => {
    let i = from
    while (i < s.length) {
      if (s[i] === '"') {
        i++
        while (i < s.length) {
          if (s[i] === '\\') {
            i += 2
            continue
          }
          if (s[i] === '"') {
            i++
            break
          }
          i++
        }
        continue
      }
      if (s.startsWith(close, i)) return i
      i++
    }
    return -1
  }
  const find = (close: string, from: number, shape: FlowShape): { spec: { label: string; shape: FlowShape }; end: number } | null => {
    const e = findClose(close, from)
    if (e === -1) return null
    return { spec: { label: s.slice(from, e), shape }, end: e + close.length }
  }
  if (s.startsWith('[[', j)) return find(']]', j + 2, 'rect')
  if (s.startsWith('[(', j)) return find(')]', j + 2, 'rect')
  if (s.startsWith('([', j)) return find('])', j + 2, 'stadium')
  if (s.startsWith('((', j)) return find('))', j + 2, 'round')
  if (s[j] === '[') return find(']', j + 1, 'rect')
  if (s[j] === '(') return find(')', j + 1, 'round')
  if (s[j] === '{') return find('}', j + 1, 'diamond')
  if (s[j] === '<') return null // flag 形状不支持
  return { spec: null, end: j }
}

function parseNodeAt(s: string, at: number): { node: FlowNode; end: number } | null {
  const j = skipSp(s, at)
  RE_ID.lastIndex = j
  const m = RE_ID.exec(s)
  if (m === null) return null
  const id = m[0]
  const k = skipSp(s, j + id.length)
  const sh = parseShape(s, k)
  if (sh === null) return null
  if (sh.spec === null) return { node: { id, label: id, shape: 'plain' }, end: j + id.length }
  return { node: { id, label: cleanLabel(sh.spec.label), shape: sh.spec.shape }, end: sh.end }
}

/** 首个显式形状/标签生效之后的重复定义：后者覆盖（与 mermaid 一致）；裸引用不覆盖 */
function register(nodes: Map<string, FlowNode>, n: FlowNode): void {
  const ex = nodes.get(n.id)
  if (ex === undefined) {
    nodes.set(n.id, n)
    return
  }
  if (n.shape !== 'plain') {
    ex.shape = n.shape
    ex.label = n.label
  }
}

/** 单行语句（链式边或孤立节点声明）；false = 无法解析（整体降级） */
function parseStatement(line: string, nodes: Map<string, FlowNode>, edges: FlowEdge[]): boolean {
  let cur = parseNodeAt(line, 0)
  if (cur === null) return false
  register(nodes, cur.node)
  for (;;) {
    const e = parseEdgeAt(line, cur.end)
    if (e === null) break
    const nxt = parseNodeAt(line, e.end)
    if (nxt === null) return false
    register(nodes, nxt.node)
    edges.push({ from: cur.node.id, to: nxt.node.id, label: e.label, arrow: e.arrow })
    cur = nxt
  }
  return line.slice(cur.end).trim() === ''
}

export function parseFlowchart(code: string): Flowchart | null {
  const lines = code
    .split('\n')
    .map((l) => {
      const c = l.indexOf('%%')
      return (c === -1 ? l : l.slice(0, c)).trim()
    })
    .filter((l) => l !== '')
  if (lines.length === 0) return null
  const head = RE_HEAD.exec(lines[0] ?? '')
  if (head === null) return null
  const d = (head[1] ?? 'td').toLowerCase()
  if (d === 'bt' || d === 'rl') return null
  const nodes = new Map<string, FlowNode>()
  const edges: FlowEdge[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!
    if (RE_DIRECTIVE.test(line)) continue
    if (/\bsubgraph\b/.test(line) || /\bend\b/.test(line)) return null
    if (!parseStatement(line, nodes, edges)) return null
  }
  if (nodes.size === 0) return null
  return { dir: d === 'lr' ? 'LR' : 'TD', nodes: [...nodes.values()], edges }
}

// ---------------------------------------------------------------------------
// 画布（按显示列索引；CJK 宽字符占 1 格 + 续格标记）
// ---------------------------------------------------------------------------

const U = 1
const D = 2
const L = 4
const R = 8

const DIRCH: Record<number, string> = {
  [L]: '─',
  [R]: '─',
  [U]: '│',
  [D]: '│',
  [L | R]: '─',
  [U | D]: '│',
  [R | D]: '┌',
  [L | D]: '┐',
  [R | U]: '└',
  [L | U]: '┘',
  [L | R | D]: '┬',
  [L | R | U]: '┴',
  [R | D | U]: '├',
  [L | D | U]: '┤',
  [L | R | D | U]: '┼',
}

interface CCell {
  ch: string
  style: SpanStyle
  /** 线段格的方向位（可合并）；undefined = 框/箭头/文字（不可覆盖） */
  dirs?: number
}

class Canvas {
  rows: (CCell | undefined)[][] = []
  w = 0
  h = 0

  private ensure(r: number): (CCell | undefined)[] {
    while (this.rows.length <= r) this.rows.push([])
    if (r + 1 > this.h) this.h = r + 1
    return this.rows[r]!
  }

  put(r: number, c: number, ch: string, style: SpanStyle): void {
    const row = this.ensure(r)
    row[c] = { ch, style }
    const cw = charWidth(ch)
    for (let k = 1; k < cw; k++) if (row[c + k] === undefined) row[c + k] = { ch: '', style }
    if (c + cw > this.w) this.w = c + cw
  }

  /** 线段格：与既有线合并（方向并集）；遇框/箭头/文字不覆盖 */
  putLine(r: number, c: number, dirs: number, style: SpanStyle): void {
    const row = this.ensure(r)
    const ex = row[c]
    if (ex !== undefined) {
      if (ex.dirs === undefined) return
      ex.dirs |= dirs
      ex.ch = DIRCH[ex.dirs] ?? '·'
      return
    }
    row[c] = { ch: DIRCH[dirs] ?? '·', dirs, style }
    if (c + 1 > this.w) this.w = c + 1
  }
}

type Pt = [col: number, row: number]

/** 折线：顶点方向 = 指向相邻点的方向并集；内部格 = 段轴向 */
function drawPolyline(cv: Canvas, pts: Pt[], style: SpanStyle): void {
  const dirTo = (from: Pt, to: Pt): number => {
    if (to[0] < from[0]) return L
    if (to[0] > from[0]) return R
    if (to[1] < from[1]) return U
    if (to[1] > from[1]) return D
    return 0
  }
  for (let i = 0; i < pts.length; i++) {
    let d = 0
    if (i > 0) d |= dirTo(pts[i]!, pts[i - 1]!)
    if (i < pts.length - 1) d |= dirTo(pts[i]!, pts[i + 1]!)
    if (d !== 0) cv.putLine(pts[i]![1], pts[i]![0], d, style)
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    if (a[0] === b[0] && a[1] === b[1]) continue
    if (a[1] === b[1]) {
      const lo = Math.min(a[0], b[0]) + 1
      const hi = Math.max(a[0], b[0]) - 1
      for (let c = lo; c <= hi; c++) cv.putLine(a[1], c, L | R, style)
    } else {
      const lo = Math.min(a[1], b[1]) + 1
      const hi = Math.max(a[1], b[1]) - 1
      for (let r = lo; r <= hi; r++) cv.putLine(r, a[0], U | D, style)
    }
  }
}

/** 标签：只写入空格与线段格；跨到框/箭头/文字则整体放弃（宁缺毋滥） */
function putLabel(cv: Canvas, r: number, c: number, text: string, style: SpanStyle): boolean {
  const span = textWidth(text)
  for (let k = 0; k < span; k++) {
    const cell = cv.rows[r]?.[c + k]
    if (cell !== undefined && cell.dirs === undefined) return false
  }
  let col = c
  for (const ch of text) {
    cv.put(r, col, ch, style)
    col += charWidth(ch)
  }
  return true
}

// ---------------------------------------------------------------------------
// 布局节点与分层
// ---------------------------------------------------------------------------

interface LNode {
  id: string
  label: string
  shape: FlowShape
  layer: number
  x: number
  y: number
  w: number
  h: number
  cx: number
}

function boxSize(shape: FlowShape, label: string): { w: number; h: number } {
  const lw = Math.max(textWidth(label), 1)
  switch (shape) {
    case 'plain':
      return { w: lw, h: 1 }
    case 'rect':
    case 'round':
      return { w: lw + 4, h: 3 }
    case 'stadium':
      return { w: lw + 4, h: 3 }
    case 'diamond':
      return { w: lw + 6, h: 4 }
  }
}

/** 侧面连接时菱形的内缩（斜边占位） */
const sidePad = (n: LNode): number => (n.shape === 'diamond' ? 1 : 0)
/** 横向连接行（盒第 2 行 = 标签行；单行 plain 用自身行） */
const row2 = (n: LNode): number => (n.h === 1 ? n.y : n.y + 1)

const BORDER: SpanStyle = { dim: true }
const LABEL: SpanStyle = {}
const LINE: SpanStyle = { dim: true }
const ARROW: SpanStyle = {}
const EDGE_LABEL: SpanStyle = { italic: true }

function drawNode(cv: Canvas, n: LNode): void {
  const lw = Math.max(textWidth(n.label), 1)
  const pad = ' '.repeat(lw - textWidth(n.label))
  const putRun = (r: number, c: number, text: string, style: SpanStyle): void => {
    let col = c
    for (const ch of text) {
      cv.put(r, col, ch, style)
      col += charWidth(ch)
    }
  }
  const { x, y, w } = n
  switch (n.shape) {
    case 'plain':
      putRun(y, x, n.label, LABEL)
      break
    case 'rect':
    case 'round': {
      const tl = n.shape === 'rect' ? '┌' : '╭'
      const tr = n.shape === 'rect' ? '┐' : '╮'
      const bl = n.shape === 'rect' ? '└' : '╰'
      const br = n.shape === 'rect' ? '┘' : '╯'
      cv.put(y, x, tl, BORDER)
      putRun(y, x + 1, '─'.repeat(w - 2), BORDER)
      cv.put(y, x + w - 1, tr, BORDER)
      cv.put(y + 1, x, '│', BORDER)
      putRun(y + 1, x + 1, ` ${n.label}${pad} `, LABEL)
      cv.put(y + 1, x + w - 1, '│', BORDER)
      cv.put(y + 2, x, bl, BORDER)
      putRun(y + 2, x + 1, '─'.repeat(w - 2), BORDER)
      cv.put(y + 2, x + w - 1, br, BORDER)
      break
    }
    case 'stadium':
      putRun(y, x + 1, `╭${'─'.repeat(lw)}╮`, BORDER)
      cv.put(y + 1, x, '(', BORDER)
      putRun(y + 1, x + 1, ` ${n.label}${pad} `, LABEL)
      cv.put(y + 1, x + w - 1, ')', BORDER)
      putRun(y + 2, x + 1, `╰${'─'.repeat(lw)}╯`, BORDER)
      break
    case 'diamond':
      putRun(y, x + 3, `╱${'─'.repeat(lw)}╲`, BORDER)
      cv.put(y + 1, x + 1, '╱', BORDER)
      cv.put(y + 1, x + 2, ' ', BORDER)
      putRun(y + 1, x + 3, `${n.label}${pad}`, LABEL)
      putRun(y + 1, x + 3 + lw, ' ╲', BORDER)
      cv.put(y + 2, x + 1, '╲', BORDER)
      cv.put(y + 2, x + 2, ' ', BORDER)
      putRun(y + 2, x + 3, ' '.repeat(lw), BORDER)
      putRun(y + 2, x + 3 + lw, ' ╱', BORDER)
      putRun(y + 3, x + 3, `╲${'─'.repeat(lw)}╱`, BORDER)
      break
  }
}

/** DFS 回边检测（含自环）→ 无环最长路径分层；返回回边下标集 */
function assignLayers(nodes: LNode[], edges: FlowEdge[]): Set<number> {
  const succs = new Map<string, number[]>()
  const back = new Set<number>()
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]!
    if (e.from === e.to) {
      back.add(i)
      continue
    }
    const list = succs.get(e.from)
    if (list === undefined) succs.set(e.from, [i])
    else list.push(i)
  }
  const color = new Map<string, 0 | 1 | 2>(nodes.map((n) => [n.id, 0]))
  const dfs = (id: string): void => {
    color.set(id, 1)
    for (const i of succs.get(id) ?? []) {
      const to = edges[i]!.to
      const c = color.get(to) ?? 0
      if (c === 1) back.add(i)
      else if (c === 0) dfs(to)
    }
    color.set(id, 2)
  }
  for (const n of nodes) if ((color.get(n.id) ?? 0) === 0) dfs(n.id)

  const layer = new Map<string, number>(nodes.map((n) => [n.id, 0]))
  for (let it = 0; it <= nodes.length; it++) {
    let changed = false
    for (let i = 0; i < edges.length; i++) {
      if (back.has(i)) continue
      const e = edges[i]!
      const ls = layer.get(e.from) ?? 0
      if ((layer.get(e.to) ?? 0) < ls + 1) {
        layer.set(e.to, ls + 1)
        changed = true
      }
    }
    if (!changed) break
  }
  for (const n of nodes) n.layer = layer.get(n.id) ?? 0
  return back
}

function buildAdj(
  nodes: LNode[],
  edges: FlowEdge[],
  back: Set<number>,
): { preds: Map<string, LNode[]>; succs: Map<string, LNode[]> } {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const preds = new Map<string, LNode[]>()
  const succs = new Map<string, LNode[]>()
  const push = (m: Map<string, LNode[]>, id: string, n: LNode): void => {
    const l = m.get(id)
    if (l === undefined) m.set(id, [n])
    else l.push(n)
  }
  for (let i = 0; i < edges.length; i++) {
    if (back.has(i)) continue
    const e = edges[i]!
    const s = byId.get(e.from)
    const t = byId.get(e.to)
    if (s === undefined || t === undefined || s === t) continue
    push(succs, s.id, t)
    push(preds, t.id, s)
  }
  return { preds, succs }
}

/** 重心法层内排序（正反各两趟，减交叉；稳定排序保持声明序） */
function orderLayers(layers: LNode[][], preds: Map<string, LNode[]>, succs: Map<string, LNode[]>): void {
  const pos = new Map<LNode, number>()
  for (const l of layers) for (let i = 0; i < l.length; i++) pos.set(l[i]!, i)
  for (let sweep = 0; sweep < 4; sweep++) {
    const down = sweep % 2 === 0
    for (let li = down ? 1 : layers.length - 2; down ? li < layers.length : li >= 0; down ? li++ : li--) {
      const rel = down ? preds : succs
      const key = (n: LNode): number => {
        const ps = (rel.get(n.id) ?? [])
          .map((m) => pos.get(m))
          .filter((v): v is number => v !== undefined)
        return ps.length === 0 ? (pos.get(n) ?? 0) : ps.reduce((a, b) => a + b, 0) / ps.length
      }
      const cur = layers[li]!
      cur.sort((a, b) => key(a) - key(b))
      for (let i = 0; i < cur.length; i++) pos.set(cur[i]!, i)
    }
  }
}

// ---------------------------------------------------------------------------
// TD 布局（层 = 行带，自上而下）
// ---------------------------------------------------------------------------

function layoutTD(nodes: LNode[], edges: FlowEdge[], back: Set<number>): Canvas {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const maxLayer = Math.max(...nodes.map((n) => n.layer))
  const layers: LNode[][] = []
  for (let i = 0; i <= maxLayer; i++) layers.push([])
  for (const n of nodes) layers[n.layer]!.push(n)
  const { preds, succs } = buildAdj(nodes, edges, back)
  orderLayers(layers, preds, succs)

  let y = 0
  let prevMaxH = 0
  for (let li = 0; li <= maxLayer; li++) {
    if (li > 0) y += prevMaxH + 2 // 层间：通道行 + 箭头行
    prevMaxH = 0
    for (const n of layers[li]!) {
      n.y = y
      prevMaxH = Math.max(prevMaxH, n.h)
    }
  }

  const intraGap = (li: number): number => {
    const ids = new Set(layers[li]!.map((n) => n.id))
    let g = 2
    for (const e of edges) {
      if (e.from === e.to) {
        if (ids.has(e.from)) g = Math.max(g, 4) // 自环占右边 2 列
        continue
      }
      if (ids.has(e.from) && ids.has(e.to)) g = Math.max(g, e.label === '' ? 4 : textWidth(e.label) + 4)
    }
    return g
  }
  const layerW: number[] = []
  for (let li = 0; li <= maxLayer; li++) {
    const l = layers[li]!
    layerW.push(l.reduce((acc, n) => acc + n.w, 0) + intraGap(li) * Math.max(0, l.length - 1))
  }
  const W0 = Math.max(...layerW)
  for (let li = 0; li <= maxLayer; li++) {
    const l = layers[li]!
    const g = intraGap(li)
    let x = Math.floor((W0 - layerW[li]!) / 2)
    for (const n of l) {
      n.x = x
      n.cx = x + (n.w >> 1)
      x += n.w + g
    }
  }

  const cv = new Canvas()
  for (const n of nodes) drawNode(cv, n)

  let gutter = W0 + 2
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]!
    const s = byId.get(e.from)!
    const t = byId.get(e.to)!
    const sRow = row2(s)
    const tRow = row2(t)
    const hasArrow = e.arrow === 'arrow'
    if (s === t) {
      // 自环：右出 → 绕底 → ↑ 回底边
      const exit = s.x + s.w - sidePad(s)
      const g = exit + 2
      drawPolyline(cv, [[exit, sRow], [g, sRow], [g, s.y + s.h], [s.cx + 1, s.y + s.h]], LINE)
      if (hasArrow) cv.put(s.y + s.h, s.cx, '↑', ARROW)
      if (e.label !== '') putLabel(cv, sRow, g + 1, ` ${e.label}`, EDGE_LABEL)
    } else if (t.layer === s.layer + 1) {
      // 相邻层正向边：层间通道（近对齐直落，避免 1 列拐点噪声）
      const r = s.y + s.h
      if (Math.abs(s.cx - t.cx) <= 1) {
        // 近对齐：取中线直落（多入边自然合并到同列）
        const c = (s.cx + t.cx) >> 1
        drawPolyline(cv, [[c, r], [c, t.y - 1]], LINE)
        if (hasArrow) cv.put(t.y - 1, c, '↓', ARROW)
        if (e.label !== '') putLabel(cv, r, c + 1, ` ${e.label}`, EDGE_LABEL)
      } else {
        drawPolyline(cv, [[s.cx, r], [t.cx, r], [t.cx, t.y - 1]], LINE)
        cv.putLine(r, s.cx, L | R | D, LINE) // 出口呈 ┬ 贴住源底边
        if (hasArrow) cv.put(t.y - 1, t.cx, '↓', ARROW)
        if (e.label !== '') {
          const lo = Math.min(s.cx, t.cx)
          const hi = Math.max(s.cx, t.cx)
          const run = hi - lo - 1
          const lw = textWidth(e.label)
          if (lw + 2 <= run) {
            putLabel(cv, r, lo + 1 + Math.floor((run - lw - 2) / 2), ` ${e.label} `, EDGE_LABEL)
          } else {
            putLabel(cv, r + 1, t.cx + 2, ` ${e.label}`, EDGE_LABEL)
          }
        }
      }
    } else if (t.layer > s.layer + 1) {
      // 跨层正向边：右侧檐列绕行（避免穿过中间层节点）
      const exit = s.x + s.w - sidePad(s)
      const enter = t.x + t.w - sidePad(t) + 1
      drawPolyline(cv, [[exit, sRow], [gutter, sRow], [gutter, tRow], [enter + 1, tRow]], LINE)
      if (hasArrow) cv.put(tRow, enter, '→', ARROW)
      if (e.label !== '') putLabel(cv, (sRow + tRow) >> 1, gutter + 1, ` ${e.label}`, EDGE_LABEL)
      gutter += 2 + (e.label === '' ? 0 : textWidth(e.label) + 2)
    } else if (t.layer === s.layer) {
      // 同层边（横向）
      if (t.x > s.x) {
        const exit = s.x + s.w - sidePad(s)
        const arrowCol = t.x + sidePad(t) - 1
        drawPolyline(cv, [[exit, sRow], [arrowCol - 1, sRow]], LINE)
        if (hasArrow) cv.put(sRow, arrowCol, '→', ARROW)
        if (e.label !== '') {
          const lo = exit + 1
          const run = arrowCol - 1 - lo + 1
          putLabel(cv, sRow - 1, lo + Math.max(0, Math.floor((run - textWidth(e.label)) / 2)), e.label, EDGE_LABEL)
        }
      } else {
        // 目标在左：绕层间通道底回折，↑ 进目标底边
        const r = s.y + s.h
        const r2 = r + 1
        drawPolyline(cv, [[s.cx, r], [s.cx, r2], [t.cx, r2], [t.cx, r]], LINE)
        cv.putLine(r, s.cx, L | R | D, LINE)
        if (hasArrow) cv.put(r, t.cx, '↑', ARROW)
        if (e.label !== '') {
          putLabel(cv, r2, Math.min(s.cx, t.cx) + 1, ` ${e.label} `, EDGE_LABEL)
        }
      }
    } else {
      // 回边：右侧檐列
      const exit = s.x + s.w - sidePad(s)
      const enter = t.x + t.w - sidePad(t) + 1
      drawPolyline(cv, [[exit, sRow], [gutter, sRow], [gutter, tRow], [enter + 1, tRow]], LINE)
      if (hasArrow) cv.put(tRow, enter, '→', ARROW)
      if (e.label !== '') putLabel(cv, (sRow + tRow) >> 1, gutter + 1, ` ${e.label}`, EDGE_LABEL)
      gutter += 2 + (e.label === '' ? 0 : textWidth(e.label) + 2)
    }
  }
  return cv
}

// ---------------------------------------------------------------------------
// LR 布局（层 = 列带，自左而右）
// ---------------------------------------------------------------------------

function layoutLR(nodes: LNode[], edges: FlowEdge[], back: Set<number>): Canvas {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const maxLayer = Math.max(...nodes.map((n) => n.layer))
  const layers: LNode[][] = []
  for (let i = 0; i <= maxLayer; i++) layers.push([])
  for (const n of nodes) layers[n.layer]!.push(n)
  const { preds, succs } = buildAdj(nodes, edges, back)
  orderLayers(layers, preds, succs)

  // 横向：层左 = 前层最大宽 + 层间隙（标签置连线上方，需容纳标签宽）
  const gapX = (li: number): number => {
    let g = 2
    for (let i = 0; i < edges.length; i++) {
      if (back.has(i)) continue
      const e = edges[i]!
      const s = byId.get(e.from)!
      const t = byId.get(e.to)!
      if (s.layer <= li && t.layer > li && e.label !== '') g = Math.max(g, textWidth(e.label) + 2)
    }
    return g
  }
  let x = 0
  let prevMaxW = 0
  for (let li = 0; li <= maxLayer; li++) {
    if (li > 0) x += prevMaxW + gapX(li - 1)
    prevMaxW = 0
    for (const n of layers[li]!) {
      n.x = x
      n.cx = x + (n.w >> 1)
      prevMaxW = Math.max(prevMaxW, n.w)
    }
  }

  // 纵向：层内堆叠 + 垂直居中
  const gapY = (li: number): number => {
    const ids = new Set(layers[li]!.map((n) => n.id))
    for (const e of edges) if (e.from !== e.to && ids.has(e.from) && ids.has(e.to)) return 2
    return 1
  }
  const layerH: number[] = []
  for (let li = 0; li <= maxLayer; li++) {
    const l = layers[li]!
    layerH.push(l.reduce((acc, n) => acc + n.h, 0) + gapY(li) * Math.max(0, l.length - 1))
  }
  const H0 = Math.max(...layerH)
  for (let li = 0; li <= maxLayer; li++) {
    const l = layers[li]!
    let yy = Math.floor((H0 - layerH[li]!) / 2)
    for (const n of l) {
      n.y = yy
      yy += n.h + gapY(li)
    }
  }

  const cv = new Canvas()
  for (const n of nodes) drawNode(cv, n)

  let gutterRow = H0 + 2
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]!
    const s = byId.get(e.from)!
    const t = byId.get(e.to)!
    const sRow = row2(s)
    const tRow = row2(t)
    const hasArrow = e.arrow === 'arrow'
    const labelAbove = (c1: number, c2: number): void => {
      if (e.label === '') return
      const lo = Math.min(c1, c2)
      const hi = Math.max(c1, c2)
      putLabel(cv, sRow - 1, lo + Math.max(0, Math.floor((hi - lo + 1 - textWidth(e.label)) / 2)), e.label, EDGE_LABEL)
    }
    if (s === t) {
      // 自环：下出 → 右绕 → ← 回右边
      const below = s.y + s.h
      const g = s.x + s.w + 2
      drawPolyline(cv, [[s.cx, below], [g, below], [g, sRow], [s.x + s.w + 2, sRow]], LINE)
      if (hasArrow) cv.put(sRow, s.x + s.w + 1, '←', ARROW)
      if (e.label !== '') putLabel(cv, below, s.cx + 2, ` ${e.label}`, EDGE_LABEL)
    } else if (t.layer === s.layer + 1) {
      // 相邻层正向边：横向直连或层间通道拐弯
      const exit = s.x + s.w - sidePad(s)
      const arrowCol = t.x + sidePad(t) - 1
      if (sRow >= t.y && sRow <= t.y + t.h - 1) {
        // 直连：连接行落在目标左边框行带内
        drawPolyline(cv, [[exit, sRow], [arrowCol - 1, sRow]], LINE)
        if (hasArrow) cv.put(sRow, arrowCol, '→', ARROW)
        if (e.label !== '') {
          const lo = exit + 1
          const run = arrowCol - 1 - lo + 1
          putLabel(cv, sRow - 1, lo + Math.max(0, Math.floor((run - textWidth(e.label)) / 2)), e.label, EDGE_LABEL)
        }
      } else {
        const c = exit + Math.max(1, Math.floor((t.x - 1 - exit) / 2))
        drawPolyline(cv, [[exit, sRow], [c, sRow], [c, tRow], [arrowCol - 1, tRow]], LINE)
        if (hasArrow) cv.put(tRow, arrowCol, '→', ARROW)
        if (e.label !== '') {
          const run1 = c - exit - 1
          const run2 = arrowCol - 1 - (c + 1)
          if (run1 >= run2) labelAbove(exit + 1, c - 1)
          else labelAbove(c + 1, arrowCol - 1)
        }
      }
    } else if (t.layer > s.layer + 1) {
      // 跨层正向边：底部檐行绕行
      const below = s.y + s.h
      const upAt = t.y + t.h + 1
      drawPolyline(cv, [[s.cx, below], [s.cx, gutterRow], [t.cx, gutterRow], [t.cx, upAt]], LINE)
      if (hasArrow) cv.put(t.y + t.h, t.cx, '↑', ARROW)
      if (e.label !== '') {
        const lo = Math.min(s.cx, t.cx)
        const hi = Math.max(s.cx, t.cx)
        putLabel(cv, gutterRow, lo + 1 + Math.max(0, Math.floor((hi - lo - 1 - textWidth(e.label)) / 2)), ` ${e.label} `, EDGE_LABEL)
      }
      gutterRow += 2 + (e.label === '' ? 0 : textWidth(e.label) + 2)
    } else if (t.layer === s.layer) {
      // 同列边（纵向）
      if (t.y > s.y) {
        const below = s.y + s.h
        if (s.cx === t.cx) {
          drawPolyline(cv, [[s.cx, below], [s.cx, t.y - 1]], LINE)
          if (hasArrow) cv.put(t.y - 1, s.cx, '↓', ARROW)
        } else {
          const r = below
          drawPolyline(cv, [[s.cx, r], [t.cx, r], [t.cx, t.y - 1]], LINE)
          cv.putLine(r, s.cx, L | R | D, LINE)
          if (hasArrow) cv.put(t.y - 1, t.cx, '↓', ARROW)
        }
        if (e.label !== '') {
          const mid = (s.y + s.h + t.y - 1) >> 1
          putLabel(cv, mid, s.cx + 2, ` ${e.label}`, EDGE_LABEL)
        }
      } else {
        // 目标在上：底部檐行绕行
        const below = s.y + s.h
        drawPolyline(cv, [[s.cx, below], [s.cx, gutterRow], [t.cx, gutterRow], [t.cx, t.y + t.h + 1]], LINE)
        if (hasArrow) cv.put(t.y + t.h, t.cx, '↑', ARROW)
        if (e.label !== '') {
          const lo = Math.min(s.cx, t.cx)
          const hi = Math.max(s.cx, t.cx)
          putLabel(cv, gutterRow, lo + 1 + Math.max(0, Math.floor((hi - lo - 1 - textWidth(e.label)) / 2)), ` ${e.label} `, EDGE_LABEL)
        }
        gutterRow += 2 + (e.label === '' ? 0 : textWidth(e.label) + 2)
      }
    } else {
      // 回边：底部檐行
      const below = s.y + s.h
      drawPolyline(cv, [[s.cx, below], [s.cx, gutterRow], [t.cx, gutterRow], [t.cx, t.y + t.h + 1]], LINE)
      if (hasArrow) cv.put(t.y + t.h, t.cx, '↑', ARROW)
      if (e.label !== '') {
        const lo = Math.min(s.cx, t.cx)
        const hi = Math.max(s.cx, t.cx)
        putLabel(cv, gutterRow, lo + 1 + Math.max(0, Math.floor((hi - lo - 1 - textWidth(e.label)) / 2)), ` ${e.label} `, EDGE_LABEL)
      }
      gutterRow += 2 + (e.label === '' ? 0 : textWidth(e.label) + 2)
    }
  }
  return cv
}

// ---------------------------------------------------------------------------
// 栅格化
// ---------------------------------------------------------------------------

function styleKeyOf(s: SpanStyle): string {
  return [s.bold, s.italic, s.dim, s.underline, s.strikethrough, s.color, s.inverse].join('|')
}

function rasterize(cv: Canvas): RenderSegment[][] {
  const out: RenderSegment[][] = []
  const EMPTY: SpanStyle = {}
  for (let r = 0; r < cv.h; r++) {
    const row = cv.rows[r] ?? []
    const segs: RenderSegment[] = []
    let cur: RenderSegment | null = null
    let curKey = ''
    for (let c = 0; c < cv.w; c++) {
      const cell = row[c]
      const ch = cell === undefined ? ' ' : cell.ch
      const style = cell === undefined ? EMPTY : cell.style
      const key = styleKeyOf(style)
      if (cur === null || key !== curKey) {
        cur = { text: ch, style }
        curKey = key
        segs.push(cur)
      } else {
        cur.text += ch
      }
    }
    while (segs.length > 0) {
      const last = segs[segs.length - 1]!
      if (last.text.trim() === '') {
        segs.pop()
        continue
      }
      last.text = last.text.replace(/ +$/, '')
      break
    }
    out.push(segs)
  }
  return out
}

// ---------------------------------------------------------------------------
// 对外入口
// ---------------------------------------------------------------------------

/** mermaid 源 → flowchart 字符画；非 flowchart / 不支持 / 超限 → null（调用方降级占位框） */
export function renderMermaidFlowchart(code: string, width: number): RenderSegment[][] | null {
  if (code.length > 4000) return null
  const flow = parseFlowchart(code)
  if (flow === null || flow.nodes.length === 0 || flow.nodes.length > 40 || flow.edges.length > 80) return null
  const nodes: LNode[] = flow.nodes.map((n) => {
    // 裸引用节点按 mermaid 默认形状（矩形）渲染
    const shape: FlowShape = n.shape === 'plain' ? 'rect' : n.shape
    const sz = boxSize(shape, n.label)
    return { id: n.id, label: n.label, shape, layer: 0, x: 0, y: 0, w: sz.w, h: sz.h, cx: 0 }
  })
  const back = assignLayers(nodes, flow.edges)
  const cv = flow.dir === 'TD' ? layoutTD(nodes, flow.edges, back) : layoutLR(nodes, flow.edges, back)
  if (cv.w > width || cv.h > 50) return null
  return rasterize(cv)
}
