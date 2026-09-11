import { describe, expect, it } from 'vitest'
import { EditorSelection } from '@codemirror/state'
import { Decoration } from '@codemirror/view'
import type { Range } from '@codemirror/state'
import type { WidgetType } from '@codemirror/view'
import { createEditorState } from '@yupmark/live-cm/extensions'
import { buildLiveDecorations } from '@yupmark/live-cm/rules'
import { computeActiveSet, findGapAnchor, nearestBlock, topLevelBlocks } from '@yupmark/live-cm/blocks'
import { CheckboxWidget, HrWidget, ImageWidget } from '@yupmark/live-cm/widgets'
import { dirname, resolveRelPath } from '@yupmark/live-cm/paths'
import { resolveImgSrc } from '@yupmark/live-cm/engine-img'

/** 把隐藏装饰（无 class 无 widget 的 replace）对应的文档文本抽出来，便于断言"哪些符号被隐藏" */
function hiddenTexts(decos: Range<Decoration>[], doc: string): string[] {
  return decos
    .filter((d) => d.value.spec.class === undefined && d.value.spec.widget === undefined)
    .map((d) => doc.slice(d.from, d.to))
}

/** 替换型（Widget）装饰实例 */
function widgetInstances(decos: Range<Decoration>[]): WidgetType[] {
  return decos
    .filter((d) => d.value.spec.widget != null)
    .map((d) => d.value.spec.widget as WidgetType)
}

/** mark/line 装饰类名列表 */
function markClasses(decos: Range<Decoration>[]): string[] {
  return decos
    .filter((d) => typeof d.value.spec.class === 'string')
    .map((d) => String(d.value.spec.class))
}

// ---------------------------------------------------------------------------
// 块模型
// ---------------------------------------------------------------------------
describe('topLevelBlocks', () => {
  const doc = '# H\n\ntext\n\n- a\n- b\n\n> quote\n\n```js\ncode\n```'
  const state = createEditorState(doc)
  const blocks = topLevelBlocks(state)

  it('按顺序产出顶层块', () => {
    expect(blocks.map((b) => b.name)).toEqual([
      'ATXHeading1',
      'Paragraph',
      'ListItem',
      'ListItem',
      'Blockquote',
      'FencedCode',
    ])
  })

  it('列表展开到列表项粒度', () => {
    const itemA = doc.indexOf('- a')
    const itemB = doc.indexOf('- b')
    expect(blocks[2]).toMatchObject({ from: itemA })
    expect(blocks[3]).toMatchObject({ from: itemB })
  })

  it('nearestBlock 取最内层包含块', () => {
    const itemA = doc.indexOf('- a')
    expect(nearestBlock(blocks, itemA + 3)?.from).toBe(itemA)
    // 块间空行不属于任何块
    const hEnd = doc.indexOf('\n')
    expect(nearestBlock(blocks, hEnd + 1)).toBeNull()
  })
})

describe('computeActiveSet', () => {
  const doc = 'para one\n\npara two'
  const blocks = topLevelBlocks(createEditorState(doc))

  it('光标所在块活跃', () => {
    const active = computeActiveSet(blocks, [EditorSelection.range(2, 2)])
    expect(active.has(blocks[0])).toBe(true)
    expect(active.has(blocks[1])).toBe(false)
  })

  it('块边界（首尾）算活跃', () => {
    const head = blocks[0]
    const active = computeActiveSet(blocks, [EditorSelection.range(head.to, head.to)])
    expect(active.has(head)).toBe(true)
  })

  it('跨块选区使所有相交块活跃', () => {
    const active = computeActiveSet(blocks, [EditorSelection.range(1, doc.length)])
    expect(active.size).toBe(2)
  })

  it('额外范围（IME 冻结）强制活跃', () => {
    const active = computeActiveSet(blocks, [EditorSelection.range(doc.length, doc.length)], [
      { from: 0, to: 4 },
    ])
    expect(active.has(blocks[0])).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 逐语法隐藏规则（黄金样例：光标放在文末段落，其余块均非活跃）
// ---------------------------------------------------------------------------
describe('live decorations 逐语法', () => {
  const doc = [
    '# Title',
    '',
    '**bold** *it* ~~strike~~ `code`',
    '',
    '[text](https://example.com)',
    '',
    '![alt](pic.png)',
    '',
    '> quoted',
    '',
    '- a',
    '- [ ] todo',
    '- [x] done',
    '',
    '1. first',
    '',
    '---',
    '',
    '```js',
    'x',
    '```',
    '',
    'END',
  ].join('\n')

  function buildAt(anchor: number) {
    const state = createEditorState(doc, anchor)
    const decos = buildLiveDecorations(state)
    return { state, decos, hidden: hiddenTexts(decos, doc) }
  }

  it('光标在文末：所有语法按规则隐藏/替换', () => {
    const { decos, hidden } = buildAt(doc.indexOf('END'))
    expect(hidden).toContain('# ') // 标题井号+空格
    expect(hidden).toContain('**')
    expect(hidden).toContain('*')
    expect(hidden).toContain('~~')
    expect(hidden).toContain('`')
    expect(hidden).toEqual(expect.arrayContaining(['[', '](https://example.com)']))
    expect(hidden).toContain('> ')
    // 图片整体替换
    const widgets = widgetInstances(decos)
    expect(widgets.filter((w): w is ImageWidget => w instanceof ImageWidget)).toHaveLength(1)
    // 任务列表：两个复选框，一个选中
    const boxes = widgets.filter((w): w is CheckboxWidget => w instanceof CheckboxWidget)
    expect(boxes.map((w) => w.checked).sort()).toEqual([false, true])
    // HR 替换
    expect(widgets.filter((w): w is HrWidget => w instanceof HrWidget)).toHaveLength(1)
    // 有序列表编号不隐藏
    expect(hidden).not.toContain('1.')
  })

  it('光标进入段落：该段落语法全部显示，其他块仍渲染', () => {
    const paraStart = doc.indexOf('**bold**')
    const { hidden } = buildAt(paraStart + 3)
    expect(hidden).not.toContain('**')
    expect(hidden).toContain('# ')
    expect(hidden).toContain('> ')
  })

  it('光标进入标题：显示 #', () => {
    const { hidden } = buildAt(1)
    expect(hidden).not.toContain('# ')
    expect(hidden).toContain('**')
  })

  it('链接文字带样式类', () => {
    const { decos } = buildAt(doc.indexOf('END'))
    expect(markClasses(decos)).toContain('cm-link-text')
  })

  it('代码块围栏不隐藏且有行样式', () => {
    const { decos, hidden } = buildAt(doc.indexOf('END'))
    expect(hidden).not.toContain('```')
    const classes = markClasses(decos)
    expect(classes.some((c) => c.includes('cm-code-line'))).toBe(true)
    expect(classes.some((c) => c.includes('cm-h1'))).toBe(true)
  })

  it('装饰区间有序且合法（DecorationSet 构建不抛错）', () => {
    const { decos } = buildAt(doc.indexOf('END'))
    expect(decos.length).toBeGreaterThan(10)
  })
})

// ---------------------------------------------------------------------------
// 活动单元：列表项粒度
// ---------------------------------------------------------------------------
describe('列表项活动粒度', () => {
  const doc = '- a\n- b\n- c\n\nEND'
  it('光标在 b 项：符号仍替换为圆点（Typora 式编辑态不退回源码）', () => {
    const pos = doc.indexOf('b')
    const state = createEditorState(doc, pos)
    const decos = buildLiveDecorations(state)
    // b 项的 ListMark（doc[pos-2]='-'）与 a/c 一样始终被替换渲染
    const touched = decos
      .filter((d) => d.from !== d.to)
      .map((d) => [d.from, d.to])
      .filter(([f, t]) => f <= pos - 2 && t >= pos - 2)
    expect(touched).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Typora 式渲染态编辑：标记淡显（cm-mark-dim）
// ---------------------------------------------------------------------------
describe('标记淡显（活跃块渲染态编辑）', () => {
  it('光标在标题内：# 淡显而非隐藏', () => {
    const state = createEditorState('# 标题\n\n正文', 1)
    const decos = buildLiveDecorations(state)
    expect(markClasses(decos)).toContain('cm-mark-dim')
  })

  it('光标离开标题：# 恢复隐藏、无淡显', () => {
    const state = createEditorState('# 标题\n\n正文', 6)
    const decos = buildLiveDecorations(state)
    expect(markClasses(decos)).not.toContain('cm-mark-dim')
  })

  it('行内标记就近揭示：光标在粗体内 ** 淡显，同块其他位置隐藏', () => {
    const doc = '前缀 **bold** 后缀\n\nEND'
    const inside = buildLiveDecorations(createEditorState(doc, doc.indexOf('bold') + 1))
    expect(markClasses(inside)).toContain('cm-mark-dim')
    expect(markClasses(inside)).toContain('cm-strong')

    const outside = buildLiveDecorations(createEditorState(doc, doc.indexOf('后缀')))
    // 同一块但选区不在粗体跨度内：样式保留、标记隐藏
    expect(markClasses(outside)).toContain('cm-strong')
    expect(markClasses(outside)).not.toContain('cm-mark-dim')
  })
})

// ---------------------------------------------------------------------------
// 空闲锚点：打开文件即全渲染
// ---------------------------------------------------------------------------
describe('findGapAnchor 空闲锚点', () => {
  it('文件以换行结尾 → 锚点在文末空隙', () => {
    const doc = '# H\n\nbody\n'
    const anchor = findGapAnchor(createEditorState(doc))
    expect(anchor).toBe(doc.length)
    expect(nearestBlock(topLevelBlocks(createEditorState(doc)), anchor)).toBeNull()
  })

  it('文末无换行 → 锚点落在块间空隙', () => {
    const doc = '# H\n\nbody'
    const anchor = findGapAnchor(createEditorState(doc))
    expect(anchor).toBe(4) // 第一块末尾下一行（空行）
    expect(nearestBlock(topLevelBlocks(createEditorState(doc)), anchor)).toBeNull()
  })

  it('锚点位置上全部块均为渲染态（无隐藏装饰产出）', () => {
    const doc = '# H\n\n**bold** body'
    const state = createEditorState(doc, findGapAnchor(createEditorState(doc)))
    const decos = buildLiveDecorations(state)
    expect(hiddenTexts(decos, doc)).toContain('# ')
    expect(hiddenTexts(decos, doc)).toContain('**')
  })

  it('空文档与单块文档回退文末', () => {
    expect(findGapAnchor(createEditorState(''))).toBe(0)
    expect(findGapAnchor(createEditorState('only paragraph'))).toBe('only paragraph'.length)
  })
})

// ---------------------------------------------------------------------------
// 图片路径解析
// ---------------------------------------------------------------------------
describe('图片 src 解析', () => {
  it('相对路径基于文档目录解析为 yup-file 协议', () => {
    expect(resolveImgSrc('pic.png', '/Users/x/docs')).toBe(
      `yup-file://md/${encodeURIComponent('/Users/x/docs/pic.png')}`,
    )
    expect(resolveImgSrc('../img/a b.png', '/Users/x/docs/sub')).toBe(
      `yup-file://md/${encodeURIComponent('/Users/x/docs/img/a b.png')}`,
    )
  })

  it('绝对 URL 原样保留', () => {
    expect(resolveImgSrc('https://a.com/x.png', '/any')).toBe('https://a.com/x.png')
    expect(resolveImgSrc('data:image/png;base64,xxx', '/any')).toBe('data:image/png;base64,xxx')
  })

  it('无文档目录时原样返回', () => {
    expect(resolveImgSrc('pic.png', null)).toBe('pic.png')
  })

  it('dirname / resolveRelPath', () => {
    expect(dirname('/a/b/c.md')).toBe('/a/b')
    expect(dirname('c.md')).toBe('')
    expect(resolveRelPath('/a/b', 'c.png')).toBe('/a/b/c.png')
    expect(resolveRelPath('/a/b', '../c.png')).toBe('/a/c.png')
    expect(resolveRelPath('C:\\docs', './x.png')).toBe('C:/docs/x.png')
  })
})
