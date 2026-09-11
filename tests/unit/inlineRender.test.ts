// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderInlineMarkdown } from '@yupmark/live-cm/inlineRender'
import { alignFromDelimiter } from '@yupmark/live-cm/table'

describe('renderInlineMarkdown 单元格行内渲染', () => {
  function render(text: string): HTMLElement {
    const el = document.createElement('div')
    renderInlineMarkdown(el, text)
    return el
  }

  it('普通文本直接输出', () => {
    const el = render('普通文字')
    expect(el.textContent).toBe('普通文字')
    expect(el.children).toHaveLength(0)
  })

  it('加粗/斜体/删除线/行内代码', () => {
    const el = render('**b** *i* ~~d~~ `c`')
    expect(el.querySelector('strong')?.textContent).toBe('b')
    expect(el.querySelector('em')?.textContent).toBe('i')
    expect(el.querySelector('del')?.textContent).toBe('d')
    expect(el.querySelector('code')?.textContent).toBe('c')
    expect(el.textContent).toBe('b i d c')
  })

  it('链接渲染为 a 元素', () => {
    const el = render('看 [文档](https://example.com) 吧')
    const a = el.querySelector('a')
    expect(a?.textContent).toBe('文档')
    expect(a?.getAttribute('href')).toBe('https://example.com')
  })

  it('混合文本顺序保持', () => {
    const el = render('前**中**后')
    expect(el.textContent).toBe('前中后')
  })
})

describe('alignFromDelimiter', () => {
  it('三种对齐', () => {
    expect(alignFromDelimiter('| :- | :-: | -: |')).toEqual(['left', 'center', 'right'])
  })

  it('非法分隔行 → 全部默认对齐', () => {
    expect(alignFromDelimiter('| xx | yy |')).toEqual([null, null])
  })
})
