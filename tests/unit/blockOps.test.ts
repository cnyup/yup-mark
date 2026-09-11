import { describe, expect, it } from 'vitest'
import { clearInlineMarks, lineKind, shiftHeading, transformLine, transformLines } from '@yupmark/live-cm/blockOps'

describe('lineKind', () => {
  it('识别各类前缀', () => {
    expect(lineKind('正文')).toBe('paragraph')
    expect(lineKind('## 标题')).toBe('h2')
    expect(lineKind('> 引用')).toBe('quote')
    expect(lineKind('1. 第一')).toBe('ol')
    expect(lineKind('- 无序')).toBe('ul')
    expect(lineKind('- [ ] 任务')).toBe('task')
    expect(lineKind('- [x] 完成')).toBe('task')
  })
})

describe('transformLine', () => {
  it('应用标题前缀', () => {
    expect(transformLine('标题', 'h1')).toBe('# 标题')
    expect(transformLine('标题', 'h3')).toBe('### 标题')
  })

  it('切换前先剥离旧前缀', () => {
    expect(transformLine('## 标题', 'h1')).toBe('# 标题')
    expect(transformLine('> 引用文字', 'ul')).toBe('- 引用文字')
  })

  it('同类型再应用 = 切回正文', () => {
    expect(transformLine('## 标题', 'h2')).toBe('标题')
    expect(transformLine('- [ ] 任务', 'task')).toBe('任务')
  })

  it('有序列表按序编号', () => {
    expect(transformLine('条目', 'ol', 2)).toBe('3. 条目')
  })
})

describe('shiftHeading', () => {
  it('标题级别 ±1 并夹紧 1-6（Typora ⌘= / ⌘-）', () => {
    expect(shiftHeading('# 标题', 1)).toBe('## 标题')
    expect(shiftHeading('### 标题', -1)).toBe('## 标题')
    expect(shiftHeading('###### 标题', 1)).toBe('###### 标题')
    expect(shiftHeading('# 标题', -1)).toBe('# 标题')
    expect(shiftHeading('## 标题', 4)).toBe('###### 标题')
  })

  it('非标题行原样返回', () => {
    expect(shiftHeading('正文', 1)).toBe('正文')
    expect(shiftHeading('- 列表项', 1)).toBe('- 列表项')
    expect(shiftHeading('#无空格不是标题', 1)).toBe('#无空格不是标题')
  })
})

describe('transformLines', () => {
  it('多行有序列表连续编号', () => {
    expect(transformLines(['a', 'b', 'c'], 'ol')).toEqual(['1. a', '2. b', '3. c'])
  })

  it('空行保持不动', () => {
    expect(transformLines(['a', '', 'b'], 'ul')).toEqual(['- a', '', '- b'])
  })

  it('批量降级为正文', () => {
    expect(transformLines(['# a', '- b', '> c'], 'paragraph')).toEqual(['a', 'b', 'c'])
  })
})

describe('clearInlineMarks', () => {
  it('去掉加粗/斜体/删除线/行内代码标记', () => {
    expect(clearInlineMarks('**b** *i* ~~d~~ `c`')).toBe('b i d c')
  })
})
