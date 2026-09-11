/**
 * 源码态语法高亮（含 Markdown 符号与代码块内嵌语言）：
 * 颜色全部走 CSS 变量，随主题切换（themes/*.css）。
 */
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

export const markdownHighlightStyle = HighlightStyle.define([
  // Markdown 符号（# ** ` > - 等，源码态可见时）
  { tag: t.processingInstruction, color: 'var(--syntax-mark)' },
  { tag: t.meta, color: 'var(--syntax-mark)' },
  { tag: t.heading, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--syntax-link)', textDecoration: 'underline' },
  { tag: t.url, color: 'var(--syntax-mark)' },
  { tag: t.monospace, fontFamily: 'var(--monospace)' },
  { tag: t.quote, color: 'var(--syntax-mark)' },
  // 代码块内嵌语言的通用 token
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword], color: 'var(--syntax-keyword)' },
  { tag: [t.string, t.special(t.string), t.character], color: 'var(--syntax-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--syntax-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--syntax-comment)', fontStyle: 'italic' },
  { tag: [t.variableName, t.labelName], color: 'var(--syntax-variable)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--syntax-type)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--syntax-function)' },
  { tag: [t.propertyName, t.attributeName], color: 'var(--syntax-attr)' },
  { tag: [t.tagName, t.standard(t.tagName)], color: 'var(--syntax-tag)' },
  { tag: [t.operator, t.operatorKeyword], color: 'var(--syntax-keyword)' },
  { tag: [t.punctuation, t.separator, t.bracket], color: 'var(--syntax-mark)' },
  { tag: t.invalid, color: 'var(--error-color)' },
])

export const markdownHighlighting = syntaxHighlighting(markdownHighlightStyle)
