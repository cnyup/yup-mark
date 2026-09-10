// 最小生命周期复现：先无装饰渲染并测量 → 之后补上标题行样式 → 真实点击是否错位
import { EditorState, StateField, type Range } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import { forceFullMeasure } from '../../src/renderer/editor/fullMeasure'
import '../../src/renderer/assets/base.css'

const BLOCK = [
  'paragraph one',
  '',
  '## Heading Two',
  '',
  'paragraph two',
  '',
  '### Heading Three',
  '',
  'end paragraph',
  '',
].join('\n')
const DOC = Array.from({ length: 25 }, (_, i) => BLOCK.replaceAll('Heading Two', `Heading Two ${i}`)).join('\n')

const buildDecos = (state: EditorState): DecorationSet => {
    const out: Range<Decoration>[] = []
    const tree = ensureSyntaxTree(state, state.doc.length, 100) ?? syntaxTree(state)
    let n: { name: string; from: number; nextSibling: { name: string; from: number } | null } | null =
      tree.topNode.firstChild as never
    while (n) {
      if (/^ATXHeading\d$/.test(n.name)) {
        const level = n.name.slice('ATXHeading'.length)
        out.push(
          Decoration.line({ class: `cm-h-line cm-h${level}` }).range(state.doc.lineAt(n.from).from),
        )
      }
      n = n.nextSibling as never
    }
    return Decoration.set(out, true)
}

const hField = StateField.define<DecorationSet>({
  create: (state) => buildDecos(state),
  update: (value, tr) => tr.docChanged ? buildDecos(tr.state) : value.map(tr.changes),
  provide: (f) => EditorView.decorations.from(f),
})

function raf(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()))
}

async function main() {
  const host = document.createElement('div')
  host.className = 'editor-host'
  host.style.height = '600px'
  host.style.overflow = 'hidden'
  document.body.appendChild(host)

  const state = EditorState.create({
    doc: DOC,
    extensions: [EditorView.lineWrapping, markdown(), hField],
  })
  const view = new EditorView({ state, parent: host })
  // 关键：让 CM6 自己的 scroller 成为滚动容器（.cm-editor 填满宿主高度）
  const ed = host.querySelector('.cm-editor') as HTMLElement | null
  if (ed) ed.style.height = '100%'

  await raf(); await raf()
  console.log(`[LIFE] initial heights (styled from create): ${measureHeadingHeights()}`)

  // 大跳滚动到文档中部（模拟 scrollIntoView / 会话恢复的滚动位置）
  const midHeading = DOC.indexOf('## Heading Two 12')
  view.dispatch({ effects: EditorView.scrollIntoView(midHeading) })
  await raf(); await raf(); view.requestMeasure(); await raf(); await raf()
  console.log(`[LIFE] scrolled, scrollTop=${Math.round(view.scrollDOM.scrollTop)}`)

  // 诊断：map vs real（doc 空间）在滚动穿越前后的变化
  const diag = (label: string) => {
    const pos = DOC.indexOf('## Heading Two 12')
    const block = view.lineBlockAt(pos)
    const domLine = (() => {
      const { node } = view.domAtPos(pos)
      const p = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement
      return p?.closest('.cm-line') as HTMLElement | null
    })()
    const contentTop = view.contentDOM.getBoundingClientRect().top
    const realDocTop = domLine ? domLine.getBoundingClientRect().top - contentTop + view.scrollDOM.scrollTop : -1
    console.log(`[LIFE] diag ${label}: map.top=${Math.round(block.top)} real.top=${Math.round(realDocTop)} delta=${Math.round(realDocTop - block.top)}`)
  }
  diag('before-pass')
  await forceFullMeasure(view)
  await raf(); view.requestMeasure(); await raf()
  diag('after-pass')
  console.log(`[LIFE] click test:`)

  for (const text of ['Heading Two 12', 'Heading Three']) {
    const pos = DOC.indexOf(text) + 2
    const c = view.coordsAtPos(pos)
    if (!c) continue
    const hit = view.posAtCoords({ x: c.left + 2, y: c.top + 6 })
    if (hit === null) {
      console.log(`[LIFE] click "${text}" → null`)
      continue
    }
    const line = view.state.doc.lineAt(hit)
    console.log(`[LIFE] click "${text}" → landed line ${line.number} "${line.text.slice(0, 16)}"`)
  }
  console.log('[LIFE] DONE')

  function measureHeadingHeights(): string {
    return (
      Array.from(host.querySelectorAll('.cm-h-line'))
        .map((e) => Math.round(e.getBoundingClientRect().height))
        .join(',') || 'none-styled'
    )
  }
}

main().catch((e) => console.log('[LIFE] ERROR', String(e)))
