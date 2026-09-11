// MT3a 单测：查找替换纯函数 / 视图三件套（内核 StateEffect 无头切换）/ 行号与高亮装配
import { describe, expect, it } from 'vitest'
import { findMatches, nearestMatch, stepMatch, replaceCurrent, replaceAll, initialSearch } from '../src/editor/search'
import { EditorSession } from '../src/editor/session'
import { layoutViewport } from '../src/editor/layout'
import {
  setSourceMode,
  setFocusMode,
  sourceModeField,
  focusModeField,
} from '@yupmark/live-cm/viewModes'

describe('查找替换（纯函数）', () => {
  const doc = 'foo bar foo\nbaz foo'

  it('findMatches 大小写不敏感 + 全量命中', () => {
    expect(findMatches(doc, 'foo')).toEqual([
      { from: 0, to: 3 },
      { from: 8, to: 11 },
      { from: 16, to: 19 },
    ])
    expect(findMatches(doc, 'FOO')).toHaveLength(3)
    expect(findMatches(doc, '')).toEqual([])
    expect(findMatches(doc, '不存在')).toEqual([])
  })

  it('nearestMatch / stepMatch 循环导航', () => {
    const m = findMatches(doc, 'foo')
    expect(nearestMatch(m, 9)).toBe(1)
    expect(stepMatch(m, 2, 1)).toBe(0)
    expect(stepMatch(m, 0, -1)).toBe(2)
    expect(stepMatch([], 0, 1)).toBe(-1)
  })

  it('replaceCurrent：替换当前并重算命中', () => {
    const state = { ...initialSearch, query: 'foo', replacement: 'qux', matches: findMatches(doc, 'foo'), idx: 1 }
    const r = replaceCurrent(doc, state)
    expect(r?.doc).toBe('foo bar qux\nbaz foo')
    expect(r?.nextIdx).toBeGreaterThanOrEqual(0)
  })

  it('replaceAll：全部替换计数', () => {
    const r = replaceAll(doc, 'foo', 'x')
    expect(r).toEqual({ doc: 'x bar x\nbaz x', count: 3 })
    expect(replaceAll(doc, '无', 'x')).toBeNull()
    expect(replaceAll(doc, '', 'x')).toBeNull()
  })
})

describe('视图三件套（内核 StateField 无头切换）', () => {
  const doc = '# 标题\n\n- 列表\n\n> 引用\n\n正文一段文字。\n'

  function session(): EditorSession {
    return new EditorSession(null, doc, doc.length)
  }

  it('源码模式：dispatch Effect 后标记可见 + 行号槽出现', () => {
    const s = session()
    s.dispatch({ effects: setSourceMode.of(true) })
    expect(s.state.field(sourceModeField)).toBe(true)
    const rows = layoutViewport(s.state, { width: 50, height: 12, firstLine: 1, cursorPos: doc.length }).rows
    // 行号出现在首个视觉行
    expect(rows.some((r) => r.lineNo === 1)).toBe(true)
    expect(rows.some((r) => r.lineNo === 3)).toBe(true)
    // 源码标记（# / >）以文本形式出现
    const text = rows.map((r) => r.segments.map((x) => x.text).join('')).join('\n')
    expect(text).toContain('# 标题')
    expect(text).toContain('> 引用')
    // 行号不挤占内容：正文行仍完整
    expect(text).toContain('正文一段文字')
  })

  it('专注模式：非活跃块淡化（cm-focus-dim → dim 样式）', () => {
    const s = session()
    const cursorInQuote = doc.indexOf('引用')
    s.dispatch({ selection: { anchor: cursorInQuote } })
    s.dispatch({ effects: setFocusMode.of(true) })
    expect(s.state.field(focusModeField)).toBe(true)
    const rows = layoutViewport(s.state, { width: 50, height: 12, firstLine: 1, cursorPos: cursorInQuote }).rows
    // 标题行（非活跃）应有 dim 样式段
    const headingRow = rows.find((r) => r.segments.some((x) => x.text.includes('标题')))
    expect(headingRow?.segments.some((x) => x.style.dim === true)).toBe(true)
  })

  it('搜索高亮：当前命中反色、其余下划线', () => {
    const s = session()
    const from = doc.indexOf('正文')
    const rows = layoutViewport(s.state, {
      width: 50,
      height: 12,
      firstLine: 1,
      cursorPos: 0,
      highlights: [
        { from, to: from + 2, current: true },
        { from: doc.indexOf('标题'), to: doc.indexOf('标题') + 2, current: false },
      ],
    }).rows
    const hitRow = rows.find((r) => r.segments.some((x) => x.style.inverse && x.text.includes('正')))
    expect(hitRow).toBeDefined()
    const otherRow = rows.find((r) => r.segments.some((x) => x.style.underline))
    expect(otherRow).toBeDefined()
  })
})
