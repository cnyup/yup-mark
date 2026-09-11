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
