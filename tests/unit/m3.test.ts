import { describe, expect, it } from 'vitest'
import { syntaxTree } from '@codemirror/language'
import { RangeSet } from '@codemirror/state'
import { createEditorState } from '@yupmark/live-cm/extensions'
import { buildLiveDecorations } from '@yupmark/live-cm/rules'
import { revealAnchorAt } from '@yupmark/live-cm/engine'
import { MathSplitWidget, MathWidget, MermaidSplitWidget, MermaidWidget, TableWidget } from '@yupmark/live-cm/widgets'
import { parseMarkdownTable } from '@yupmark/live-cm/table'
import { smartPasteUrl } from '@yupmark/live-cm/smartPaste'
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

describe('点击渲染结果进入编辑（revealAnchorAt）', () => {
  it('行内公式：pos 落在替换区间或边界 → 返回严格内部的锚点', () => {
    const doc = 'math $x_1$ here\n\nEND'
    // 光标在文档末尾：行内公式保持 Widget 渲染，区间 [5,10)
    const decos = RangeSet.of(buildLiveDecorations(createEditorState(doc, doc.length)))
    expect(revealAnchorAt(decos, 7)).toBe(7) // 区间内 → 原位
    expect(revealAnchorAt(decos, 5)).toBe(6) // 左边界 → 内收一格
    expect(revealAnchorAt(decos, 10)).toBe(9) // 右边界 → 内收一格
  })

  it('非公式/图表区间返回 null；表格替换区间不代管（有自己的单元格编辑）', () => {
    const plain = RangeSet.of(buildLiveDecorations(createEditorState('plain text', 3)))
    expect(revealAnchorAt(plain, 3)).toBeNull()

    const doc = '| a | b |\n| --- | --- |\n| 1 | 2 |\n'
    const decos = RangeSet.of(buildLiveDecorations(createEditorState(doc, doc.length)))
    const table = widgetsOf(buildLiveDecorations(createEditorState(doc, doc.length)), TableWidget)
    expect(table).toHaveLength(1) // 表格整块替换为 TableWidget
    const t = decos.iter()
    let tableRange: { from: number; to: number } | null = null
    while (t.value) {
      if (t.value.spec.widget instanceof TableWidget) tableRange = { from: t.from, to: t.to }
      t.next()
    }
    expect(tableRange).not.toBeNull()
    // pos 落在表格替换区间内：revealAnchorAt 不接管（表格点击走单元格编辑）
    const mid = Math.floor(((tableRange?.from ?? 0) + (tableRange?.to ?? 0)) / 2)
    expect(revealAnchorAt(decos, mid)).toBeNull()
  })
})

describe('分栏块级编辑（splitBlocks 选项，桌面专用）', () => {
  it('块级数学始终产出 MathSplitWidget（携带源码与区间）', () => {
    const doc = '$$\nE=mc^2\n$$\n\nEND'
    const decos = buildLiveDecorations(createEditorState(doc, doc.length), [], undefined, { splitBlocks: true })
    const splits = decos.filter((d) => d.value.spec.widget instanceof MathSplitWidget)
    expect(splits).toHaveLength(1)
    const w = splits[0]!.value.spec.widget as MathSplitWidget
    expect(w.tex).toBe('E=mc^2')
    expect(w.from).toBe(0)
  })

  it('mermaid 始终产出 MermaidSplitWidget；缺省路径保持传统 Widget（TUI 语义不变）', () => {
    const doc = '```mermaid\ngraph TD\nA-->B\n```\n\nEND'
    const split = buildLiveDecorations(createEditorState(doc, doc.length), [], undefined, { splitBlocks: true })
    expect(split.filter((d) => d.value.spec.widget instanceof MermaidSplitWidget)).toHaveLength(1)

    const legacy = buildLiveDecorations(createEditorState(doc, doc.length))
    expect(legacy.filter((d) => d.value.spec.widget instanceof MermaidWidget)).toHaveLength(1)
    expect(legacy.filter((d) => d.value.spec.widget instanceof MermaidSplitWidget)).toHaveLength(0)
  })
})
