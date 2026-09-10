/**
 * 行内数学 `$...$` 语法扩展（块级 `$$...$$` 走段落检测，见 rules.ts）。
 * 约束（pandoc 风格）：$ 内不允许首尾空白，避免把货币 "$5 and $10" 误判为公式。
 */
import type { MarkdownExtension } from '@lezer/markdown'

const DOLLAR = 36 // '$'

export const mathSyntax: MarkdownExtension = {
  defineNodes: ['InlineMath'],
  parseInline: [
    {
      name: 'InlineMath',
      parse(cx, next, pos) {
        if (next !== DOLLAR) return -1
        const text = cx.slice(pos + 1, cx.end)
        // `$$` 开头是块级数学，交给段落检测
        if (text.startsWith('$')) return -1
        const nl = text.indexOf('\n')
        const close = text.indexOf('$')
        if (close < 1) return -1
        // 行内公式不跨行
        if (nl >= 0 && close > nl) return -1
        const content = text.slice(0, close)
        // 内容首尾不允许空白（货币启发式）
        if (/^\s|\s$/.test(content)) return -1
        return cx.addElement(cx.elt('InlineMath', pos, pos + close + 2))
      },
    },
  ],
}
