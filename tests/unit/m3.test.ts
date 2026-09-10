import { describe, expect, it } from 'vitest'
import { syntaxTree } from '@codemirror/language'
import { createEditorState } from '@renderer/editor/extensions'
import { buildLiveDecorations } from '@renderer/editor/rules'
import { MathWidget, MermaidWidget, TableWidget } from '@renderer/editor/widgets'
import { parseMarkdownTable } from '@renderer/editor/table'
import { smartPasteUrl } from '@renderer/editor/smartPaste'
import type { Range } from '@codemirror/state'
import type { Decoration } from '@codemirror/view'
import type { WidgetType } from '@codemirror/view'

function widgetsOf(decos: Range<Decoration>[], ctor: new (...args: never[]) => WidgetType): never[] {
  return decos
    .filter((d) => d.value.spec.widget instanceof ctor)
    .map((d) => d.value.spec.widget as never)
}

function findNodes(state: ReturnType<typeof createEditorState>, name: string): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = []
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === name) out.push({ from: node.from, to: node.to })
    },
  })
  return out
}

describe('行内数学 $...$', () => {
  it('语法树产出 InlineMath 节点', () => {
    const doc = 'formula $x^2 + y$ end'
    const nodes = findNodes(createEditorState(doc), 'InlineMath')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toEqual({ from: 8, to: 17 }) // '$x^2 + y$'
  })

  it('货币启发式：$5 and $10 不是公式', () => {
    const doc = 'price $5 and $10 total'
    expect(findNodes(createEditorState(doc), 'InlineMath')).toHaveLength(0)
  })

  it('$$ 开头不误判为行内公式（留给块级检测）', () => {
    const doc = '$$\nx=1\n$$'
    expect(findNodes(createEditorState(doc), 'InlineMath')).toHaveLength(0)
  })

  it('非活跃块替换为 MathWidget，活跃块显示源码', () => {
    const doc = 'math $x_1$ here\n\nEND'
    const inactive = buildLiveDecorations(createEditorState(doc, doc.length))
    const w = widgetsOf(inactive, MathWidget)
    expect(w).toHaveLength(1)
    expect((w[0] as unknown as MathWidget).tex).toBe('x_1')
    expect((w[0] as unknown as MathWidget).display).toBe(false)

    const active = buildLiveDecorations(createEditorState(doc, 6))
    expect(widgetsOf(active, MathWidget)).toHaveLength(0)
  })
})

describe('块级数学 $$...$$', () => {
  const doc = '$$\n\\int_0^1 x \\, dx = \\frac{1}{2}\n$$\n\nEND'

  it('非活跃时整段替换为块级 MathWidget', () => {
    const decos = buildLiveDecorations(createEditorState(doc, doc.length))
    const w = widgetsOf(decos, MathWidget)
    expect(w).toHaveLength(1)
    expect((w[0] as unknown as MathWidget).display).toBe(true)
  })

  it('光标进入段落显示源码', () => {
    const decos = buildLiveDecorations(createEditorState(doc, 3))
    expect(widgetsOf(decos, MathWidget)).toHaveLength(0)
  })
})

describe('Mermaid 图表', () => {
  const doc = '```mermaid\ngraph TD\nA-->B\n```\n\nEND'

  it('非活跃围栏替换为 MermaidWidget（携带图表源码）', () => {
    const decos = buildLiveDecorations(createEditorState(doc, doc.length))
    const w = widgetsOf(decos, MermaidWidget)
    expect(w).toHaveLength(1)
    expect((w[0] as unknown as MermaidWidget).code).toContain('graph TD')
  })

  it('光标进入围栏显示源码', () => {
    const decos = buildLiveDecorations(createEditorState(doc, doc.indexOf('graph')))
    expect(widgetsOf(decos, MermaidWidget)).toHaveLength(0)
  })

  it('普通代码语言（js）不渲染图表', () => {
    const doc2 = '```js\nconst a = 1\n```\n\nEND'
    const decos = buildLiveDecorations(createEditorState(doc2, doc2.length))
    expect(widgetsOf(decos, MermaidWidget)).toHaveLength(0)
  })
})

describe('表格', () => {
  const doc = '| 名称 | 数量 |\n| :--- | ---: |\n| 苹果 | 3 |\n| 香蕉 | 12 |\n\nEND'

  it('非活跃时整表替换为 TableWidget', () => {
    const decos = buildLiveDecorations(createEditorState(doc, doc.length))
    const w = widgetsOf(decos, TableWidget)
    expect(w).toHaveLength(1)
  })

  it('光标进入表格显示源码', () => {
    const decos = buildLiveDecorations(createEditorState(doc, doc.indexOf('苹果')))
    expect(widgetsOf(decos, TableWidget)).toHaveLength(0)
  })
})

describe('parseMarkdownTable 表格解析', () => {
  it('解析表头/行/对齐', () => {
    const t = parseMarkdownTable('| a | b | c |\n| :- | :-: | -: |\n| 1 | 2 | 3 |')
    expect(t?.header).toEqual(['a', 'b', 'c'])
    expect(t?.align).toEqual(['left', 'center', 'right'])
    expect(t?.rows).toEqual([['1', '2', '3']])
  })

  it('默认对齐为 null', () => {
    const t = parseMarkdownTable('| a |\n| --- |\n| 1 |')
    expect(t?.align).toEqual([null])
  })

  it('分隔行非法返回 null', () => {
    expect(parseMarkdownTable('| a |\n| xx |\n| 1 |')).toBeNull()
    expect(parseMarkdownTable('只有一行')).toBeNull()
  })
})

describe('smartPasteUrl 智能粘贴', () => {
  it('选中文字 + URL → 链接', () => {
    expect(smartPasteUrl('官网', 'https://example.com')).toBe('[官网](https://example.com)')
  })

  it('非纯 URL 不处理', () => {
    expect(smartPasteUrl('文字', '只是文本')).toBeNull()
    expect(smartPasteUrl('文字', 'https://a.com 和其他内容')).toBeNull()
  })

  it('无选区不处理', () => {
    expect(smartPasteUrl('', 'https://example.com')).toBeNull()
  })
})
