/**
 * LaTeX → Unicode 近似（MT2，TUI.md §6 务实集）。
 *
 * 纯函数：白名单式转换，遇到不可表达的构造返回 null，
 * 调用方（layout）以 null 降级为显示源码——总兜底原则：永不丢内容。
 *
 * 覆盖：上下标（含组合）、\sqrt、\frac（浅层）、常用符号与希腊字母、
 * \left/\right 剥除、空白命令压缩。环境/矩阵/未知命令 → null。
 */

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '(': '⁽', ')': '⁾', '=': '⁼',
  n: 'ⁿ', i: 'ⁱ', k: 'ᵏ', m: 'ᵐ', j: 'ʲ', t: 'ᵗ',
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', x: 'ˣ', y: 'ʸ',
  T: 'ᵀ',
}

const SUBSCRIPT: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '(': '₍', ')': '₎', '=': '₌',
  i: 'ᵢ', n: 'ₙ', k: 'ₖ', m: 'ₘ', j: 'ⱼ', r: 'ᵣ', t: 'ₜ',
  a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', u: 'ᵤ', v: 'ᵥ',
}

const SYMBOLS: Record<string, string> = {
  // 运算与关系
  pm: '±', mp: '∓', times: '×', div: '÷', cdot: '⋅', ast: '∗',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '∼',
  propto: '∝',
  // 大运算符与箭头
  sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬', oint: '∮',
  to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐',
  leftrightarrow: '↔', Leftrightarrow: '⇔', mapsto: '↦',
  uparrow: '↑', downarrow: '↓',
  // 集合与逻辑
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', supset: '⊃', subseteq: '⊆', supseteq: '⊇',
  cup: '∪', cap: '∩', emptyset: '∅', varnothing: '∅', infty: '∞',
  forall: '∀', exists: '∃', nexists: '∄', neg: '¬', land: '∧', lor: '∨',
  // 其他常用
  partial: '∂', nabla: '∇', degree: '°', circ: '∘', bullet: '•',
  cdots: '⋯', ldots: '…', dots: '…', vdots: '⋮', ddots: '⋱',
  angle: '∠', perp: '⊥', parallel: '∥', therefore: '∴', because: '∵',
  prime: '′', sqrtsign: '√', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ',
  quad: ' ', qquad: '  ',
  // 希腊字母
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ',
  tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
  Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
}

/** 组（如 x^{2n} 或 x^2 的剩余部分）转上/下标；不可映射返回 null */
function groupToScript(text: string, table: Record<string, string>): string | null {
  let out = ''
  for (const ch of text) {
    const mapped = table[ch]
    if (mapped === undefined) return null
    out += mapped
  }
  return out
}

/** 读取 {..} 组、单个命令（如 \infty 作为 ^ 的组）或单字符 */
function readGroup(src: string, i: number): { body: string; next: number } | null {
  if (src[i] === '{') {
    let depth = 0
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') depth++
      else if (src[j] === '}') {
        depth--
        if (depth === 0) return { body: src.slice(i + 1, j), next: j + 1 }
      }
    }
    return null
  }
  if (src[i] === '\\') {
    const m = /^\\[a-zA-Z]+|\\./.exec(src.slice(i))
    if (m) return { body: m[0], next: i + m[0].length }
    return null
  }
  if (i < src.length) return { body: src[i] as string, next: i + 1 }
  return null
}

/** 浅层转换：不含嵌套命令的纯文本/单命令片段 */
function convertSimple(text: string, superscript: boolean): string | null {
  if (text === '') return ''
  if (/[\\{}^_]/.test(text)) return null
  return groupToScript(text, superscript ? SUPERSCRIPT : SUBSCRIPT)
}

/**
 * LaTeX 源 → Unicode 近似；不可表达返回 null。
 * 例：`e=mc^2` → `e=mc²`；`\sum_{i=1}^n` → `∑ᵢ₌₁ⁿ`。
 */
export function latexToUnicode(tex: string): string | null {
  let src = tex.trim()
  if (src === '') return null

  // 块级公式的换行压缩为空格（display 形态）
  src = src.replace(/\s+/g, ' ')

  let out = ''
  let i = 0
  while (i < src.length) {
    const ch = src[i] as string
    if (ch === '\\') {
      const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i))
      if (!m) return null
      const name = m[1] as string
      i += m[0].length

      if (name === 'left' || name === 'right') {
        // \left( → ( ：跳过其后的定界符由后续轮次处理
        continue
      }
      if (name === 'sqrt') {
        const radix = /^ \[\s*([^\]]*)\s*\]/.exec(src.slice(i))
        let indexText = ''
        if (radix) {
          i += radix[0].length
          const r = convertSimple(radix[1] ?? '', true)
          if (r === null) return null
          indexText = r
        }
        const arg = readGroup(src, i)
        if (!arg) return null
        i = arg.next
        const inner = latexToUnicode(arg.body)
        if (inner === null) return null
        out += `${indexText}√(${inner})`
        continue
      }
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        const num = readGroup(src, i)
        if (!num) return null
        const den = readGroup(src, num.next)
        if (!den) return null
        i = den.next
        const n = latexToUnicode(num.body)
        const d = latexToUnicode(den.body)
        if (n === null || d === null) return null
        if (/[/ ]/.test(n) || /[/ ]/.test(d)) return null // 嵌套分数/含空格无法线性表达
        out += `${n}/${d}`
        continue
      }
      if (name === 'text' || name === 'mathrm' || name === 'operatorname') {
        const arg = readGroup(src, i)
        if (!arg) return null
        i = arg.next
        out += arg.body
        continue
      }
      if (name === ',' || name === ';' || name === '!' || name === ' ' || name === 'quad' || name === 'qquad') {
        // 间距命令自身即间距：吸收其前的显式空格，避免双空格
        out = out.replace(/ +$/, '')
        if (name === 'quad' || name === 'qquad') out += ' '
        continue
      }
      if (name === 'begin' || name === 'end') return null // 环境不支持
      const sym = SYMBOLS[name]
      if (sym === undefined) return null
      out += sym
      continue
    }
    if (ch === '^' || ch === '_') {
      // 组形式（{..} 或命令）允许平排回退；单字符脚本无映射维持 null（源码兜底）
      const isGroup = src[i + 1] === '{' || src[i + 1] === '\\'
      const grp = readGroup(src, i + 1)
      if (!grp) return null
      i = grp.next
      // 上下标内容允许直接符号（\sum 的脚本已处理），也允许浅层文本
      const converted = convertSimple(grp.body, ch === '^')
      if (converted === null) {
        // 组内含命令：递归近似后要求结果可脚本化；
        // 缺映射字符（如 π 无上标形）→ 组形式平排回退 ^(...) / _(...)，不放弃整条公式
        const inner = latexToUnicode(grp.body)
        if (inner === null) return null
        const scripted = groupToScript(inner, ch === '^' ? SUPERSCRIPT : SUBSCRIPT)
        if (scripted === null) {
          if (!isGroup) return null
          out += `${ch}(${inner})`
        } else {
          out += scripted
        }
      } else {
        out += converted
      }
      continue
    }
    if (ch === '{' || ch === '}') {
      // 裸括号（非命令参数）按分组剥除
      if (ch === '{') {
        const close = src.indexOf('}', i)
        if (close === -1) return null
        const inner = latexToUnicode(src.slice(i + 1, close))
        if (inner === null) return null
        out += inner
        i = close + 1
      } else {
        i++
      }
      continue
    }
    out += ch
    i++
  }
  return out
}
