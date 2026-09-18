/**
 * 段落级源码操作（右键菜单「段落」组用）：整行前缀的剥离/应用/切换。
 * 同一前缀再次应用 = 切回正文（Typora 式 toggle）。
 */

export type BlockKind = 'paragraph' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'quote' | 'ol' | 'ul' | 'task'

/** 识别行首块前缀（任务项在无序之前判定） */
const KIND_RE: ReadonlyArray<{ kind: BlockKind; re: RegExp }> = [
  { kind: 'h1', re: /^# / },
  { kind: 'h2', re: /^## / },
  { kind: 'h3', re: /^### / },
  { kind: 'h4', re: /^#### / },
  { kind: 'h5', re: /^##### / },
  { kind: 'h6', re: /^###### / },
  { kind: 'quote', re: /^> ?/ },
  { kind: 'task', re: /^[-*+] \[[ xX]\] / },
  { kind: 'ol', re: /^\d+\. / },
  { kind: 'ul', re: /^[-*+] / },
]

/** 当前行的块类型（无前缀 = paragraph） */
export function lineKind(line: string): BlockKind {
  for (const { kind, re } of KIND_RE) {
    if (re.test(line)) return kind
  }
  return 'paragraph'
}

function stripPrefix(line: string): string {
  for (const { re } of KIND_RE) {
    if (re.test(line)) return line.replace(re, '')
  }
  return line
}

function prefixOf(kind: BlockKind, index: number): string {
  switch (kind) {
    case 'h1': return '# '
    case 'h2': return '## '
    case 'h3': return '### '
    case 'h4': return '#### '
    case 'h5': return '##### '
    case 'h6': return '###### '
    case 'quote': return '> '
    case 'ol': return `${index + 1}. `
    case 'ul': return '- '
    case 'task': return '- [ ] '
    default: return ''
  }
}

/** 单行转换：已是目标类型则切回正文；有序列表按行序编号 */
export function transformLine(line: string, kind: BlockKind, index = 0): string {
  const body = stripPrefix(line)
  if (lineKind(line) === kind) return body
  if (kind === 'paragraph') return body
  return `${prefixOf(kind, index)}${body}`
}

/** 选区行数组转换（有序列表自动连续编号） */
export function transformLines(lines: string[], kind: BlockKind): string[] {
  let n = 0
  return lines.map((l) => {
    if (l.trim() === '' && kind !== 'quote') return l // 空行不动
    const out = transformLine(l, kind, n)
    if (kind === 'ol' && lineKind(out) === 'ol') n++
    else if (kind === 'ol') n = 0
    return out
  })
}

/** 清除选中文本的行内标记（** * ~~ `） */
export function clearInlineMarks(text: string): string {
  return text.replace(/(\*\*|\*|~~|`)/g, '')
}

/** 标题行级别 ±1（夹紧 1-6；非标题行原样返回） */
export function shiftHeading(line: string, delta: number): string {
  const m = /^(#{1,6}) (.*)$/.exec(line)
  if (!m) return line
  const level = Math.min(6, Math.max(1, m[1].length + delta))
  return `${'#'.repeat(level)} ${m[2]}`
}

// ---------------------------------------------------------------------------
// 列表 Tab 升降层级（Typora：列表行内 Tab/Shift-Tab 调整层级而非空格缩进）
// ---------------------------------------------------------------------------

/** 是否列表行（无序/有序/任务；容忍行首缩进——嵌套层级判定用） */
export function isListLine(line: string): boolean {
  const k = lineKind(line.replace(/^[ \t]+/, ''))
  return k === 'ul' || k === 'ol' || k === 'task'
}

/**
 * 对一组列表行整体升降一级（每级 2 空格）。
 * 任一行不是列表行、或降级时存在 0 缩进行 → 返回 null（调用方回落默认 Tab 行为）。
 */
export function adjustListIndentLines(lines: string[], delta: 1 | -1): string[] | null {
  if (lines.length === 0 || !lines.every(isListLine)) return null
  const out = lines.map((line) => {
    if (delta > 0) return `  ${line}`
    return line.startsWith('  ') ? line.slice(2) : null
  })
  return out.some((l) => l === null) ? null : (out as string[])
}

/**
 * 有序列表重编号（Typora 升降层级后重排编号）：
 * 同级缩进的连续 ol 行按出现顺序 1..n；更深缩进的子项不打断父级编号（CommonMark 连续语义），
 * 空行与更深的续行保持当前列表，其余块（低缩进正文/标题/其他列表）结束之。
 * 返回仅含实际变化行的下标与替换文本。
 */
export function renumberOrderedLines(lines: string[]): Map<number, string> {
  const changed = new Map<number, string>()
  // 栈式管理各缩进层级的活动 run（内层先 flush）
  const stack: { indent: string; indices: number[] }[] = []
  const flushTo = (keep: number): void => {
    while (stack.length > keep) {
      const run = stack.pop() as { indent: string; indices: number[] }
      run.indices.forEach((index, i) => {
        const renumbered = lines[index].replace(/^(\s*)\d+\. /, (_m, sp: string) => `${sp}${i + 1}. `)
        if (renumbered !== lines[index]) changed.set(index, renumbered)
      })
    }
  }
  lines.forEach((line, index) => {
    const m = /^(\s*)\d+\. /.exec(line)
    if (m) {
      const indent = m[1]
      while (stack.length > 0 && stack[stack.length - 1].indent > indent) flushTo(stack.length - 1)
      const top = stack[stack.length - 1]
      if (top && top.indent === indent) top.indices.push(index)
      else stack.push({ indent, indices: [index] })
    } else if (line.trim() === '' || /^[ \t]/.test(line)) {
      // 空行（宽松列表）或更深的续行：不打断
    } else {
      flushTo(0)
    }
  })
  flushTo(0)
  return changed
}
