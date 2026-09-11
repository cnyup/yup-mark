/**
 * 查找与替换（MT3）：纯逻辑 + UI 状态。
 * 桌面对齐：Ctrl+F 查找 / Ctrl+H 替换；Enter 下一命中 / Shift+Enter 上一命中；
 * Esc 关闭；Alt+R 替换当前 / Alt+A 全部替换。大小写不敏感（默认）。
 */
export interface SearchMatch {
  from: number
  to: number
}

export interface SearchState {
  open: boolean
  /** 替换模式（Ctrl+H 打开时置位，多一个替换输入行） */
  replaceMode: boolean
  query: string
  replacement: string
  /** 输入焦点在替换框（替换模式下 Tab 切换） */
  focusReplace: boolean
  matches: SearchMatch[]
  /** 当前命中（matches 下标；-1 无） */
  idx: number
}

export const initialSearch: SearchState = {
  open: false,
  replaceMode: false,
  query: '',
  replacement: '',
  focusReplace: false,
  matches: [],
  idx: -1,
}

/** 全文命中（空查询返回空） */
export function findMatches(doc: string, query: string, caseSensitive = false): SearchMatch[] {
  if (query === '') return []
  const hay = caseSensitive ? doc : doc.toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()
  const out: SearchMatch[] = []
  let pos = 0
  for (;;) {
    const at = hay.indexOf(needle, pos)
    if (at === -1) break
    out.push({ from: at, to: at + needle.length })
    pos = at + Math.max(1, needle.length)
  }
  return out
}

/** 距 pos 最近的命中下标（用于打开/跳转时定位当前项） */
export function nearestMatch(matches: SearchMatch[], pos: number): number {
  if (matches.length === 0) return -1
  let best = 0
  let bestDist = Number.MAX_SAFE_INTEGER
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    if (m === undefined) continue
    const d = m.from >= pos ? m.from - pos : pos - m.from
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}

/** 下一/上一命中（循环；空返回 null） */
export function stepMatch(matches: SearchMatch[], idx: number, dir: 1 | -1): number {
  if (matches.length === 0) return -1
  return (idx + dir + matches.length) % matches.length
}

/** 替换当前命中后的文档与下一命中定位 */
export function replaceCurrent(doc: string, state: SearchState): { doc: string; nextIdx: number } | null {
  const m = state.matches[state.idx]
  if (m === undefined) return null
  const next = `${doc.slice(0, m.from)}${state.replacement}${doc.slice(m.to)}`
  const rest = findMatches(next, state.query) // 重算（替换后偏移变化）
  const nextIdx = nearestMatch(rest, m.from)
  return { doc: next, nextIdx }
}

/** 全部替换（返回新文档与替换次数；无命中返回 null） */
export function replaceAll(doc: string, query: string, replacement: string): { doc: string; count: number } | null {
  if (query === '') return null
  const matches = findMatches(doc, query)
  if (matches.length === 0) return null
  let out = ''
  let pos = 0
  for (const m of matches) {
    out += doc.slice(pos, m.from) + replacement
    pos = m.to
  }
  out += doc.slice(pos)
  return { doc: out, count: matches.length }
}
