/**
 * 轻量行内 Markdown 渲染（表格单元格等 Widget 内部使用）：
 * 支持 `code`、**strong**、*em*、~~del~~、[text](url)。构建 DOM，不使用 innerHTML。
 */
const TOKEN =
  /(`[^`]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|(~~[^~\n]+~~)|(\[[^\]\n]+\]\([^)\s]+\))/g

export function renderInlineMarkdown(parent: HTMLElement, text: string): void {
  let last = 0
  for (const m of text.matchAll(TOKEN)) {
    const idx = m.index ?? 0
    if (idx > last) parent.appendChild(document.createTextNode(text.slice(last, idx)))
    const tok = m[0]
    let el: HTMLElement
    if (tok.startsWith('`')) {
      el = document.createElement('code')
      el.className = 'cm-inline-code'
      el.textContent = tok.slice(1, -1)
    } else if (tok.startsWith('**')) {
      el = document.createElement('strong')
      el.textContent = tok.slice(2, -2)
    } else if (tok.startsWith('~~')) {
      el = document.createElement('del')
      el.textContent = tok.slice(2, -2)
    } else if (tok.startsWith('[')) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)
      el = document.createElement('a')
      el.textContent = mm?.[1] ?? tok
      if (mm?.[2]) el.setAttribute('href', mm[2])
    } else {
      el = document.createElement('em')
      el.textContent = tok.slice(1, -1)
    }
    parent.appendChild(el)
    last = idx + tok.length
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)))
}
