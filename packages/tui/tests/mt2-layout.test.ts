// MT2 布局块装配单测：表格网格/块级数学/占位框/HR 进视口、光标进入显源码、代码高亮
import { describe, expect, it } from 'vitest'
import { docState } from '../src/state'
import { layoutViewport } from '../src/editor/layout'

function rowText(row: { segments: { text: string }[] }): string {
  return row.segments.map((s) => s.text).join('')
}

const doc = [
  '# 表格与公式',
  '',
  '| 名称 | 数量 |',
  '| --- | ---: |',
  '| 苹果 | 3 |',
  '',
  '$$e=mc^2$$',
  '',
  '$e=mc^2$ 行内公式',
  '',
  '```js',
  'const x = 1 // 注释',
  "const s = 'str'",
  '```',
  '',
  '---',
  '',
  '![示意图](./img/a.png)',
  '',
  '```mermaid',
  'flowchart TD',
  '  A-->B',
  '```',
  '',
  '（收尾段落，让光标所在块不在特殊块内）',
].join('\n')

describe('layoutViewport MT2 块装配', () => {
  function layoutOf(anchor: number, width = 60, height = 30) {
    return layoutViewport(docState(doc, anchor), { width, height, firstLine: 1, cursorPos: anchor })
  }

  it('表格渲染为 box 网格（表头含名称/数量）', () => {
    const { rows } = layoutOf(doc.length)
    const all = rows.map(rowText)
    expect(all.some((r) => /^┌/.test(r))).toBe(true)
    expect(all.some((r) => r.includes('名称') && r.includes('数量'))).toBe(true)
    expect(all.some((r) => r.includes('苹果'))).toBe(true)
    // 表格源码（竖线分隔）不应以源码形态出现
    expect(all.some((r) => /^\| 名称/.test(r))).toBe(false)
  })

  it('光标进入表格 → 显源码（竖线可见）', () => {
    const anchor = doc.indexOf('苹果')
    const { rows } = layoutOf(anchor)
    const all = rows.map(rowText)
    expect(all.some((r) => r.includes('|') && r.includes('苹果'))).toBe(true)
  })

  it('块级数学 Unicode 近似居中，行内数学近似', () => {
    const { rows } = layoutOf(doc.length)
    const all = rows.map(rowText)
    expect(all.some((r) => r.includes('e=mc²') && /^ +e=mc²/.test(r))).toBe(true) // 块级居中
    expect(all.some((r) => r.includes('e=mc² 行内公式'))).toBe(true)
  })

  it('HR 渲染为横线，图片/mermaid 为占位框', () => {
    const { rows } = layoutOf(doc.length)
    const all = rows.map(rowText)
    expect(all.some((r) => /^─+$/.test(r))).toBe(true)
    expect(all.some((r) => r.includes('▣') && r.includes('示意图'))).toBe(true)
    expect(all.some((r) => r.includes('▶ mermaid · 流程图'))).toBe(true)
  })

  it('代码块行获得 token 着色（关键字/字符串/注释有颜色）', () => {
    const { rows } = layoutOf(doc.length)
    const codeRow = rows.find((r) => rowText(r).includes('const x = 1'))
    expect(codeRow).toBeDefined()
    const colored = codeRow!.segments.filter((s) => s.style.color !== undefined)
    expect(colored.length).toBeGreaterThan(0)
    // 注释段为灰色斜体
    const comment = codeRow!.segments.find((s) => s.text.includes('注释'))
    expect(comment?.style.color).toBe('gray')
  })
})
