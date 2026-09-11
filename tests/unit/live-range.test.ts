// buildLiveDecorations 区间装配等价性（MT1 TUI 性能优化的内核正确性护栏）：
// 给定 range 时，产出必须与全量计算在 range 内完全一致（TUI 视口渲染依赖此契约）。
import { describe, expect, it } from 'vitest'
import { Decoration } from '@codemirror/view'
import type { Range } from '@codemirror/state'
import { createEditorState } from '@yupmark/live-cm/extensions'
import { buildLiveDecorations } from '@yupmark/live-cm/rules'

const doc = [
  '# H1',
  '',
  'para **bold** `code` [link](https://a.b)',
  '',
  '- item a',
  '- [x] done',
  '',
  '> quote line',
  '',
  '| a | b |',
  '| --- | --- |',
  '| 1 | 2 |',
  '',
  '$$e=mc^2$$',
  '',
  '---',
  '',
  '```js',
  'const x = 1',
  '```',
  '',
  '尾段 ordinary',
].join('\n')

interface Deco {
  from: number
  to: number
  class?: string
  widget: boolean
}

const normalize = (decos: Range<Decoration>[]): Deco[] =>
  decos
    .map((d) => ({
      from: d.from,
      to: d.to,
      class: d.value.spec.class as string | undefined,
      widget: d.value.spec.widget != null,
    }))
    .sort((a, b) => a.from - b.from || a.to - b.to)

/** 落在 [range] 内的装饰子集（全量口径） */
const clip = (decos: Deco[], from: number, to: number): Deco[] =>
  decos.filter((d) => d.to >= from && d.from <= to)

describe('buildLiveDecorations range 参数', () => {
  const state = createEditorState(doc)
  const full = normalize(buildLiveDecorations(state))

  const slices: [string, { from: number; to: number }][] = [
    ['头部（标题+段落）', { from: 0, to: doc.indexOf('- item a') }],
    ['中部（列表+引用+表格）', { from: doc.indexOf('- item a'), to: doc.indexOf('$$e=mc^2$$') }],
    ['尾部（代码块+尾段）', { from: doc.indexOf('```js'), to: doc.length }],
  ]

  for (const [name, range] of slices) {
    it(`区间[${name}]：与区间相交的装饰和全量完全一致`, () => {
      const partial = normalize(buildLiveDecorations(state, [], range))
      expect(clip(partial, range.from, range.to)).toEqual(clip(full, range.from, range.to))
    })

    it(`区间[${name}]：产出是全量的子集（按节点粒度切割，允许边界节点溢出）`, () => {
      const partial = normalize(buildLiveDecorations(state, [], range))
      const key = (d: Deco): string => JSON.stringify(d)
      const fullKeys = new Set(full.map(key))
      for (const d of partial) expect(fullKeys.has(key(d)), key(d)).toBe(true)
      expect(partial.length).toBeLessThan(full.length)
    })
  }
})
